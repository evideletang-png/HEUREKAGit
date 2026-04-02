import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "evi.deletang@gmail.com";
// bcrypt hash of the initial password — change via the app after first login
const ADMIN_PASSWORD_HASH =
  "$2b$12$ZXM/A8U6J7HOdZaIpiWHbe9p4kAlfIpv/e4vjF0euYoTgCBLrGFhO";

export async function seedAdminUser() {
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) return; // already exists

  await db.insert(usersTable).values({
    email: ADMIN_EMAIL,
    passwordHash: ADMIN_PASSWORD_HASH,
    name: "Admin",
    role: "admin",
  });

  console.log(`[seed] Admin user created: ${ADMIN_EMAIL}`);
}
