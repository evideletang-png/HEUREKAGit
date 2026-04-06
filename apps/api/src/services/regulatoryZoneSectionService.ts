import { db, regulatoryZoneSectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type PersistRegulatoryZoneSectionsArgs = {
  baseIADocumentId?: string | null;
  townHallDocumentId?: string | null;
  municipalityId: string;
  documentType?: string | null;
  sourceAuthority?: number;
  isOpposable?: boolean;
  rawText: string;
};

type ExtractedZoneSection = {
  zoneCode: string;
  parentZoneCode: string | null;
  heading: string;
  sourceText: string;
  startOffset: number;
  endOffset: number;
  startPage: number | null;
  endPage: number | null;
  isSubZone: boolean;
};

function normalizeZoneCode(raw: string): string {
  return raw.replace(/\s+/g, "").trim().toUpperCase();
}

function deriveParentZone(zoneCode: string): string | null {
  const match = zoneCode.match(/^([A-Z]+)/);
  if (!match?.[1]) return null;
  const parent = match[1].toUpperCase();
  return parent !== zoneCode ? parent : null;
}

function inferPageAtOffset(text: string, offset: number): number | null {
  const before = text.slice(0, offset);
  const formFeedPages = before.split("\f").length - 1;
  if (formFeedPages > 0) return formFeedPages + 1;

  const window = before.slice(-1200);
  const explicitPageMatches = Array.from(window.matchAll(/\bpage\s+(\d{1,4})\b/gi));
  if (explicitPageMatches.length > 0) {
    const last = explicitPageMatches[explicitPageMatches.length - 1]?.[1];
    return last ? Number(last) : null;
  }

  return null;
}

export function extractRegulatoryZoneSections(rawText: string): ExtractedZoneSection[] {
  if (!rawText || rawText.trim().length < 500) return [];

  const headerPattern =
    /(^|\n)\s*((?:chapitre[^\n]{0,80}\bzone\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:dispositions\s+applicables\s+(?:à|a)\s+la\s+zone\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:zone\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:secteur\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:sous[- ]zone\s+([A-Z]{1,4}[A-Za-z0-9-]*)))[^\n]*/gim;

  const matches: Array<{ zoneCode: string; heading: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(rawText)) !== null) {
    const capturedZone = match[3] || match[4] || match[5] || match[6] || match[7];
    if (!capturedZone) continue;
    const zoneCode = normalizeZoneCode(capturedZone);
    if (!/^[A-Z]{1,4}[A-Z0-9a-z-]*$/.test(zoneCode)) continue;

    const index = match.index + (match[1]?.length || 0);
    const heading = match[2].trim();
    if (matches.some((item) => item.zoneCode === zoneCode && Math.abs(item.index - index) < 100)) continue;
    matches.push({ zoneCode, heading, index });
  }

  if (matches.length === 0) return [];

  matches.sort((left, right) => left.index - right.index);

  const sections: ExtractedZoneSection[] = [];
  for (let index = 0; index < matches.length; index++) {
    const current = matches[index];
    const next = matches[index + 1];
    const startOffset = current.index;
    const endOffset = next ? next.index : rawText.length;
    const sourceText = rawText.slice(startOffset, endOffset).trim();
    if (sourceText.length < 300) continue;

    const parentZoneCode = deriveParentZone(current.zoneCode);
    sections.push({
      zoneCode: current.zoneCode,
      parentZoneCode,
      heading: current.heading,
      sourceText,
      startOffset,
      endOffset,
      startPage: inferPageAtOffset(rawText, startOffset),
      endPage: inferPageAtOffset(rawText, Math.max(startOffset, endOffset - 1)),
      isSubZone: !!parentZoneCode,
    });
  }

  const deduped = new Map<string, ExtractedZoneSection>();
  for (const section of sections) {
    const existing = deduped.get(section.zoneCode);
    if (!existing || section.sourceText.length > existing.sourceText.length) {
      deduped.set(section.zoneCode, section);
    }
  }

  return Array.from(deduped.values());
}

export async function persistRegulatoryZoneSectionsForDocument(args: PersistRegulatoryZoneSectionsArgs) {
  if (args.baseIADocumentId) {
    await db.delete(regulatoryZoneSectionsTable).where(eq(regulatoryZoneSectionsTable.baseIADocumentId, args.baseIADocumentId));
  } else if (args.townHallDocumentId) {
    await db.delete(regulatoryZoneSectionsTable).where(eq(regulatoryZoneSectionsTable.townHallDocumentId, args.townHallDocumentId));
  }

  if (!args.documentType || !["plu_reglement", "plu_annexe"].includes(args.documentType)) {
    return { created: 0 };
  }

  const sections = extractRegulatoryZoneSections(args.rawText);
  if (sections.length === 0) return { created: 0 };

  await db.insert(regulatoryZoneSectionsTable).values(
    sections.map((section) => ({
      baseIADocumentId: args.baseIADocumentId || null,
      townHallDocumentId: args.townHallDocumentId || null,
      municipalityId: args.municipalityId,
      zoneCode: section.zoneCode,
      parentZoneCode: section.parentZoneCode,
      heading: section.heading,
      sourceText: section.sourceText,
      startOffset: section.startOffset,
      endOffset: section.endOffset,
      startPage: section.startPage,
      endPage: section.endPage,
      isSubZone: section.isSubZone,
      documentType: args.documentType || null,
      sourceAuthority: args.sourceAuthority ?? 0,
      isOpposable: args.isOpposable ?? true,
      parserVersion: "v1",
      updatedAt: new Date(),
    }))
  );

  return { created: sections.length };
}
