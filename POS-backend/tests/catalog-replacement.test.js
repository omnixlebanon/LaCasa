const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { wrap, parsers } = require('../config/postgres');
const { validateMenu, replaceCatalog } = require('../services/catalogReplacement');
const menu = require('../data/lacasa-menu.json');
test('menu contains all active entries, distinct variants and supplied prices', () => {
  validateMenu(menu);
  assert.equal(menu.length, 91); assert.equal(new Set(menu.map(row => row.category)).size, 16);
  assert.equal(menu.find(row => row.productName === 'Espresso').price, 1);
  assert.equal(menu.filter(row => row.name === 'Nescafe').length, 2);
  assert.ok(!menu.some(row => row.name === 'Nutella Crepe'));
});
test('replacement keeps matching IDs and recipes, preserves order history, and is repeatable', async () => {
  const engine = new PGlite();
  try {
    await engine.exec(require('node:fs').readFileSync(require('node:path').join(__dirname, '../config/supabase-schema.sql'), 'utf8'));
    const connection = wrap({ async query(config, values) {
      const result = await engine.query(typeof config === 'string' ? config : config.text, typeof config === 'string' ? values : config.values, { parsers: Object.fromEntries([20,1082,1114,1700].map(oid => [oid, parsers.getTypeParser(oid)])) });
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    } });
    await engine.exec("INSERT INTO product_categories (p_category_name) VALUES ('Hot Drinks'), ('Old'); INSERT INTO products (product_name,product_category,product_price) VALUES ('Espresso','Hot Drinks',9),('Old product','Old',4); INSERT INTO items (item_name,stock,uom) VALUES ('Coffee',20,'kg'); INSERT INTO product_items(product_id,item_id,qty) VALUES (1,1,1),(2,1,2); INSERT INTO orders_history(order_id,total_amount,details) VALUES ('past-order',4,'{\"items\":[{\"product_id\":2,\"product_name\":\"Old product\",\"qty\":1,\"price\":4}]}');");
    for (let attempt = 0; attempt < 2; attempt++) {
      await connection.beginTransaction();
      const previous = { products: (await connection.query('SELECT * FROM products'))[0], categories: (await connection.query('SELECT * FROM product_categories'))[0] };
      const result = await replaceCatalog(connection, menu, previous);
      await connection.commit();
      assert.equal(result.products, 91); assert.equal(result.categories, 16);
      if (attempt) assert.equal(result.inserted, 0);
      assert.equal((await connection.query("SELECT product_id FROM products WHERE product_name = 'Espresso'"))[0][0].product_id, 1);
      assert.equal((await connection.query('SELECT * FROM product_items'))[0].length, 1);
      assert.equal((await connection.query('SELECT * FROM orders_history'))[0][0].details.items[0].product_name, 'Old product');
      assert.equal(Number((await connection.query('SELECT stock FROM items'))[0][0].stock), 20);
    }
  } finally { await engine.close(); }
});
