import { db } from "../lib/db/src/index.ts";
import { usersTable } from "../lib/db/src/schema/users.ts";
import { eq } from "drizzle-orm";
import { hashPassword } from "../artifacts/api-server/src/lib/auth.ts";
import 'dotenv/config';

async function bootstrap() {
  const email = "admin@heureka.fr";
  const password = "admin_password_2026";
  const name = "Super Admin";

  console.log(`Checking if user ${email} exists...`);
  
  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

    if (existing) {
      console.log(`User ${email} already exists. Promoting to admin...`);
      await db.update(usersTable)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(usersTable.id, existing.id));
      console.log("Promotion successful.");
    } else {
      console.log(`Creating new admin user: ${email}...`);
      const hashedPassword = await hashPassword(password);
      await db.insert(usersTable).values({
        email,
        passwordHash: hashedPassword,
        name,
        role: "admin",
      });
      console.log(`User created successfully. email: ${email}, password: ${password}`);
    }
  } catch (err) {
    console.error("Database error:", err);
  }
}

bootstrap().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
