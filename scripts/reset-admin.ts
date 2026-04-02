import { db } from "../lib/db/src/index.ts";
import { usersTable } from "../lib/db/src/schema/users.ts";
import { eq } from "drizzle-orm";
import { hashPassword } from "../artifacts/api-server/src/lib/auth.ts";
import 'dotenv/config';

async function resetAdmin() {
  const email = 'admin@test.com';
  const newPass = 'admin123456';
  const hashed = await hashPassword(newPass);
  
  console.log(`Resetting ${email} to admin role and password: ${newPass}`);
  
  await db.update(usersTable)
    .set({ role: 'admin', passwordHash: hashed })
    .where(eq(usersTable.email, email));
    
  console.log("Done.");
  process.exit(0);
}

resetAdmin().catch(console.error);
