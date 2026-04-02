import { NotificationService } from "../services/NotificationService.ts";
import { db, usersTable, dossiersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function test() {
  const dossierId = "62ea0f3f-4e08-410a-8d19-ee662369623e";
  const content = "Test mention for @ABF regarding Rochecorbon.";
  const fromEmail = "admin@heureka.fr";
  
  console.log(`[Test] Manually triggering mention detection for dossier ${dossierId}`);
  
  // 1. Fetch dossier
  const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
  if (!dossier) {
    console.error("Dossier not found!");
    return;
  }
  
  console.log(`[Test] Dossier commune: ${dossier.commune}`);
  
  // 2. Detect mentions (Simulating the router logic)
  const serviceMentions = content.match(/@(ABF|METROPOLE|MAIRIE|ADMIN)[0-9]*/gi);
  console.log(`[Test] Detected mentions: ${JSON.stringify(serviceMentions)}`);
  
  if (serviceMentions) {
    for (const mention of serviceMentions) {
      const targetRole = mention.substring(1).toLowerCase().replace(/[0-9]/g, '');
      console.log(`[Test] Normalizing ${mention} to role ${targetRole}`);
      
      await NotificationService.notifyRoleInCommune({
        role: targetRole,
        commune: dossier.commune || "",
        dossierId: dossier.id,
        type: "MENTION",
        title: `Test Notification`,
        message: `${fromEmail} vous a mentionné.`,
        priority: "HIGH"
      });
    }
  }
}

test().catch(console.error);
