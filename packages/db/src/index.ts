import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * Run pending Drizzle migrations. Safe to call on every startup — already-applied
 * migrations are skipped. Resolves the migration folder relative to cwd so it
 * works both in local dev (/repo root) and in the Docker runner (/app).
 */
export async function runMigrations() {
  const migrationsFolder = path.resolve(process.cwd(), "packages/db/drizzle");
  await migrate(db, { migrationsFolder });
}

// Export all tables individually for easier importing across the workspace
export * from "./schema/index.js";
export * as schema from "./schema/index.js";
