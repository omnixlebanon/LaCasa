require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { validateMenu, replaceCatalog } = require('../services/catalogReplacement');
const menu = require('../data/lacasa-menu.json');
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--local', '--supabase', '--check', '--apply'].includes(arg)) || args.includes('--local') === args.includes('--supabase') || args.includes('--check') === args.includes('--apply')) throw new Error('Use --local or --supabase, and --check or --apply.');
  validateMenu(menu);
  const postgres = args.includes('--supabase');
  let db, connection;
  try {
    if (postgres) {
      const url = process.env.SUPABASE_MIGRATION_URL || process.env.DATABASE_URL;
      if (!url) throw new Error('No Supabase connection configured.');
      const { Client } = require('pg');
      const { wrap, connectionOptions } = require('../config/postgres');
      const client = new Client(connectionOptions(url)); await client.connect();
      connection = wrap(client); db = { end: () => client.end() };
    } else {
      const mysql = require('mysql2/promise');
      db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true });
      connection = db;
    }
    const read = async (lock = '') => ({ products: (await connection.query('SELECT * FROM products' + lock))[0], categories: (await connection.query('SELECT * FROM product_categories' + lock))[0], recipes: (await connection.query('SELECT * FROM product_items' + lock))[0] });
    if (args.includes('--check')) {
      const before = await read();
      console.log(JSON.stringify({ target: postgres ? 'Supabase' : 'local MySQL', existingProducts: before.products.length, existingCategories: before.categories.length, recipeLinks: before.recipes.length, newProducts: menu.length, newCategories: new Set(menu.map(row => row.category)).size }));
      return;
    }
    // MySQL schema changes implicitly commit: back up first, then make additive changes.
    const backupDir = path.join(__dirname, '../catalog-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${postgres ? 'supabase' : 'local'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(await read(), null, 2), { flag: 'wx' });
    if (postgres) {
      await connection.beginTransaction();
      await connection.query('LOCK TABLE products, product_categories, product_items IN SHARE ROW EXCLUSIVE MODE');
      await connection.query('ALTER TABLE products ALTER COLUMN product_name TYPE VARCHAR(120)');
      await connection.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS product_description TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS product_image VARCHAR(255) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS pos_hidden SMALLINT NOT NULL DEFAULT 0");
      await connection.query('ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS pos_hidden SMALLINT NOT NULL DEFAULT 0');
    } else {
      await connection.query('ALTER TABLE products MODIFY COLUMN product_name VARCHAR(120)');
      const [columns] = await connection.query('SHOW COLUMNS FROM products');
      for (const [name, type] of [['product_description', 'TEXT NULL'], ['product_image', "VARCHAR(255) NOT NULL DEFAULT ''"], ['pos_hidden', 'TINYINT NOT NULL DEFAULT 0']]) if (!columns.some(column => column.Field === name)) await connection.query(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
      const [categoryColumns] = await connection.query('SHOW COLUMNS FROM product_categories');
      if (!categoryColumns.some(column => column.Field === 'pos_hidden')) await connection.query('ALTER TABLE product_categories ADD COLUMN pos_hidden TINYINT NOT NULL DEFAULT 0');
      await connection.beginTransaction();
    }
    const previous = await read(' FOR UPDATE');
    fs.writeFileSync(backupPath, JSON.stringify(previous, null, 2));
    const result = await replaceCatalog(connection, menu, previous);
    await connection.commit();
    console.log(JSON.stringify({ target: postgres ? 'Supabase' : 'local MySQL', ...result, backup: backupPath }));
  } catch (error) { if (connection) await connection.rollback().catch(() => {}); throw error; }
  finally { if (db) await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
