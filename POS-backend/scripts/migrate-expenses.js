require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const postgres = !!process.env.DATABASE_URL;
  const sql = fs.readFileSync(path.join(__dirname, '../config', postgres ? 'expenses-postgres.sql' : 'expenses-mysql.sql'), 'utf8');
  if (postgres) {
    const { Client } = require('pg');
    const { connectionOptions } = require('../config/postgres');
    const client = new Client(connectionOptions(process.env.DATABASE_URL));
    try { await client.connect(); await client.query('BEGIN'); await client.query(sql); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { await client.end(); }
  } else {
    const db = require('../config/database');
    try { await db.query(sql); } finally { await db.end(); }
  }
  console.log('Expenses table is ready.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
