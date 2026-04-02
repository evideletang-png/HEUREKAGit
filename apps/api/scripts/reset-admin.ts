import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const email = "admin@heureka.fr";
const newPassword = "password"; // Setting to 'password' to match other test accounts

async function reset() {
  console.log(`Resetting password for ${email} to "${newPassword}"...`);
  const hash = await bcrypt.hash(newPassword, 12);
  
  await db.update(usersTable)
    .set({ passwordHash: hash })
    .where(eq(usersTable.email, email));
    
  console.log("Password reset successfully.");
}

reset().catch(console.error);
