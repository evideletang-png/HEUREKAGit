import { db, municipalityLearningsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export interface TerritorialPattern {
  commune: string;
  strictness: {
    height: number; // 0-1
    setbacks: number;
    density: number;
  };
  topReasons: string[];
  overrides?: any[];
  frequentChatTopics?: Array<{ topic: string; count: number }>;
  interactionCount?: number;
}

const INTERACTION_TOPIC_RULES: Array<{ topic: string; regex: RegExp }> = [
  { topic: "hauteur", regex: /\bhauteur|sur[eé]l[ée]vation|r\+\d\b/i },
  { topic: "emprise", regex: /\bemprise|ces|surface\b/i },
  { topic: "reculs", regex: /\brecul|limite s[ée]parative|alignement\b/i },
  { topic: "stationnement", regex: /\bstationnement|parking\b/i },
  { topic: "annexes", regex: /\bpiscine|annexe|abri|carport|garage\b/i },
  { topic: "division", regex: /\bdivision|lotissement|d[ée]tachement\b/i },
  { topic: "patrimoine", regex: /\babf|monument|patrimoine|servitude\b/i },
  { topic: "risques", regex: /\binondation|ppr|risque|al[ée]a\b/i },
  { topic: "pieces", regex: /\bcerfa|pi[eè]ce|document|plan\b/i },
];

function extractInteractionTopics(message: string): string[] {
  const text = (message || "").trim();
  if (!text) return [];
  return INTERACTION_TOPIC_RULES
    .filter(rule => rule.regex.test(text))
    .map(rule => rule.topic);
}

/**
 * Territorial Learning System.
 * Records decision history and detects municipal patterns.
 */
export async function recordDecision(
  commune: string,
  isFavorable: boolean,
  rejectedCategories: string[] = []
): Promise<void> {
  console.log(`[LearningService] Recording decision for ${commune}...`);

  try {
    const [existing] = await db.select()
      .from(municipalityLearningsTable)
      .where(eq(municipalityLearningsTable.commune, commune))
      .limit(1);

    if (!existing) {
      await db.insert(municipalityLearningsTable).values({
        commune,
        favorableCount: isFavorable ? 1 : 0,
        unfavorableCount: isFavorable ? 0 : 1,
        strictnessMap: { height: 0.5, setbacks: 0.5, density: 0.5 },
        commonIssues: rejectedCategories
      });
    } else {
      const fav = (existing.favorableCount || 0) + (isFavorable ? 1 : 0);
      const unfav = (existing.unfavorableCount || 0) + (isFavorable ? 0 : 1);
      
      // Dynamic strictness adjustment (Simplified logic)
      const currentMap: any = existing.strictnessMap || { height: 0.5, setbacks: 0.5, density: 0.5 };
      if (!isFavorable) {
         rejectedCategories.forEach(cat => {
            if (currentMap[cat] !== undefined) currentMap[cat] = Math.min(1, currentMap[cat] + 0.05);
         });
      }

      await db.update(municipalityLearningsTable)
        .set({
          favorableCount: fav,
          unfavorableCount: unfav,
          strictnessMap: currentMap,
          updatedAt: new Date()
        })
        .where(eq(municipalityLearningsTable.commune, commune));
    }
  } catch (err) {
    console.error("[LearningService] Failed to record decision:", err);
  }
}

export async function getTerritorialPattern(commune: string): Promise<TerritorialPattern | null> {
  const [data] = await db.select()
    .from(municipalityLearningsTable)
    .where(eq(municipalityLearningsTable.commune, commune))
    .limit(1);

  if (!data) return null;

  return {
    commune: data.commune,
    strictness: data.strictnessMap as any,
    topReasons: data.commonIssues as string[] || [],
    overrides: data.overrides as any[] || [],
    frequentChatTopics: Object.entries(((data.patterns as any)?.chatTopics || {}) as Record<string, number>)
      .map(([topic, count]) => ({ topic, count: Number(count) || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    interactionCount: Number((data.patterns as any)?.interactionCount || 0),
  };
}

export async function recordInteractionSignal(commune: string, message: string): Promise<void> {
  const normalizedCommune = (commune || "").trim();
  if (!normalizedCommune) return;

  const topics = extractInteractionTopics(message);

  try {
    const [existing] = await db.select()
      .from(municipalityLearningsTable)
      .where(eq(municipalityLearningsTable.commune, normalizedCommune))
      .limit(1);

    if (!existing) {
      const initialChatTopics = topics.reduce<Record<string, number>>((acc, topic) => {
        acc[topic] = (acc[topic] || 0) + 1;
        return acc;
      }, {});

      await db.insert(municipalityLearningsTable).values({
        commune: normalizedCommune,
        favorableCount: 0,
        unfavorableCount: 0,
        strictnessMap: { height: 0.5, setbacks: 0.5, density: 0.5 },
        commonIssues: [],
        patterns: {
          interactionCount: 1,
          chatTopics: initialChatTopics,
        },
      });
      return;
    }

    const currentPatterns = ((existing.patterns as any) || {}) as Record<string, any>;
    const currentTopics = { ...(currentPatterns.chatTopics || {}) } as Record<string, number>;
    for (const topic of topics) {
      currentTopics[topic] = Number(currentTopics[topic] || 0) + 1;
    }

    await db.update(municipalityLearningsTable)
      .set({
        patterns: {
          ...currentPatterns,
          interactionCount: Number(currentPatterns.interactionCount || 0) + 1,
          chatTopics: currentTopics,
        },
        updatedAt: new Date(),
      })
      .where(eq(municipalityLearningsTable.commune, normalizedCommune));
  } catch (err) {
    console.error("[LearningService] Failed to record interaction signal:", err);
  }
}
