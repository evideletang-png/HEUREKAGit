import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import "dotenv/config"; // Fallback for local run

async function verify() {
  try {
    const adminEmail = "admin@heureka.fr";
    console.log(`Checking for user: ${adminEmail}...`);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1);
    
    if (user) {
      console.log("SUCCESS: Admin user found.");
      console.log("ID:", user.id);
      console.log("Role:", user.role);
    } else {
      console.log("FAILURE: Admin user not found.");
      // List all users
      const allUsers = await db.select().from(usersTable).limit(10);
      console.log("Existing users in DB:", allUsers.map(u => `${u.email} (${u.role})`));
    }
    process.exit(0);
  } catch (err) {
    console.error("Database connection error:", err);
    process.exit(1);
  }
}

verify();
