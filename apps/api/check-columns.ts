import pg from "pg";
const { Pool } = pg;

async function checkColumns() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'town_hall_documents';
    `);
    console.log("Columns for town_hall_documents:");
    console.log(JSON.stringify(result.rows, null, 2));

    const result2 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'base_ia_documents';
    `);
    console.log("\nColumns for base_ia_documents:");
    console.log(JSON.stringify(result2.rows, null, 2));
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkColumns();
