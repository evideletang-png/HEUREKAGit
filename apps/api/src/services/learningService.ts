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
    overrides: data.overrides as any[] || []
  };
}
