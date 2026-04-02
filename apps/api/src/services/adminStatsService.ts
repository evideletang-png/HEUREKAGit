import { db, analysesTable, municipalityLearningsTable, usersTable } from "@workspace/db";
import { eq, sql, avg, count } from "drizzle-orm";

export interface DashboardStats {
  totalDossiers: number;
  completedDossiers: number;
  averageSlaSeconds: number;
  estimatedEtpHoursSaved: number;
  overridesTotal: number;
  statsByAdmin: {
    adminName: string;
    overridesCount: number;
  }[];
}

export class AdminStatsService {
  /**
   * Calcule les statistiques globales pour le dashboard Super Admin
   */
  static async getDashboardStats(): Promise<DashboardStats> {
    try {
      // 1. Statistiques des dossiers
      const [counts] = await db.select({
        total: count(analysesTable.id),
        completed: sql<number>`count(case when status = 'completed' then 1 end)`,
      }).from(analysesTable);

      // 2. Calcul du SLA (temps de traitement moyen)
      // On compare updated_at et created_at pour les dossiers complétés
      const [slaResult] = await db.select({
        avgSla: sql<number>`avg(extract(epoch from (updated_at - created_at)))`
      })
      .from(analysesTable)
      .where(eq(analysesTable.status, "completed"));

      // 3. Calcul ETP (2h économisées par dossier complété)
      const etpSaved = (Number(counts.completed) || 0) * 2;

      // 4. Overrides totaux
      const learnings = await db.select().from(municipalityLearningsTable);
      let totalOverrides = 0;
      learnings.forEach(l => {
        if (l.overrides && Array.isArray(l.overrides)) {
          totalOverrides += l.overrides.length;
        }
      });

      // 5. Stats par Admin (Basé sur qui a déposé les dossiers ou fait les overrides)
      // Note: On simplifie ici en comptant les dossiers par admin
      const adminStats = await db.select({
        adminName: usersTable.name,
        overridesCount: count(analysesTable.id), // Proxy pour l'activité
      })
      .from(analysesTable)
      .innerJoin(usersTable, eq(analysesTable.userId, usersTable.id))
      .where(eq(usersTable.role, "admin"))
      .groupBy(usersTable.name);

      return {
        totalDossiers: Number(counts.total) || 0,
        completedDossiers: Number(counts.completed) || 0,
        averageSlaSeconds: Math.round(Number(slaResult?.avgSla) || 0),
        estimatedEtpHoursSaved: etpSaved,
        overridesTotal: totalOverrides,
        statsByAdmin: adminStats.map(s => ({
          adminName: s.adminName || "Admin Inconnu",
          overridesCount: Number(s.overridesCount) || 0
        }))
      };
    } catch (err) {
      console.error("[AdminStats] Error calculating stats:", err);
      throw err;
    }
  }
}
