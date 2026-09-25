require('dotenv').config();
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--supabase')) throw new Error('Usage: npm run migrate:product-visibility -- [--supabase]');
  const cloud = args.includes('--supabase');
  const url = cloud ? process.env.SUPABASE_MIGRATION_URL || process.env.DATABASE_URL : process.env.DATABASE_URL;
  if (cloud && !url) throw new Error('Configure SUPABASE_MIGRATION_URL or DATABASE_URL first.');
  if (url) {
    const { Client } = require('pg');
    const { connectionOptions } = require('../config/postgres');
    const client = new Client(connectionOptions(url));
    try {
      await client.connect(); await client.query('BEGIN');
      for (const table of ['products', 'product_categories']) await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS pos_hidden SMALLINT NOT NULL DEFAULT 0 CHECK (pos_hidden IN (0, 1))`);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { await client.end(); }
  } else {
    const db = require('../config/database');
    try {
      for (const table of ['products', 'product_categories']) {
        const [columns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE 'pos_hidden'`);
        if (!columns.length) await db.query(`ALTER TABLE ${table} ADD COLUMN pos_hidden TINYINT NOT NULL DEFAULT 0`);
      }
    } finally { await db.end(); }
  }
  console.log(`Product visibility is ready in ${url ? 'PostgreSQL' : 'MySQL'}. All existing products/categories remain visible.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
