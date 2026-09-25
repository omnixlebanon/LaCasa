const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const bcrypt = require('bcrypt');
const { prepare, wrap, parsers } = require('../config/postgres');

// Real PostgreSQL engine in memory: no Supabase account or production data needed.
let engine, db, server, base, cookie, employeeId, today, month;
const queryParsers = Object.fromEntries([20, 1082, 1083, 1114, 1184, 1700].map(oid => [oid, parsers.getTypeParser(oid)]));
async function request(route, method = 'GET', body, bot = false) {
  const response = await fetch(base + '/api' + route, { method,
    headers: { 'Content-Type': 'application/json', ...(bot ? { 'x-bot-secret': 'test-bot-secret' } : { Cookie: cookie || '' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert(response.status < 500, `${method} ${route}: ${JSON.stringify(data)}`);
  return { status: response.status, data, headers: response.headers };
}
before(async () => {
  process.env.DATABASE_URL = 'postgresql://unused/test';
  process.env.JWT_TOKEN = 'postgres-integration-test-only';
  process.env.BOT_API_SECRET = 'test-bot-secret';
  process.env.APP_TIMEZONE = 'Asia/Beirut';
  engine = new PGlite();
  await engine.exec(fs.readFileSync(path.join(__dirname, '../config/supabase-schema.sql'), 'utf8'));
  await engine.query("SET TIME ZONE 'Asia/Beirut'");
  const client = { async query(config, values) {
    const result = await engine.query(typeof config === 'string' ? config : config.text,
      typeof config === 'string' ? values : config.values, { parsers: queryParsers });
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  }, release() {} };
  db = { ...wrap(client), getConnection: async () => wrap(client) };
  const dbPath = require.resolve('../config/database');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  await db.execute('INSERT INTO users (user_name,user_email,user_password_hash,user_position,access_level) VALUES (?,?,?,?,?)',
    ['Admin', 'admin@test.invalid', await bcrypt.hash('test-password', 4), 'Manager', 'admin']);
  const [[date]] = await db.query('SELECT CURRENT_DATE AS today');
  today = date.today; month = today.slice(0, 7);
  server = require('../server').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (engine) await engine.close();
});

test('parameters remain bound; literal question marks and mixed-case identifiers survive', () => {
  const result = prepare("SELECT '?' AS literal, exDate FROM items WHERE item_name = ? AND item_id IN (?)", ["x'); DROP TABLE users; --", [1, 2]]);
  assert.equal(result.text, "SELECT '?' AS literal, \"exDate\" FROM items WHERE item_name = $1 AND item_id IN ($2, $3)");
  assert.deepEqual(result.values, ["x'); DROP TABLE users; --", 1, 2]);
  assert.throws(() => prepare('SELECT ?', []), /Missing/);
});

test('login, employee creation and duplicate handling', async () => {
  assert.equal((await request('/employees')).status, 401);
  const login = await request('/auth/login', 'POST', { username: 'admin', password: 'test-password' });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await request('/auth/me')).data.user.name, 'Admin');
  const employee = await request('/employees', 'POST', { name: 'Cashier', email: 'cashier@test.invalid',
    password: 'test-password', position: 'Cashier', telegramId: '999001' });
  assert.equal(employee.status, 201); employeeId = employee.data.user_id;
  assert.equal(typeof employeeId, 'number');
  const duplicate = await request('/employees', 'POST', { name: 'cashier', email: 'other@test.invalid', password: 'test-password', position: 'Cashier' });
  assert.equal(duplicate.status, 409);
});

test('stock, recipes, checkout, expiration triggers and transaction rollback', async () => {
  const category = await request('/stock/categories', 'POST', { i_category_name: 'Ingredients' });
  assert.equal(category.status, 201);
  const item = await request('/items', 'POST', { stock_name: 'Flour', stock_category: 'Ingredients', stock_uom: 'kg',
    stock_limit: 2, stock_cost: 3, stock_shelf_life: 10, stock_supplier: 'Supplier' });
  assert.equal(item.status, 201, JSON.stringify(item.data));
  const [[ingredient]] = await db.query('SELECT * FROM items WHERE item_name = ?', ['Flour']);
  const id = ingredient.item_id;
  assert.equal((await request(`/stock/${id}/batch`, 'POST', { batch_stock: 20 })).status, 201);
  const items = (await request('/items')).data;
  assert.match(items[0].exDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(Number(items[0].stock), 20);
  assert.equal((await request('/stock/summary')).data.totalStockValue, 60);
  const product = await request('/products', 'POST', { product_name: 'Bread', product_category: 'Food', product_price: 5 });
  assert.equal(product.status, 201);
  assert.equal((await request(`/stock/recipe/${product.data.insertId}`, 'POST', { item_id: id, qty: 2 })).status, 201);
  assert.equal((await request('/products/summary')).data[0].cost, 6);
  const order = await request('/checkout', 'POST', { totalAmount: 10, customerName: 'Test',
    details: { items: [{ product_id: product.data.insertId, qty: 2 }] } });
  assert.equal(order.status, 201);
  assert.equal(typeof order.data.internalId, 'number');
  assert.equal(Number((await request('/items')).data[0].stock), 16);
  assert.equal((await request('/history')).data[0].details.items[0].qty, 2);
  const snapshot = (await request('/history')).data[0].details;
  assert.equal(snapshot.cost_snapshot_version, 1);
  assert.equal(snapshot.total_cost, 12);
  assert.equal(snapshot.items[0].unit_cost, 6);
  await db.execute('UPDATE items SET item_cost = ? WHERE item_id = ?', [20, id]);
  assert.equal((await request('/history')).data[0].details.total_cost, 12);
  await db.execute('UPDATE items SET item_cost = ? WHERE item_id = ?', [3, id]);

  await db.beginTransaction();
  await db.execute('UPDATE items SET item_cost = ? WHERE item_id = ?', [999, id]);
  await db.rollback();
  assert.equal(Number((await request('/items')).data[0].item_cost), 3);
  await db.execute('INSERT INTO batches (item_id,batch_stock,batch_exDate) VALUES (?,?,?)', [id, 2, '2000-01-01']);
  const expired = (await request('/stock/expired-batches')).data;
  assert.equal(expired.length, 1);
  assert.equal((await request('/stock/discard-expired', 'POST', { batches: expired })).status, 200);
  assert.notEqual((await request('/items')).data[0].exDate, '2000-01-01');
});

test('seating array parameters and category transactions', async () => {
  const layout = await request('/seating/layout', 'POST', { floors: [{ floor_id: -1, floor_name: 'Main',
    tables: [{ t_id: -1, floor_id: -1, t_name: 'T1', t_type: 'square', t_seats: 4 }] }] });
  assert.equal(layout.status, 200);
  assert.equal((await request('/seating/floors')).data[0].tables.length, 1);
  assert.equal((await request('/seating/layout', 'POST', { floors: [] })).status, 200);
  assert.equal((await request('/seating/floors')).data.length, 0);
  await db.execute('INSERT INTO product_categories (p_category_name) VALUES (?)', ['Food']);
  assert.equal((await request('/products/category', 'PUT', { old_name: 'Food', new_name: 'Meals' })).status, 200);
  assert.equal((await request('/products')).data[0].product_category, 'Meals');
  assert.equal((await request('/products/category/Meals', 'DELETE')).status, 200);
  assert.equal((await request('/products')).data[0].product_category, null);
});

test('recurring shifts, check-in JSON, payroll upserts and refund deductions', async () => {
  const rule = await request('/recurring-shifts', 'POST', { userId: employeeId, date: today,
    weekdays: [1,2,3,4,5,6,7], startTime: '00:00', endTime: '23:59', notes: 'Daily' });
  assert.equal(rule.status, 201, JSON.stringify(rule.data));
  const shifts = await request(`/shifts?from=${today}&to=${today}`);
  assert.equal(shifts.data.length, 1);
  assert.equal((await request(`/shifts?from=${today}&to=${today}`)).data.length, 1);
  const checkin = await request('/bot/requests', 'POST', { telegramId: '999001', type: 'shift_checkin', payload: { shiftId: shifts.data[0].shift_id } }, true);
  assert.equal(checkin.status, 201);
  assert(checkin.data.lateMinutes >= 0);
  assert.equal((await request(`/management/requests/${checkin.data.requestId}`, 'PATCH', { status: 'approved' })).status, 200);
  assert.equal((await request(`/employees/${employeeId}/salary`, 'PUT', { month, amount: 1000 })).status, 200);
  assert.equal((await request(`/employees/${employeeId}/salary`, 'PUT', { month, amount: 1100 })).status, 200);
  await db.execute('INSERT INTO orders_history (order_id,total_amount,details) VALUES (?,?,?)', ['refund-test', 25, '{}']);
  const [refund] = await db.execute("INSERT INTO workflow_requests (user_id,request_type,payload) VALUES (?,'refund',?)", [employeeId, JSON.stringify({ orderId: 'refund-test', orderAmount: 25 })]);
  assert.equal((await request(`/management/requests/${refund.insertId}`, 'PATCH', { status: 'rejected' })).status, 200);
  const payroll = (await request('/employees/payroll?month=' + month)).data.find(e => e.userId === employeeId);
  assert.equal(payroll.deductionsTotal, 25); assert.equal(payroll.payableAmount, 1075);
  assert.equal(payroll.attendance.length, 1);
  assert.equal((await request(`/employees/${employeeId}/payroll-payment`, 'PUT', { month, status: 'paid', expectedAmount: 1075 })).status, 200);
  assert.equal((await request(`/employees/${employeeId}/payroll-payment`, 'PUT', { month, status: 'unpaid' })).status, 200);
  assert.equal((await request('/management/requests')).status, 200);
  assert.equal((await request('/bot/notifications', 'GET', undefined, true)).status, 200);
});

test('Supabase browser roles cannot read employee credentials or orders', async () => {
  await engine.exec('CREATE ROLE anon; GRANT USAGE ON SCHEMA public TO anon; GRANT SELECT ON users TO anon; SET ROLE anon;');
  const rows = await engine.query('SELECT * FROM users');
  assert.equal(rows.rows.length, 0);
  await engine.exec('RESET ROLE');
});

test('bot stock receipts, usage, evidence delivery and stopping a series', async () => {
  const [[item]] = await db.query('SELECT * FROM items WHERE item_name = ?', ['Flour']);
  const before = Number(item.stock);
  const receipt = await request('/bot/requests', 'POST', { telegramId: '999001', type: 'stock_receipt',
    payload: { items: [{ item_name: 'Flour', qty: 3 }] } }, true);
  assert.equal(receipt.status, 201);
  assert.equal((await request(`/management/requests/${receipt.data.requestId}`, 'PATCH', { status: 'approved' })).status, 200);
  const usage = await request('/bot/requests', 'POST', { telegramId: '999001', type: 'stock_usage',
    payload: { itemName: 'Flour', quantity: 1.5 } }, true);
  assert.equal((await request(`/management/requests/${usage.data.requestId}`, 'PATCH', { status: 'approved' })).status, 200);
  assert.equal(Number((await request('/items')).data[0].stock), before + 1.5);
  const evidence = 'data:image/png;base64,aGVsbG8=';
  const [refund] = await db.execute("INSERT INTO workflow_requests (user_id,request_type,payload) VALUES (?,'refund',?)", [employeeId, JSON.stringify({ evidenceData: evidence })]);
  const listed = (await request('/management/requests?type=refund')).data.find(r => r.request_id === refund.insertId);
  assert.equal(listed.payload.evidenceData, `/api/management/requests/${refund.insertId}/evidence`);
  const image = await fetch(base + listed.payload.evidenceData, { headers: { Cookie: cookie } });
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(await image.text(), 'hello');
  assert.equal((await fetch(base + listed.payload.evidenceData)).status, 401);
  const [[rule]] = await db.query('SELECT recurrence_id FROM recurring_shifts LIMIT 1');
  assert.equal((await request(`/recurring-shifts/${rule.recurrence_id}/stop`, 'PATCH', { from: today })).status, 200);
});

test('migration copies JSON, IDs and dates; refuses existing tables and rolls back failures', async () => {
  const { migrate, tables } = require('../scripts/migrate-supabase');
  process.env.SUPABASE_MIGRATION_URL = 'postgresql://unused/migration-test';
  const columns = {};
  for (const name of tables) {
    const result = await engine.query(`SELECT column_name, data_type, is_identity FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [name]);
    columns[name] = result.rows.map(c => ({ Field: c.column_name, Type: c.data_type === 'jsonb' ? 'json' : c.data_type,
      Extra: c.is_identity === 'YES' ? 'auto_increment' : '', Key: c.is_identity === 'YES' ? 'PRI' : '' }));
    if (!columns[name].some(c => c.Key === 'PRI')) columns[name][0].Key = 'PRI';
  }
  const fixtures = {
    users: [{ user_id: 42, user_name: "O'Brien", user_email: 'copy@test.invalid', user_password_hash: 'existing-hash',
      user_position: 'Manager', access_level: 'admin', telegram_id: null, created_at: '2026-01-15 09:30:00' }],
    recurring_shifts: [{ recurrence_id: 90, user_id: 42, month_days: null, weekdays: [1,3], starts_on: '2026-01-15',
      stopped_from: null, start_time: '09:00:00', end_time: '17:00:00', notes: null, created_at: '2026-01-15 09:30:00' }],
  };
  const fakeSource = { async query(sql, values) {
    if (sql === 'SHOW TABLES') return [tables.map(name => ({ table: name }))];
    if (sql.startsWith('SET ') || sql.startsWith('START ')) return [[]];
    const name = /`(\w+)`/.exec(sql)?.[1];
    if (sql.startsWith('SHOW COLUMNS')) return [columns[name]];
    if (sql.startsWith('SELECT COUNT')) return [[{ count: (fixtures[name] || []).length }]];
    if (sql.startsWith('SELECT *')) return [values[0] === 0 ? fixtures[name] || [] : []];
    throw new Error('Unexpected source query: ' + sql);
  }, async rollback() {}, async end() {} };
  const target = new PGlite();
  const factories = { createSource: async () => fakeSource,
    createTarget: () => ({ async connect() {}, async end() {}, async query(sql, values) {
      if (sql.includes('CREATE TABLE users')) return target.exec(sql);
      return target.query(sql, values, { parsers: queryParsers });
    } }) };
  try {
    await migrate('--check', factories);
    assert.equal((await target.query("SELECT * FROM pg_tables WHERE schemaname = 'public'")).rows.length, 0);
    // A bad row after users were copied must also remove the newly created schema.
    fixtures.recurring_shifts[0].user_id = 999;
    await assert.rejects(migrate('--copy', factories), error => error.code === '23503');
    assert.equal((await target.query("SELECT * FROM pg_tables WHERE schemaname = 'public'")).rows.length, 0);
    fixtures.recurring_shifts[0].user_id = 42;
    await migrate('--copy', factories);
    const copied = (await target.query('SELECT * FROM recurring_shifts', [], { parsers: queryParsers })).rows[0];
    assert.deepEqual(copied.weekdays, [1,3]); assert.equal(copied.starts_on, '2026-01-15');
    const inserted = await target.query("INSERT INTO users (user_name,user_email,user_password_hash,user_position) VALUES ('Next','next@test.invalid','hash','Cashier') RETURNING user_id");
    assert.equal(inserted.rows[0].user_id, 43);
    await assert.rejects(migrate('--copy', factories), /Refusing to overwrite/);
  } finally { await target.close(); }
});


test('expenses CRUD, month filtering and admin permissions', async () => {
  const auth = await request('/auth/login', 'POST', { username: 'admin', password: 'test-password' });
  cookie = auth.headers.get('set-cookie').split(';')[0];
  const input = { category: 'furniture', description: 'Dining tables', amount: '120.50', date: '2026-09-25' };
  const created = await request('/expenses', 'POST', input);
  assert.equal(created.status, 201); assert.ok(created.data.id);
  let list = await request('/expenses?month=2026-09');
  assert.ok(list.data.some(row => row.expense_id === created.data.id && Number(row.amount) === 120.50));
  assert.equal((await request('/expenses?month=2026-08')).data.some(row => row.expense_id === created.data.id), false);
  assert.equal((await request('/expenses', 'POST', { ...input, amount: -1 })).status, 400);
  assert.equal((await request(`/expenses/${created.data.id}`, 'PATCH', { ...input, amount: '90.00' })).status, 200);
  list = await request('/expenses?month=2026-09');
  assert.equal(Number(list.data.find(row => row.expense_id === created.data.id).amount), 90);
  const adminCookie = cookie;
  cookie = '';
  assert.equal((await request('/expenses?month=2026-09')).status, 401);
  const jwt = require('jsonwebtoken');
  cookie = 'token=' + jwt.sign({ user_id: 1, access_level: 'employee' }, process.env.JWT_TOKEN);
  assert.equal((await request('/expenses?month=2026-09')).status, 403);
  assert.equal((await request('/expenses', 'POST', input)).status, 403);
  assert.equal((await request(`/expenses/${created.data.id}`, 'PATCH', input)).status, 403);
  assert.equal((await request(`/expenses/${created.data.id}`, 'DELETE')).status, 403);
  cookie = adminCookie;
  assert.equal((await request(`/expenses/${created.data.id}`, 'DELETE')).status, 200);
  assert.equal((await request(`/expenses/${created.data.id}`, 'DELETE')).status, 404);
  await engine.exec(fs.readFileSync(path.join(__dirname, '../config/expenses-postgres.sql'), 'utf8'));
});

test('repeating expense records expand without duplicate writes and preserve history', async () => {
  const auth = await request('/auth/login', 'POST', { username: 'admin', password: 'test-password' });
  cookie = auth.headers.get('set-cookie').split(';')[0];
  const input = { category: 'rent', description: 'Monthly rent', amount: '300.00', date: '2024-01-31', frequency: 'monthly', repeat_until: '2024-03-31' };
  const created = await request('/expenses', 'POST', input);
  assert.equal(created.status, 201);
  const list = (await request('/expenses?from=2024-01-01&through=2024-12-31')).data.filter(row => row.expense_id === created.data.id);
  assert.deepEqual(list.map(row => row.expense_date), ['2024-03-31', '2024-02-29', '2024-01-31']);
  assert.equal((await request('/expenses?month=2024-02')).data.filter(row => row.expense_id === created.data.id).length, 1);
  assert.equal((await request('/expenses?month=2024-02')).data.filter(row => row.expense_id === created.data.id).length, 1);
  assert.equal((await request(`/expenses/${created.data.id}`, 'PATCH', input)).status, 409);
  assert.equal((await request(`/expenses/${created.data.id}`, 'DELETE')).status, 409);
  assert.equal((await request(`/expenses/${created.data.id}/stop`, 'PATCH', { from: '2024-02-01' })).status, 400);
  assert.equal((await request(`/expenses/${created.data.id}/stop`, 'PATCH', { from: today })).status, 200);
  assert.equal((await request(`/expenses/${created.data.id}/stop`, 'PATCH', { from: today })).status, 409);
  assert.equal((await request('/expenses?month=2024-02')).data.filter(row => row.expense_id === created.data.id).length, 1);
});

test('checkout ignores supplied costs, flags missing recipes, and rolls back failed orders', async () => {
  const checkout = require('../services/historyService');
  const [[product]] = await db.query('SELECT product_id FROM products ORDER BY product_id LIMIT 1');
  const [[beforeCount]] = await db.query('SELECT COUNT(*) AS count FROM orders_history');
  const beforeStock = (await db.query('SELECT item_id, stock FROM items ORDER BY item_id'))[0];
  const failed = await checkout(10, 'Rollback', { items: [{ product_id: product.product_id, qty: 1, price: 10 }], table_id: 'not-an-integer' });
  assert.equal(failed.success, false);
  const [[afterCount]] = await db.query('SELECT COUNT(*) AS count FROM orders_history');
  assert.equal(afterCount.count, beforeCount.count);
  assert.deepEqual((await db.query('SELECT item_id, stock FROM items ORDER BY item_id'))[0], beforeStock);
  const result = await checkout(10, 'Snapshot', { cost_snapshot_version: 1, total_cost: 9999, items: [{ product_id: product.product_id, qty: 1, price: 10, unit_cost: 9999, total_cost: 9999 }] });
  assert.equal(result.success, true);
  const [[saved]] = await db.query('SELECT details FROM orders_history WHERE internal_id = ?', [result.internalId]);
  assert.notEqual(saved.details.total_cost, 9999);
  assert.notEqual(saved.details.items[0].unit_cost, 9999);
  const [bare] = await db.execute('INSERT INTO products (product_name, product_price) VALUES (?, ?)', ['No recipe', 5]);
  const zero = await checkout(5, 'No recipe', { items: [{ product_id: bare.insertId, qty: 1, price: 5, unit_cost: 500 }] });
  assert.equal(zero.success, true);
  const [[zeroSaved]] = await db.query('SELECT details FROM orders_history WHERE internal_id = ?', [zero.internalId]);
  assert.equal(zeroSaved.details.items[0].unit_cost, 0);
  assert.equal(zeroSaved.details.items[0].cost_source, 'no_recipe');
});

test('POS visibility filters products/categories while keeping management and history intact', async () => {
  const auth = await request('/auth/login', 'POST', { username: 'admin', password: 'test-password' });
  cookie = auth.headers.get('set-cookie').split(';')[0];
  const [category] = await db.execute('INSERT INTO product_categories (p_category_name) VALUES (?)', ['Visibility test']);
  const [one] = await db.execute('INSERT INTO products (product_name, product_category, product_price) VALUES (?, ?, ?)', ['Visible one', 'Visibility test', 5]);
  const [two] = await db.execute('INSERT INTO products (product_name, product_category, product_price) VALUES (?, ?, ?)', ['Hidden two', 'Visibility test', 6]);
  assert.equal((await request(`/products/${two.insertId}/visibility`, 'PATCH', { hidden: true })).status, 200);
  let visible = (await request('/products?scope=pos')).data;
  assert.ok(visible.some(p => p.product_id === one.insertId));
  assert.ok(!visible.some(p => p.product_id === two.insertId));
  assert.ok((await request('/products')).data.some(p => p.product_id === two.insertId));
  assert.equal((await request(`/products/categories/${category.insertId}/visibility`, 'PATCH', { hidden: true })).status, 200);
  assert.ok(!(await request('/products?scope=pos')).data.some(p => p.product_category === 'Visibility test'));
  assert.ok(!(await request('/products/categories?scope=pos')).data.some(c => c.p_category_id === category.insertId));
  assert.ok((await request('/products/categories')).data.some(c => c.p_category_id === category.insertId));
  assert.equal((await request(`/products/categories/${category.insertId}/visibility`, 'PATCH', { hidden: false })).status, 200);
  visible = (await request('/products?scope=pos')).data;
  assert.ok(visible.some(p => p.product_id === one.insertId));
  assert.ok(!visible.some(p => p.product_id === two.insertId));
  assert.equal((await request(`/products/${two.insertId}/visibility`, 'PATCH', { hidden: 'false' })).status, 400);
  assert.equal((await request('/products/9999999/visibility', 'PATCH', { hidden: true })).status, 404);
  const admin = cookie;
  cookie = 'token=' + require('jsonwebtoken').sign({ user_id: 1, access_level: 'employee' }, process.env.JWT_TOKEN);
  assert.equal((await request(`/products/${one.insertId}/visibility`, 'PATCH', { hidden: true })).status, 403);
  assert.equal((await request(`/products/categories/${category.insertId}/visibility`, 'PATCH', { hidden: true })).status, 403);
  cookie = admin;
});
