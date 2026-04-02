import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function run() {
  const email = "mairie@test.fr";
  const passwordHash = await bcrypt.hash("password123", 10);

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    await db.update(usersTable).set({ role: "mairie" }).where(eq(usersTable.email, email));
    console.log("Updated user to Mairie.");
  } else {
    await db.insert(usersTable).values({
      email,
      passwordHash,
      name: "Mairie Test",
      role: "mairie"
    });
    console.log("Created Mairie user.");
  }
  process.exit(0);
}

run().catch(console.error);
