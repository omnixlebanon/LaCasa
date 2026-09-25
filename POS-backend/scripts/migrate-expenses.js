require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--supabase')) throw new Error('Usage: npm run migrate:expenses -- [--supabase]');
  const useSupabase = args.includes('--supabase');
  const connectionString = useSupabase
    ? process.env.SUPABASE_MIGRATION_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL;
  if (useSupabase && !connectionString) throw new Error('Set SUPABASE_MIGRATION_URL or DATABASE_URL for the Supabase database first.');
  const postgres = !!connectionString;
  console.log(`Preparing expenses in ${postgres ? 'PostgreSQL' : 'MySQL'} (${useSupabase && process.env.SUPABASE_MIGRATION_URL ? 'SUPABASE_MIGRATION_URL' : postgres ? 'DATABASE_URL' : 'DB_HOST / DB_NAME'}).`);
  const sql = fs.readFileSync(path.join(__dirname, '../config', postgres ? 'expenses-postgres.sql' : 'expenses-mysql.sql'), 'utf8');
  if (postgres) {
    const { Client } = require('pg');
    const { connectionOptions } = require('../config/postgres');
    const client = new Client(connectionOptions(connectionString));
    try { await client.connect(); await client.query('BEGIN'); await client.query(sql); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { await client.end(); }
  } else {
    const db = require('../config/database');
    try { for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.query(statement); } finally { await db.end(); }
  }
  console.log(`Expenses table is ready in the configured ${postgres ? 'PostgreSQL' : 'MySQL'} database.`);
  if (!postgres) console.log('This does not update a separate Vercel/Supabase database. For Supabase, run npm run migrate:expenses -- --supabase with its connection URL configured.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
