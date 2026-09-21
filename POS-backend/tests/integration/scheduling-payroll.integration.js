const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config({ quiet: true });

const sourceDatabase = process.env.DB_NAME;
const testDatabase = `pos_feature_test_${process.pid}_${Date.now()}`;
let adminConnection, db, server, baseUrl, adminId, employeeId, otherId, adminCookie, employeeCookie, month, today;
const telegramId = '999990001';

async function request(path, { method = 'GET', body, employee = false, bot = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method,
    headers: { 'Content-Type': 'application/json', ...(bot ? { 'x-bot-secret': 'test-bot-secret' } : { Cookie: employee ? employeeCookie : adminCookie }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  adminConnection = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  assert.match(testDatabase, /^pos_feature_test_\d+_\d+$/);
  assert.notEqual(testDatabase, sourceDatabase);
  await adminConnection.query(`CREATE DATABASE \`${testDatabase}\``);
  await adminConnection.query(`USE \`${testDatabase}\``);
  // Clone only schema, never employee data. Keep the real constraints for meaningful integration checks.
  for (const table of ['users', 'recurring_shifts', 'shifts', 'workflow_requests', 'shift_checkins', 'orders_history']) {
    const [[definition]] = await adminConnection.query(`SHOW CREATE TABLE \`${sourceDatabase.replaceAll('`', '``')}\`.\`${table}\``);
    await adminConnection.query(definition['Create Table']);
  }
  process.env.DB_NAME = testDatabase;
  process.env.JWT_TOKEN = 'isolated-payroll-test-secret';
  process.env.BOT_API_SECRET = 'test-bot-secret';
  db = require('../../config/database');
  const migrate = require('../../config/migrate-scheduling-payroll');
  await migrate(); await migrate(); // Migration must also be repeatable.
  for (const [name, access, telegram] of [['Admin', 'admin', null], ['Employee', 'employee', telegramId], ['Other', 'employee', null]]) {
    const [row] = await db.execute('INSERT INTO users (user_name, user_email, user_password_hash, user_position, access_level, telegram_id) VALUES (?, ?, ?, ?, ?, ?)', [name, `${name}@test.invalid`, 'unused', 'Cashier', access, telegram]);
    if (name === 'Admin') adminId = row.insertId; else if (name === 'Employee') employeeId = row.insertId; else otherId = row.insertId;
  }
  adminCookie = `token=${jwt.sign({ user_id: adminId, access_level: 'admin' }, process.env.JWT_TOKEN)}`;
  employeeCookie = `token=${jwt.sign({ user_id: employeeId, access_level: 'employee' }, process.env.JWT_TOKEN)}`;
  const [[date]] = await db.query('SELECT CURDATE() AS today'); today = date.today; month = today.slice(0, 7);
  const { verifyToken } = require('../../middleware/auth');
  const workflow = require('../../routes/workflowRout');
  const app = express(); app.use(express.json()); app.use(cookieParser());
  app.use('/api/bot', workflow.botRouter);
  app.use('/api', verifyToken, require('../../routes/employeeRout'));
  app.use('/api', verifyToken, require('../../routes/historyRout'));
  app.use('/api', verifyToken, workflow.managementRouter);
  app.use('/api', verifyToken, require('../../routes/payrollRout'));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.end();
  if (adminConnection) {
    assert.match(testDatabase, /^pos_feature_test_\d+_\d+$/);
    assert.notEqual(testDatabase, sourceDatabase);
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
    await adminConnection.end();
  }
});

test('weekly shifts persist indefinitely, generation is idempotent, and a cancelled date stays cancelled', async () => {
  const created = await request('/api/recurring-shifts', { method: 'POST', body: { userId: employeeId, date: '2030-01-01', startTime: '09:00', endTime: '17:00', weekdays: [1, 3, 7] } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const path = '/api/shifts?from=2040-02-01&to=2040-02-14';
  const first = await request(path); const second = await request(path);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.deepEqual(first.data.map(s => s.shift_date), ['2040-02-01', '2040-02-05', '2040-02-06', '2040-02-08', '2040-02-12', '2040-02-13']);
  assert.deepEqual(first.data.map(s => s.shift_id), second.data.map(s => s.shift_id));
  const removed = await request(`/api/shifts/${first.data[0].shift_id}`, { method: 'DELETE' });
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.equal((await request(path)).data.length, 5);
  const stop = await request(`/api/recurring-shifts/${created.data.recurrence_id}/stop`, { method: 'PATCH', body: { from: '2040-02-08' } });
  assert.equal(stop.status, 200, JSON.stringify(stop.data));
  assert.deepEqual((await request(path)).data.map(s => s.shift_date), ['2040-02-05', '2040-02-06']);
  assert.equal((await request('/api/shifts?from=2046-01-01&to=2046-01-31')).data.length, 0);
});

test('non-admins cannot change schedules or see payroll and see only their shifts', async () => {
  assert.equal((await request('/api/employees/payroll?month=' + month, { employee: true })).status, 403);
  assert.equal((await request('/api/recurring-shifts', { employee: true, method: 'POST', body: {} })).status, 403);
  await request('/api/shifts', { method: 'POST', body: { userId: otherId, date: today, startTime: '08:00', endTime: '16:00' } });
  const own = await request(`/api/shifts?from=${today}&to=${today}`, { employee: true });
  assert.equal(own.status, 200);
  assert(own.data.every(s => s.user_id === employeeId));
});

test('rejected refunds deduct once, salary rates persist forward, and payment changes are visible', async () => {
  const saved = await request(`/api/employees/${employeeId}/salary`, { method: 'PUT', body: { month, amount: '1000.00' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  await db.execute('INSERT INTO orders_history (order_id, customer_name, total_amount, details) VALUES (?, ?, ?, ?)', ['test-refund-1', 'Test', '35.25', JSON.stringify({ items: [] })]);
  const refund = await request('/api/history/test-refund-1/refund-request', { employee: true, method: 'POST', body: { reason: 'Damaged order', confirmed: true } });
  assert.equal(refund.status, 201, JSON.stringify(refund.data));
  const reviewed = await request(`/api/management/requests/${refund.data.requestId}`, { method: 'PATCH', body: { status: 'rejected' } });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data));
  assert.equal((await request(`/api/management/requests/${refund.data.requestId}`, { method: 'PATCH', body: { status: 'rejected' } })).status, 404);
  const retry = await request('/api/history/test-refund-1/refund-request', { employee: true, method: 'POST', body: { reason: 'Repeated submission', confirmed: true } });
  assert.equal((await request(`/api/management/requests/${retry.data.requestId}`, { method: 'PATCH', body: { status: 'rejected' } })).status, 200);
  let payroll = (await request('/api/employees/payroll?month=' + month)).data.find(e => e.userId === employeeId);
  assert.equal(payroll.deductionsTotal, 35.25); assert.equal(payroll.deductions.length, 1); assert.equal(payroll.netSalary, 964.75);
  const paymentPath = `/api/employees/${employeeId}/payroll-payment`;
  assert.equal((await request(paymentPath, { method: 'PUT', body: { month, status: 'paid', expectedAmount: 1000 } })).status, 409);
  assert.equal((await request(paymentPath, { method: 'PUT', body: { month, status: 'paid', expectedAmount: 964.75 } })).status, 200);
  payroll = (await request('/api/employees/payroll?month=' + month)).data.find(e => e.userId === employeeId);
  assert.equal(payroll.paymentStatus, 'paid');
  await request(`/api/employees/${employeeId}/salary`, { method: 'PUT', body: { month, amount: '1100.00' } });
  payroll = (await request('/api/employees/payroll?month=' + month)).data.find(e => e.userId === employeeId);
  assert.equal(payroll.paymentStatus, 'adjustment_required'); assert.equal(payroll.paymentDifference, 100);
  const next = new Date(`${month}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 7);
  const future = (await request('/api/employees/payroll?month=' + nextMonth)).data.find(e => e.userId === employeeId);
  assert.equal(future.baseSalary, 1100); assert.equal(future.deductionsTotal, 0); assert.equal(future.paymentStatus, 'unpaid');
  assert.equal((await request(paymentPath, { method: 'PUT', body: { month, status: 'unpaid' } })).status, 200);
});

test('bot check-in validates ownership, prevents duplicates, and approval preserves submission time', async () => {
  const otherShift = (await request(`/api/shifts?from=${today}&to=${today}`)).data.find(s => s.user_id === otherId);
  assert.equal((await request('/api/bot/requests', { bot: true, method: 'POST', body: { telegramId, type: 'shift_checkin', payload: { shiftId: otherShift.shift_id } } })).status, 400);
  const created = await request('/api/shifts', { method: 'POST', body: { userId: employeeId, date: today, startTime: '00:00', endTime: '23:59' } });
  assert.equal(created.status, 201);
  const checkinBody = { telegramId, type: 'shift_checkin', payload: { shiftId: created.data.shift_id, requestedAt: '2000-01-01T00:00:00Z', lateMinutes: 0 } };
  const submitted = await request('/api/bot/requests', { bot: true, method: 'POST', body: checkinBody });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.data));
  assert.equal((await request('/api/bot/requests', { bot: true, method: 'POST', body: checkinBody })).status, 409);
  // Simulate a manager reviewing later; the trusted persisted request time is the attendance time.
  await db.execute('UPDATE workflow_requests SET created_at = TIMESTAMP(?, ?) WHERE request_id = ?', [today, '00:15:00', submitted.data.requestId]);
  const approval = await request(`/api/management/requests/${submitted.data.requestId}`, { method: 'PATCH', body: { status: 'approved' } });
  assert.equal(approval.status, 200, JSON.stringify(approval.data));
  const [[record]] = await db.execute('SELECT checked_in_at FROM shift_checkins WHERE shift_id = ?', [created.data.shift_id]);
  assert.equal(record.checked_in_at, `${today} 00:15:00`);
  const payroll = (await request('/api/employees/payroll?month=' + month)).data.find(e => e.userId === employeeId);
  assert.equal(payroll.attendance[0].late_minutes, 15); assert.equal(payroll.lateCount, 1);
  assert.equal(payroll.deductionsTotal, 35.25); // Lateness never becomes a salary deduction.
  assert.equal((await request(`/api/shifts/${created.data.shift_id}`, { method: 'DELETE' })).status, 409);
});
