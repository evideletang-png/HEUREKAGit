import { NotificationService } from "../services/NotificationService.ts";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function test() {
  console.log("Testing notification for @ABF37 mapping to 'abf' role in commune 'Tours'...");
  
  // 1. Ensure an ABF user exists for 'Tours'
  const [abfUser] = await db.select().from(usersTable).where(eq(usersTable.role, 'abf')).limit(1);
  if (!abfUser) {
    console.log("No ABF user found. Manual test skipped.");
    return;
  }
  
  console.log(`Found ABF user: ${abfUser.name} (${abfUser.email})`);
  const commune = "Tours";
  
  // Ensure the user has the commune
  await db.update(usersTable).set({ 
    communes: JSON.stringify([commune]) 
  }).where(eq(usersTable.id, abfUser.id));
  
  console.log(`Updated user ${abfUser.id} to be in commune ${commune}`);

  // 2. Trigger notification
  await NotificationService.notifyRoleInCommune({
    role: 'abf',
    commune: commune,
    dossierId: 'test-dossier',
    type: 'MENTION',
    title: 'Test Mention',
    message: 'Test message for @ABF37',
    priority: 'HIGH'
  });
  
  console.log("Notification trigger called. Check server.log or notifications table.");
}

test().catch(console.error);
