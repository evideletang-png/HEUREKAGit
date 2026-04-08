/**
 * PLU Auto-Fetch Service
 * Last-resort retrieval when Base IA has no indexed content for a commune.
 *
 * Tier order:
 *   1. Géoportail de l'Urbanisme (GPU) — official source, curl-only (WAF bypass)
 *   2. data.gouv.fr REST API       — open data fallback
 *
 * Returns raw text immediately for the current analysis while triggering
 * background embedding so subsequent analyses use the cache.
 */

import { execSync } from "child_process";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { db, baseIADocumentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { GPUProviderService } from "./gpuProviderService.js";
import { processDocumentForRAG } from "./baseIAIngestion.js";
import { persistDocumentKnowledgeProfile } from "./documentKnowledgeService.js";
import { persistRegulatoryUnitsForDocument } from "./regulatoryUnitService.js";
import { persistRegulatoryZoneSectionsForDocument } from "./regulatoryZoneSectionService.js";
import { persistUrbanRulesForDocument } from "./urbanRuleExtractionService.js";
import { VisionService } from "./visionService.js";
import { townHallDocumentsTable } from "../../../../packages/db/src/schema/townHallDocuments.js";
import { townHallDocumentFilesTable } from "../../../../packages/db/src/schema/townHallDocumentFiles.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function curlDownload(url: string, dest: string): boolean {
  try {
    execSync(
      `curl -s -L -k --max-time 60 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -o "${dest}" "${url}"`,
      { timeout: 65000 }
    );
    const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    return size > 5000;
  } catch {
    return false;
  }
}

async function extractPDFText(filePath: string): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const buffer = fs.readFileSync(filePath);
    const result = await pdfParse(buffer);
    return result.text || "";
  } catch {
    return "";
  }
}

function classifyDocType(fileName: string): "plu_reglement" | "oap" | "plu_annexe" | "other" {
  const n = fileName.toLowerCase();
  if (n.includes("reglement") && !n.includes("graphique")) return "plu_reglement";
  if (n.includes("padd") || n.includes("oap") || n.includes("orientation")) return "oap";
  if (n.includes("annexe") || n.includes("ppri") || n.includes("servitude")) return "plu_annexe";
  return "other";
}

function authorityFor(docType: string): number {
  if (docType === "plu_reglement") return 9;
  if (docType === "oap") return 8;
  if (docType === "plu_annexe") return 6;
  return 5;
}

// ─── Fetched result ───────────────────────────────────────────────────────────

export interface FetchedPLUDoc {
  rawText: string;
  fileName: string;
  docType: "plu_reglement" | "oap" | "plu_annexe" | "other";
  source: "gpu" | "datagouv";
}

// ─── Tier 1: GPU ─────────────────────────────────────────────────────────────

async function fetchFromGPU(inseeCode: string): Promise<FetchedPLUDoc[]> {
  logger.info(`[PLUAutoFetch] Trying GPU for INSEE ${inseeCode}`);
  const results: FetchedPLUDoc[] = [];

  try {
    const docs = await GPUProviderService.getDocumentsByInsee(inseeCode);
    const ACTIVE_STATUSES = ["production", "opposable", "approuve", "en_vigueur"];
    let active = docs.filter(d => d.status && ACTIVE_STATUSES.some(s => d.status.toLowerCase().includes(s))).slice(0, 3);
    if (active.length === 0 && docs.length > 0) active = docs.slice(0, 3); // fallback: take whatever GPU returns
    if (active.length === 0) {
      logger.warn(`[PLUAutoFetch] GPU: no active document for ${inseeCode}`);
      return [];
    }

    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    for (const doc of active) {
      const files = await GPUProviderService.getFilesByDocumentId(doc.id);

      // Prioritise règlement écrit → PADD → OAP → others (max 3 text files per document)
      const prioritised = [
        files.find(f => f.name.toLowerCase().includes("reglement") && !f.name.toLowerCase().includes("graphique")),
        files.find(f => f.name.toLowerCase().includes("padd")),
        files.find(f => f.name.toLowerCase().includes("oap")),
        ...files.filter(f => !f.name.toLowerCase().includes("graphique") && !f.name.toLowerCase().includes("zonage")),
      ].filter((f, i, arr) => f && arr.indexOf(f) === i).slice(0, 4) as typeof files;

      for (const file of prioritised) {
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const destPath = path.join(UPLOADS_DIR, safeFilename);
        const ok = curlDownload(file.url, destPath);
        if (!ok) { logger.warn(`[PLUAutoFetch] GPU download failed: ${file.name}`); continue; }

        let rawText = await extractPDFText(destPath);
        // Scanned PDF fallback: use Vision OCR if pdf-parse returned nothing
        if (rawText.length < 200) {
          logger.info(`[PLUAutoFetch] PDF has little text, trying Vision OCR: ${file.name}`);
          rawText = await VisionService.extractTextFromScannedPDF(destPath, 5);
        }
        if (rawText.length < 200) { logger.warn(`[PLUAutoFetch] GPU: no text even after OCR in ${file.name}`); continue; }

        logger.info(`[PLUAutoFetch] GPU ✅ ${file.name} (${rawText.length} chars)`);
        results.push({ rawText, fileName: safeFilename, docType: classifyDocType(file.name), source: "gpu" });
      }

      if (results.length >= 2) break; // Enough text for analysis
    }
  } catch (err) {
    logger.error("[PLUAutoFetch] GPU fetch error:", err);
  }

  return results;
}

// ─── Tier 2: data.gouv.fr ─────────────────────────────────────────────────────

async function fetchFromDataGouv(inseeCode: string, communeName: string): Promise<FetchedPLUDoc[]> {
  logger.info(`[PLUAutoFetch] Trying data.gouv.fr for ${communeName} (${inseeCode})`);
  const results: FetchedPLUDoc[] = [];

  try {
    const query = encodeURIComponent(`PLU règlement ${communeName} ${inseeCode}`);
    const apiUrl = `https://www.data.gouv.fr/api/1/datasets/?q=${query}&page_size=5`;

    const raw = execSync(
      `curl -s --max-time 15 -A "Mozilla/5.0" -H "Accept: application/json" "${apiUrl}"`,
      { maxBuffer: 2 * 1024 * 1024, timeout: 20000 }
    ).toString().trim();

    if (!raw || raw.startsWith("<!")) {
      logger.warn("[PLUAutoFetch] data.gouv.fr: no response or HTML block");
      return [];
    }

    const json = JSON.parse(raw);
    const datasets: any[] = json.data || [];

    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    for (const dataset of datasets.slice(0, 3)) {
      const resources: any[] = dataset.resources || [];
      const pdfs = resources.filter((r: any) =>
        r.format?.toLowerCase() === "pdf" ||
        (r.url || "").toLowerCase().endsWith(".pdf")
      );

      for (const resource of pdfs.slice(0, 2)) {
        if (!resource.url) continue;
        const safeFilename = `datagouv_${inseeCode}_${resource.id || Math.random().toString(36).slice(2)}.pdf`;
        const destPath = path.join(UPLOADS_DIR, safeFilename);
        const ok = curlDownload(resource.url, destPath);
        if (!ok) continue;

        const rawText = await extractPDFText(destPath);
        if (rawText.length < 200) continue;

        const title = resource.title || dataset.title || safeFilename;
        logger.info(`[PLUAutoFetch] data.gouv.fr ✅ ${title} (${rawText.length} chars)`);
        results.push({ rawText, fileName: safeFilename, docType: classifyDocType(title), source: "datagouv" });
        if (results.length >= 2) return results;
      }
    }
  } catch (err) {
    logger.warn("[PLUAutoFetch] data.gouv.fr fetch failed", { error: err instanceof Error ? err.message : String(err) });
  }

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attempts to retrieve PLU raw text for a commune when the Base IA is empty.
 *
 * Returns immediately with whatever text was found.
 * Triggers background embedding so the next analysis uses cached vectors.
 */
export async function autoFetchPLU(
  inseeCode: string,
  communeName: string
): Promise<FetchedPLUDoc[]> {
  // Tier 1: GPU
  let docs = await fetchFromGPU(inseeCode);

  // Tier 2: data.gouv.fr fallback
  if (docs.length === 0) {
    docs = await fetchFromDataGouv(inseeCode, communeName);
  }

  if (docs.length === 0) {
    logger.warn(`[PLUAutoFetch] No PLU text found for ${communeName} (${inseeCode}) from any source.`);
    return [];
  }

  // Background: index into Base IA so future analyses use embeddings
  const poolId = `${inseeCode}-PLU-ACTIVE`;
  setImmediate(() => { (async () => {
    for (const doc of docs) {
      try {
        // Skip if already indexed by fileName
        const existing = await db.select({ id: baseIADocumentsTable.id })
          .from(baseIADocumentsTable)
          .where(and(
            eq(baseIADocumentsTable.municipalityId, inseeCode),
            eq(baseIADocumentsTable.fileName, doc.fileName)
          )).limit(1);

        if (existing.length > 0) continue;

        const autoFetchBatchId = crypto.randomUUID();
        const [baseIADoc] = await db.insert(baseIADocumentsTable).values({
          batchId: autoFetchBatchId,
          municipalityId: inseeCode,
          category: "REGULATORY",
          subCategory: "PLU",
          type: doc.docType === "oap" ? "oap" : "plu",
          fileName: doc.fileName,
          fileHash: crypto.createHash("sha256").update(doc.rawText).digest("hex"),
          status: "parsing",
          rawText: doc.rawText,
        }).returning();

        await processDocumentForRAG(baseIADoc.id, inseeCode, doc.rawText, {
          document_id: baseIADoc.id,
          document_type: doc.docType,
          pool_id: poolId,
          status: "active",
          commune: inseeCode,    // always store INSEE code for consistent lookup
          source_authority: authorityFor(doc.docType),
        } as any);

        await persistRegulatoryUnitsForDocument({
          baseIADocumentId: baseIADoc.id,
          municipalityId: inseeCode,
          documentType: doc.docType,
          sourceAuthority: authorityFor(doc.docType),
          isOpposable: doc.docType === "plu_reglement" || doc.docType === "plu_annexe",
          rawText: doc.rawText,
        });

        await persistRegulatoryZoneSectionsForDocument({
          baseIADocumentId: baseIADoc.id,
          municipalityId: inseeCode,
          documentType: doc.docType,
          sourceAuthority: authorityFor(doc.docType),
          isOpposable: doc.docType === "plu_reglement" || doc.docType === "plu_annexe",
          rawText: doc.rawText,
        });

        await persistDocumentKnowledgeProfile({
          baseIADocumentId: baseIADoc.id,
          municipalityId: inseeCode,
          documentType: doc.docType,
          sourceName: doc.fileName,
          opposable: doc.docType === "plu_reglement" || doc.docType === "plu_annexe",
          sourceAuthority: authorityFor(doc.docType),
          rawText: doc.rawText,
          rawClassification: {
            source: "plu_auto_fetch",
            docType: doc.docType,
          },
        });

        await persistUrbanRulesForDocument({
          baseIADocumentId: baseIADoc.id,
          municipalityId: inseeCode,
          documentType: doc.docType,
          sourceAuthority: authorityFor(doc.docType),
          isOpposable: doc.docType === "plu_reglement" || doc.docType === "plu_annexe",
        });

        await db.update(baseIADocumentsTable)
          .set({ status: "indexed" })
          .where(eq(baseIADocumentsTable.id, baseIADoc.id));

        // Also create a townHallDocuments record for backward compat
        const fileBuffer = fs.existsSync(path.join(UPLOADS_DIR, doc.fileName))
          ? fs.readFileSync(path.join(UPLOADS_DIR, doc.fileName))
          : null;

        const [townHallDoc] = await db.insert(townHallDocumentsTable).values({
          userId: "SYSTEM",
          commune: communeName,
          title: doc.fileName,
          fileName: doc.fileName,
          mimeType: "application/pdf",
          fileSize: fileBuffer?.length || null,
          hasStoredBlob: !!fileBuffer,
          rawText: doc.rawText,
          category: "REGULATORY",
          subCategory: "PLU",
          documentType: doc.docType,
          isRegulatory: true,
          isOpposable: true,
        }).returning({ id: townHallDocumentsTable.id });

        if (townHallDoc?.id && fileBuffer) {
          await db.insert(townHallDocumentFilesTable).values({
            documentId: townHallDoc.id,
            mimeType: "application/pdf",
            fileSize: fileBuffer.length,
            fileBase64: fileBuffer.toString("base64"),
          }).onConflictDoNothing();
        }

        logger.info(`[PLUAutoFetch] ✅ Background indexed ${doc.fileName} into Base IA (${poolId})`);
      } catch (e) {
        logger.error(`[PLUAutoFetch] Background indexing failed for ${doc.fileName}:`, e);
      }
    }
  })().catch(e => logger.error("[PLUAutoFetch] Background error:", e)); });

  return docs;
}
