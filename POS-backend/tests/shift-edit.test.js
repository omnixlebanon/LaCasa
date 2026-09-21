const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const dbPath = require.resolve('../config/database');
const servicePath = require.resolve('../services/schedulingService');
let queries = [], existing = { shift_id: 12, shift_date: '2026-09-09', recurrence_id: null }, checkin = null;
const connection = {
  beginTransaction: async () => {}, commit: async () => queries.push(['COMMIT']),
  rollback: async () => queries.push(['ROLLBACK']), release: () => {},
  execute: async (sql, values) => {
    queries.push([sql, values]);
    if (sql.startsWith('SELECT shift_id')) return [[existing].filter(Boolean)];
    if (sql.startsWith('SELECT request_id')) return [[checkin].filter(Boolean)];
    return [{ insertId: 99, affectedRows: 1 }];
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getConnection: async () => connection,
  execute: async (sql, params) => { queries.push([sql, params]); return [[]]; } } };
require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
  databaseToday: async () => '2026-09-09', listShifts: async (from, to, userId) => { queries.push(['listShifts', userId]); return []; },
} };
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { user_id: 7, access_level: req.headers['x-role'] || 'employee' }; next(); });
app.use('/api', require('../routes/employeeRout'));
const payload = { userId: 7, date: '2026-09-09', startTime: '10:00', endTime: '17:00', notes: 'Updated' };
test('shift editing and employee visibility', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (path, method = 'GET', body, role = 'admin') => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-role': role }, body: body && JSON.stringify(body),
  });
  await t.test('employees cannot edit shifts, even their own', async () => {
    queries = []; assert.equal((await request('/shifts/12', 'PATCH', payload, 'employee')).status, 403); assert.equal(queries.length, 0);
  });
  await t.test('employees cannot request another employees shifts or repeating schedules', async () => {
    queries = []; await request('/shifts?userId=999', 'GET', undefined, 'employee');
    assert.deepEqual(queries, [['listShifts', 7]]);
    queries = []; await request('/recurring-shifts?userId=999', 'GET', undefined, 'employee');
    assert.match(queries[0][0], /AND r.user_id = \?/); assert.deepEqual(queries[0][1], [7]);
  });
  await t.test('admin can update a shift', async () => {
    queries = []; assert.equal((await request('/shifts/12', 'PATCH', payload)).status, 200);
    assert.deepEqual(queries.find(q => q[0].startsWith('UPDATE shifts SET user_id'))[1], [7, '2026-09-09', '10:00', '17:00', 'Updated', 12]);
    assert.equal(queries.at(-1)[0], 'COMMIT');
  });
  await t.test('invalid hours and shifts with check-ins cannot be edited', async () => {
    assert.equal((await request('/shifts/12', 'PATCH', { ...payload, endTime: '09:00' })).status, 400);
    checkin = { request_id: 4 }; queries = [];
    assert.equal((await request('/shifts/12', 'PATCH', payload)).status, 409);
    assert.equal(queries.some(q => q[0].startsWith('UPDATE')), false); assert.equal(queries.at(-1)[0], 'ROLLBACK'); checkin = null;
  });
  await t.test('recurring occurrence edits stay on the same record; moving one preserves cancellation', async () => {
    existing.recurrence_id = 3; queries = [];
    assert.equal((await request('/shifts/12', 'PATCH', payload)).status, 200);
    assert.equal(queries.some(q => q[0].startsWith('INSERT')), false);
    queries = []; const response = await request('/shifts/12', 'PATCH', { ...payload, date: '2026-09-10' });
    assert.equal(response.status, 200); assert.equal((await response.json()).shift_id, 99);
    assert.ok(queries.some(q => q[0].startsWith('UPDATE shifts SET cancelled_at')));
    assert.ok(queries.some(q => q[0].startsWith('INSERT INTO shifts')));
  });
  await t.test('missing shifts return 404', async () => {
    existing = null; assert.equal((await request('/shifts/12', 'PATCH', payload)).status, 404);
  });
});
