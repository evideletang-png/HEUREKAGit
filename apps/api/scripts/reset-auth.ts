import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../src/lib/auth.js";
import { eq } from "drizzle-orm";

async function main() {
  console.log("--- Syncing / Resetting Users ---");
  try {
    const users = await db.select().from(usersTable);
    console.log("Current Users count:", users.length);
    
    users.forEach(u => {
      console.log(`- ${u.email} (${u.role})`);
    });

    const adminEmail = "admin@heureka.fr";
    const hp = await hashPassword("admin123456");

    const existingAdmin = users.find(u => u.email === adminEmail);
    
    if (!existingAdmin) {
      console.log("Creating default admin...");
      await db.insert(usersTable).values({
        email: adminEmail,
        name: "Admin Heureka",
        passwordHash: hp,
        role: "admin"
      });
    } else {
      console.log("Resetting admin password to 'admin123456'...");
      await db.update(usersTable)
        .set({ passwordHash: hp })
        .where(eq(usersTable.email, adminEmail));
    }
    
    console.log("Sync complete. User: admin@heureka.fr / admin123456");
  } catch (err) {
    console.error("Database connection error:", err);
  }
}

main().catch(console.error);
