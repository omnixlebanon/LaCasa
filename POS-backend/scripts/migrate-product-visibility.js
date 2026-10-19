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
      for (const table of ['products', 'product_categories', 'menu_groups']) for (const column of ['pos_hidden','menu_hidden']) await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} SMALLINT NOT NULL DEFAULT 0 CHECK (${column} IN (0, 1))`);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { await client.end(); }
  } else {
    const db = require('../config/database');
    try {
      for (const table of ['products', 'product_categories', 'menu_groups']) for (const column of ['pos_hidden','menu_hidden']) {
        const [columns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
        if (!columns.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} TINYINT NOT NULL DEFAULT 0`);
      }
    } finally { await db.end(); }
  }
  console.log(`Product visibility is ready in ${url ? 'PostgreSQL' : 'MySQL'}. Existing visibility settings are preserved.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
