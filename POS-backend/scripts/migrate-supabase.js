require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { connectionOptions } = require('../config/postgres');

// Parent tables first. Never overwrite an existing target table or modify MySQL.
const tables = ['users', 'floors', 'tablez', 'item_categories', 'items', 'suppliers', 'batches',
  'product_categories', 'products', 'product_items', 'monthly_order_sequences', 'orders_history',
  'recurring_shifts', 'shifts', 'workflow_requests', 'shift_checkins', 'employee_salary_rates',
  'salary_deductions', 'employee_payroll_payments', 'payroll_payment_events'];
const quote = name => '"' + name.replaceAll('"', '""') + '"';

async function migrate(mode, factories = {}) {
  if (!['--check', '--copy', '--schema-only'].includes(mode)) {
    throw new Error('Use --check (read-only), --copy (schema + MySQL data), or --schema-only (empty installation).');
  }
  if (!process.env.SUPABASE_MIGRATION_URL) throw new Error('Set SUPABASE_MIGRATION_URL to a direct or session-pooler PostgreSQL URL.');
  const target = factories.createTarget ? factories.createTarget() : new Client(connectionOptions(process.env.SUPABASE_MIGRATION_URL));
  let source, targetTransaction = false;
  try {
    await target.connect();
    const existing = await target.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])', ['public', tables]);
    if (existing.rows.length) throw new Error('Target contains POS tables. Refusing to overwrite: ' + existing.rows.map(r => r.tablename).join(', '));
    if (mode !== '--schema-only') {
      source = await (factories.createSource || mysql.createConnection)({ host: process.env.DB_HOST, user: process.env.DB_USER,
        password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true,
        supportBigNumbers: true, bigNumberStrings: true });
      await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const [sourceTables] = await source.query('SHOW TABLES');
      const names = sourceTables.map(row => Object.values(row)[0]);
      const missing = tables.filter(name => !names.includes(name));
      const extra = names.filter(name => !tables.includes(name));
      if (missing.length || extra.length) throw new Error(`Schema differs from the baseline. Missing: ${missing.join(', ') || 'none'}; additional: ${extra.join(', ') || 'none'}. Review before migrating.`);
    }
    if (mode === '--check') {
      for (const name of tables) {
        const [[row]] = await source.query('SELECT COUNT(*) AS count FROM ' + mysql.escapeId(name));
        console.log(`${name}: ${row.count} rows`);
      }
      console.log('Target is empty of POS tables. No changes made.');
      return;
    }
    await target.query('BEGIN');
    targetTransaction = true;
    await target.query("SET LOCAL search_path = public, pg_catalog");
    await target.query("SELECT set_config('TimeZone', $1, true)", [process.env.APP_TIMEZONE || 'Asia/Beirut']);
    await target.query(fs.readFileSync(path.join(__dirname, '../config/supabase-schema.sql'), 'utf8'));
    if (source) {
      // Data import should preserve stored values, not replay operational triggers.
      await target.query('ALTER TABLE batches DISABLE TRIGGER batch_expiration');
      for (const name of tables) {
        const [columns] = await source.query('SHOW COLUMNS FROM ' + mysql.escapeId(name));
        const targetColumns = await target.query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['public', name]);
        const targetNames = new Set(targetColumns.rows.map(c => c.column_name));
        if (columns.some(c => !targetNames.has(c.Field)) || targetNames.size !== columns.length) throw new Error(`Column mismatch in ${name}; migration rolled back.`);
        const names = columns.map(c => c.Field);
        const primary = columns.filter(c => c.Key === 'PRI').map(c => mysql.escapeId(c.Field)).join(', ');
        const jsonColumns = new Set(columns.filter(c => c.Type === 'json').map(c => c.Field));
        let copied = 0;
        for (;;) {
          const [rows] = await source.query(`SELECT * FROM ${mysql.escapeId(name)} ORDER BY ${primary} LIMIT 250 OFFSET ?`, [copied]);
          if (!rows.length) break;
          for (const row of rows) {
            const values = names.map(column => jsonColumns.has(column) && row[column] !== null
              ? (typeof row[column] === 'string' ? row[column] : JSON.stringify(row[column])) : row[column]);
            await target.query(`INSERT INTO public.${quote(name)} (${names.map(quote).join(', ')}) VALUES (${names.map((_, i) => '$' + (i + 1)).join(', ')})`, values);
          }
          copied += rows.length;
        }
        const count = await target.query(`SELECT COUNT(*) AS count FROM public.${quote(name)}`);
        if (Number(count.rows[0].count) !== copied) throw new Error(`Row-count verification failed for ${name}`);
        for (const column of columns.filter(c => c.Extra.includes('auto_increment'))) {
          const sequence = await target.query('SELECT pg_get_serial_sequence($1, $2) AS name', ['public.' + quote(name), column.Field]);
          const maximum = await target.query(`SELECT MAX(${quote(column.Field)}) AS id FROM public.${quote(name)}`);
          await target.query('SELECT setval($1::regclass, $2::bigint, $3)', [sequence.rows[0].name, maximum.rows[0].id || 1, maximum.rows[0].id !== null]);
        }
        console.log(`${name}: verified ${copied} rows`);
      }
      await target.query('ALTER TABLE batches ENABLE TRIGGER batch_expiration');
    }
    await target.query('COMMIT');
    targetTransaction = false;
    console.log('Supabase migration committed. MySQL was not modified.');
  } finally {
    if (targetTransaction) await target.query('ROLLBACK');
    if (source) { await source.rollback(); await source.end(); }
    await target.end();
  }
}
if (require.main === module) migrate(process.argv[2]).catch(error => {
  // Avoid printing pg error details, which can contain employee or order data.
  console.error(error.code ? `Migration failed (${error.code}); no target changes committed.` : error.message);
  process.exitCode = 1;
});
module.exports = { migrate, tables };
