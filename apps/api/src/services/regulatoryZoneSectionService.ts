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

type TocZoneEntry = {
  zoneCode: string;
  heading: string;
  pageNumber: number;
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

function scoreZoneHeadingPresence(text: string, zoneCode: string): number {
  const sample = text.slice(0, 1800).toUpperCase();
  if (sample.includes(`REGLEMENT DE LA ZONE ${zoneCode}`)) return 4;
  if (sample.includes(`DISPOSITIONS APPLICABLES A LA ZONE ${zoneCode}`)) return 3;
  if (sample.includes(`DISPOSITIONS APPLICABLES À LA ZONE ${zoneCode}`)) return 3;
  if (sample.includes(`SOUS-ZONE ${zoneCode}`) || sample.includes(`SOUS ZONE ${zoneCode}`)) return 2;
  if (sample.includes(`SECTEUR ${zoneCode}`)) return 2;
  if (sample.includes(`ZONE ${zoneCode}`)) return 1;
  return 0;
}

function extractPages(rawText: string) {
  const normalized = rawText.replace(/\r\n?/g, "\n");
  const pages = normalized.split("\f");
  if (pages.length <= 1) return [];

  const result: Array<{ pageNumber: number; startOffset: number; endOffset: number; text: string }> = [];
  let cursor = 0;
  for (let index = 0; index < pages.length; index++) {
    const pageText = pages[index] ?? "";
    const startOffset = cursor;
    const endOffset = cursor + pageText.length;
    result.push({
      pageNumber: index + 1,
      startOffset,
      endOffset,
      text: pageText,
    });
    cursor = endOffset + 1;
  }

  return result;
}

function extractZoneEntriesFromSummary(rawText: string): TocZoneEntry[] {
  const summaryPattern = /(^|\n)\s*(r[ée]glement\s+de\s+la\s+zone\s+([A-Z]{1,4}[A-Za-z0-9-]*))\s+(\d{1,4})\s*$/gim;
  const entries: TocZoneEntry[] = [];

  let match: RegExpExecArray | null;
  while ((match = summaryPattern.exec(rawText)) !== null) {
    const zoneCode = normalizeZoneCode(match[3] || "");
    const pageNumber = Number(match[4] || 0);
    if (!zoneCode || !Number.isFinite(pageNumber) || pageNumber <= 0) continue;
    entries.push({
      zoneCode,
      heading: match[2].trim(),
      pageNumber,
    });
  }

  const deduped = new Map<string, TocZoneEntry>();
  for (const entry of entries) {
    if (!deduped.has(entry.zoneCode)) {
      deduped.set(entry.zoneCode, entry);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => left.pageNumber - right.pageNumber);
}

function buildSectionsFromSummary(rawText: string): ExtractedZoneSection[] {
  const pages = extractPages(rawText);
  const tocEntries = extractZoneEntriesFromSummary(rawText);
  if (pages.length === 0 || tocEntries.length === 0) return [];

  let pageOffset: number | null = null;
  for (const tocEntry of tocEntries) {
    const matchingPage = pages.find((page) => scoreZoneHeadingPresence(page.text, tocEntry.zoneCode) > 0);
    if (matchingPage) {
      pageOffset = matchingPage.pageNumber - tocEntry.pageNumber;
      break;
    }
  }

  if (pageOffset == null) return [];

  const sections: ExtractedZoneSection[] = [];
  for (let index = 0; index < tocEntries.length; index++) {
    const current = tocEntries[index];
    const next = tocEntries[index + 1];
    const actualStartPage = current.pageNumber + pageOffset;
    const actualEndPage = (next ? next.pageNumber + pageOffset - 1 : pages[pages.length - 1]?.pageNumber) || actualStartPage;

    const firstPage = pages.find((page) => page.pageNumber === actualStartPage);
    const lastPage = pages.find((page) => page.pageNumber === actualEndPage);
    if (!firstPage || !lastPage) continue;

    const startOffset = firstPage.startOffset;
    const endOffset = lastPage.endOffset;
    const sourceText = rawText.slice(startOffset, endOffset).trim();
    if (sourceText.length < 300) continue;
    if (scoreZoneHeadingPresence(sourceText, current.zoneCode) === 0) continue;

    const parentZoneCode = deriveParentZone(current.zoneCode);
    sections.push({
      zoneCode: current.zoneCode,
      parentZoneCode,
      heading: current.heading,
      sourceText,
      startOffset,
      endOffset,
      startPage: actualStartPage,
      endPage: actualEndPage,
      isSubZone: !!parentZoneCode,
    });
  }

  return sections;
}

export function extractRegulatoryZoneSections(rawText: string): ExtractedZoneSection[] {
  if (!rawText || rawText.trim().length < 500) return [];

  const headerPattern =
    /(^|\n)\s*((?:chapitre[^\n]{0,80}\bzone\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:dispositions\s+applicables\s+(?:à|a)\s+la\s+zone\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:r[ée]glement\s+de\s+la\s+zone\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:r[ée]glement\s+du\s+secteur\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:zone\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:secteur\s+([A-Z]{1,4}[A-Za-z0-9-]*))|(?:sous[- ]zone\s+([A-Z]{1,4}[A-Za-z0-9-]*)))[^\n]*/gim;

  const matches: Array<{ zoneCode: string; heading: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(rawText)) !== null) {
    const capturedZone = match[3] || match[4] || match[5] || match[6] || match[7] || match[8] || match[9];
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
  for (const section of [...buildSectionsFromSummary(rawText), ...sections]) {
    const existing = deduped.get(section.zoneCode);
    const sectionScore = scoreZoneHeadingPresence(section.sourceText, section.zoneCode) * 100000 + section.sourceText.length;
    const existingScore = existing ? scoreZoneHeadingPresence(existing.sourceText, existing.zoneCode) * 100000 + existing.sourceText.length : -1;
    if (!existing || sectionScore > existingScore) {
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
