require('dotenv').config();
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--supabase')) throw new Error('Usage: npm run migrate:menu-order -- [--supabase]');
  const cloud = args.includes('--supabase');
  const url = cloud ? process.env.SUPABASE_MIGRATION_URL || process.env.DATABASE_URL : process.env.DATABASE_URL;
  if (cloud && !url) throw new Error('Configure SUPABASE_MIGRATION_URL or DATABASE_URL first.');
  if (url) {
    const { Client } = require('pg');
    const { connectionOptions } = require('../config/postgres');
    const client = new Client(connectionOptions(url));
    try {
      await client.connect(); await client.query('BEGIN');
      for (const table of ['products', 'product_categories']) await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS menu_position INTEGER NOT NULL DEFAULT 2147483647`);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { await client.end(); }
  } else {
    const db = require('../config/database');
    try {
      for (const table of ['products', 'product_categories']) {
        const [columns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE 'menu_position'`);
        if (!columns.length) await db.query(`ALTER TABLE ${table} ADD COLUMN menu_position INTEGER NOT NULL DEFAULT 2147483647`);
      }
    } finally { await db.end(); }
  }
  console.log(`Menu ordering is ready in ${url ? 'PostgreSQL' : 'MySQL'}. Existing products and categories are preserved.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
