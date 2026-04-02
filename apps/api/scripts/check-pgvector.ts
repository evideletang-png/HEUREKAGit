import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Pool } = pg;

async function checkPgVector() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    console.log("Checking for pgvector extension...");
    await db.execute('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log("SUCCESS: pgvector extension is available and enabled.");
    process.exit(0);
  } catch (err) {
    console.error("FAILURE: Could not enable pgvector.", err);
    process.exit(1);
  }
}

checkPgVector();
