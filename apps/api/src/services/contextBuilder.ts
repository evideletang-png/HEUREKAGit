import { db, baseIADocumentsTable, rulesTable, townHallDocumentsTable, communesTable, municipalitySettingsTable, regulatoryZoneSectionsTable } from "@workspace/db";
import { eq, and, sql, or, inArray } from "drizzle-orm";
import { JurisdictionContext, GLOBAL_POOL_ID } from "@workspace/ai-core";
import { queryRelevantChunks } from "./embeddingService.js";
import { autoFetchPLU } from "./pluAutoFetch.js";
import { hasUsableExtractedText } from "./textQualityService.js";
import { buildZoneCodeAliases } from "./pluAnalysis.js";
import { loadZoneSearchKeywords } from "./regulatoryCalibrationZoneHintsService.js";

export interface AnalysisContext {
  commune: string;
  zoneCode: string;
  jurisdictionContext: JurisdictionContext;
  relevantDocs: any[];
  relevantRules: any[];
}

async function collectPrioritizedRegulatoryChunks(
  commune: string,
  communeName: string,
  zoneCode: string,
  jurisdictionContext: JurisdictionContext,
  limit = 30
) {
  const aliases = Array.from(new Set([commune, communeName].filter((value): value is string => !!value && value.trim().length > 0)));
  const zoneAliases = buildZoneCodeAliases(zoneCode);
  const searchKeywords = await loadZoneSearchKeywords({ municipalityAliases: aliases, zoneCode });
  const query = [
    `Règlement zone ${zoneCode} occupation sol hauteur emprise recul stationnement espaces verts`,
    searchKeywords.length > 0 ? `Mots-clés prioritaires : ${searchKeywords.join(", ")}` : null,
  ].filter(Boolean).join(". ");
  const plans = [
    { docTypes: ["plu_reglement"], strictZone: true, target: Math.min(limit, 18) },
    { docTypes: ["plu_annexe"], strictZone: true, target: Math.min(limit, 8) },
    { docTypes: ["plu_reglement"], strictZone: false, target: Math.min(limit, 24) },
    { docTypes: ["plu_annexe"], strictZone: false, target: Math.min(limit, 30) },
  ];

  const seen = new Set<string>();
  const results: any[] = [];

  for (const plan of plans) {
    for (const municipalityId of aliases) {
      for (const zoneAlias of zoneAliases) {
        const chunks = await queryRelevantChunks(query, {
          municipalityId,
          zoneCode: zoneAlias,
          docTypes: plan.docTypes,
          minAuthority: 7,
          strictZone: plan.strictZone,
          jurisdictionContext,
          limit: plan.target,
        });

        for (const chunk of chunks) {
          if (seen.has(chunk.id)) continue;
          seen.add(chunk.id);
          results.push(chunk);
          if (results.length >= limit) return results;
        }
      }

      if (results.length >= plan.target) break;
    }
  }

  return results;
}

/**
 * Context Builder Service.
 * Selects only relevant documents and rules for analysis using strict Jurisdiction Scoping.
 */
export async function buildAnalysisContext(
  commune: string, // INSEE Code
  zoneCode: string,
  jurisdictionContext: JurisdictionContext
): Promise<AnalysisContext> {
  console.log(`[ContextBuilder] Building context for ${jurisdictionContext.name} (${zoneCode})...`);
  const zoneAliases = buildZoneCodeAliases(zoneCode);

  // 1. Resolve Commune Name (Mismatch fix for town_hall_documents)
  let communeName = "";
  try {
    const [c] = await db.select().from(communesTable).where(eq(communesTable.inseeCode, commune)).limit(1);
    if (c) communeName = c.name;
    if (!communeName) {
      const [settings] = await db.select({ commune: municipalitySettingsTable.commune })
        .from(municipalitySettingsTable)
        .where(eq(municipalitySettingsTable.inseeCode, commune))
        .limit(1);
      if (settings?.commune) communeName = settings.commune;
    }
    console.log(`[ContextBuilder] Resolved INSEE ${commune} to name: ${communeName}`);
  } catch (e) {
    console.warn(`[ContextBuilder] Failed to resolve commune name for ${commune}`);
  }

  // 2. Fetch relevant documents from Base IA
  const poolIds = [...jurisdictionContext.active_pool_ids, GLOBAL_POOL_ID];
  
  const baseIADocs = await db.select().from(baseIADocumentsTable)
    .where(
      and(
        or(
          eq(baseIADocumentsTable.municipalityId, commune),
          communeName ? sql`lower(${baseIADocumentsTable.municipalityId}) = lower(${communeName})` : sql`FALSE`,
          inArray(baseIADocumentsTable.municipalityId, [GLOBAL_POOL_ID, "NATIONAL"])
        ),
        eq(baseIADocumentsTable.status, "indexed")
      )
    );

  const municipalityAliases = [commune, communeName].filter((value): value is string => !!value && value.trim().length > 0);
  let zoneSections: typeof regulatoryZoneSectionsTable.$inferSelect[] = [];
  if (zoneAliases.length > 0 && municipalityAliases.length > 0) {
    try {
      zoneSections = await db.select().from(regulatoryZoneSectionsTable)
        .where(
          and(
            or(
              inArray(regulatoryZoneSectionsTable.municipalityId, municipalityAliases),
              communeName ? sql`lower(${regulatoryZoneSectionsTable.municipalityId}) = lower(${communeName})` : sql`FALSE`
            ),
            inArray(regulatoryZoneSectionsTable.zoneCode, zoneAliases),
            eq(regulatoryZoneSectionsTable.isOpposable, true)
          )
        );
    } catch (error) {
      console.warn(
        `[ContextBuilder] Failed to load regulatory zone sections for ${commune}/${communeName || "unknown"} zone ${zoneCode}. Falling back to legacy document context.`,
        error
      );
      zoneSections = [];
    }
  }

  // 3. Zone-level Collection from Town Hall (PLU PDFs, etc.)
  // We fetch ALL documents for the commune, then filter or triage them based on zone keywords in Step 4
  const townHallDocs = await db.select().from(townHallDocumentsTable)
    .where(
      and(
        or(
          eq(townHallDocumentsTable.commune, commune),
          communeName ? sql`lower(${townHallDocumentsTable.commune}) = lower(${communeName})` : sql`FALSE`,
          // Zone-specific matches if pre-filtered in DB
          zoneAliases.length > 0
            ? inArray(townHallDocumentsTable.zone, zoneAliases)
            : sql`FALSE`
        ),
        eq(townHallDocumentsTable.isRegulatory, true)
      )
    );
  const usableTownHallDocs = townHallDocs.filter((doc) => hasUsableExtractedText(doc.rawText));

  // Combine static document sources
  const sectionDocs = zoneSections
    .sort((left, right) => {
      const leftPriority = left.zoneCode === zoneCode ? 0 : 1;
      const rightPriority = right.zoneCode === zoneCode ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return (right.sourceAuthority || 0) - (left.sourceAuthority || 0);
    })
    .map((section) => ({
      id: `ZONE_SECTION_${section.id}`,
      rawText: section.sourceText,
      municipalityId: section.municipalityId,
      status: "indexed",
      documentType: section.documentType || "plu_reglement",
      title: `${section.heading}${section.startPage ? ` (p. ${section.startPage}${section.endPage && section.endPage !== section.startPage ? `-${section.endPage}` : ""})` : ""}`,
      isOpposable: section.isOpposable,
      zoneCode: section.zoneCode,
      parentZoneCode: section.parentZoneCode,
      sourceAuthority: section.sourceAuthority,
    }));

  const relevantDocs: any[] = [...sectionDocs, ...baseIADocs, ...usableTownHallDocs];

  // 3b. ALWAYS run semantic search against base_ia_embeddings for zone-specific PLU chunks.
  // This is the primary knowledge source — it returns the most relevant indexed PLU text
  // even when no full-document record exists for the commune.
  try {
    const chunks = await collectPrioritizedRegulatoryChunks(commune, communeName, zoneCode, jurisdictionContext, 30);

    if (chunks.length > 0) {
      const writtenChunks = chunks.filter((chunk) => chunk.metadata?.document_type === "plu_reglement");
      const annexChunks = chunks.filter((chunk) => chunk.metadata?.document_type === "plu_annexe");

      if (annexChunks.length > 0) {
        relevantDocs.unshift({
          id: `BASE_IA_ANNEX_${commune}_${zoneCode}`,
          rawText: annexChunks
            .map((chunk) => `[Base IA annexe — Score: ${typeof chunk.similarity === "number" ? chunk.similarity.toFixed(2) : chunk.similarity}]\n${chunk.content}`)
            .join("\n\n---\n\n"),
          municipalityId: commune,
          status: "indexed",
          documentType: "plu_annexe",
          title: `Base IA — Annexes ${zoneCode} — ${jurisdictionContext.name || commune}`,
          isOpposable: true,
        });
      }

      if (writtenChunks.length > 0) {
        relevantDocs.unshift({
          id: `BASE_IA_REGULATION_${commune}_${zoneCode}`,
          rawText: writtenChunks
            .map((chunk) => `[Base IA règlement écrit — Score: ${typeof chunk.similarity === "number" ? chunk.similarity.toFixed(2) : chunk.similarity}]\n${chunk.content}`)
            .join("\n\n---\n\n"),
          municipalityId: commune,
          status: "indexed",
          documentType: "plu_reglement",
          title: `Base IA — Règlement écrit ${zoneCode} — ${jurisdictionContext.name || commune}`,
          isOpposable: true,
        });
      }

      console.log(
        `[ContextBuilder] ✅ ${chunks.length} Base IA embedding chunks injected for zone ${zoneCode} in ${jurisdictionContext.name || commune} (${writtenChunks.length} règlement, ${annexChunks.length} annexes)`
      );
    } else {
      console.warn(`[ContextBuilder] ⚠️  No Base IA chunks for zone ${zoneCode} in ${commune} — triggering auto-fetch from GPU / data.gouv.fr`);

      // Tier 3: On-demand fetch from GPU → data.gouv.fr
      // Returns text immediately for THIS analysis; also triggers background embedding for next time.
      try {
        const autoDocs = await autoFetchPLU(commune, communeName || jurisdictionContext.name || commune);
        if (autoDocs.length > 0) {
          const autoText = autoDocs.map(d => `[Auto-fetch ${d.source.toUpperCase()} — ${d.docType}]\n${d.rawText}`).join("\n\n===\n\n");
          relevantDocs.unshift({
            id: `AUTO_FETCH_${commune}`,
            rawText: autoText,
            municipalityId: commune,
            status: "indexed",
            documentType: "plu",
            title: `PLU auto-récupéré — ${jurisdictionContext.name || commune}`,
          });
          console.log(`[ContextBuilder] ✅ Auto-fetch retrieved ${autoDocs.length} doc(s) for ${commune} from ${autoDocs.map(d => d.source).join(", ")}`);
        } else {
          console.warn(`[ContextBuilder] ⚠️  Auto-fetch found nothing for ${commune}. Analysis will proceed with no PLU context.`);
        }
      } catch (autoErr) {
        console.error("[ContextBuilder] Auto-fetch failed:", autoErr);
      }
    }
  } catch (embErr) {
    console.error("[ContextBuilder] Embedding search failed — continuing without Base IA chunks:", embErr);
  }

  // 4. Fetch relevant formal rules (Structured DB rules)
  const relevantRules = await db.select().from(rulesTable)
    .where(
      and(
        or(
          eq(rulesTable.commune, commune),
          communeName ? eq(rulesTable.commune, communeName) : sql`FALSE`
        ),
        zoneAliases.length > 0
          ? inArray(rulesTable.zoneCode, zoneAliases)
          : eq(rulesTable.zoneCode, zoneCode)
      )
    );

  console.log(`[ContextBuilder] [Jurisdiction: ${jurisdictionContext.name}] Collected ${relevantDocs.length} documents for Zone ${zoneCode}.`);

  return {
    commune,
    zoneCode,
    jurisdictionContext,
    relevantDocs,
    relevantRules
  };
}
