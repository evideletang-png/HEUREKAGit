require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/heureka' });

async function check() {
  const res2 = await pool.query(`SELECT id, title, "extractedDataJson", "comparisonResultJson", status FROM "documentReviews" ORDER BY "createdAt" DESC LIMIT 5`);
  console.log(JSON.stringify(res2.rows, null, 2));
  process.exit(0);
}
check().catch(console.error);
