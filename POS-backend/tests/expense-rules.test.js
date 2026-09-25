const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expenseInput, expenseMonth, expenseId } = require('../services/expenseRules');
const valid = { category: 'water', date: '2026-09-25', description: 'Water bill', amount: '45.50' };
test('validates and normalizes expense records', () => {
  assert.throws(() => expenseInput(null), error => error.status === 400);
  assert.deepEqual(expenseInput({ ...valid, description: ' Water bill ' }), valid);
  assert.equal(expenseInput({ ...valid, category: 'furniture', amount: 600 }).amount, '600.00');
  for (const patch of [{ amount: -2 }, { amount: 0 }, { amount: 'NaN' }, { amount: '1.234' }, { amount: true }, { date: '2026-02-30' }, { category: 'unknown' }, { description: ' ' }]) assert.throws(() => expenseInput({ ...valid, ...patch }), error => error.status === 400);
});
test('uses exclusive month boundaries and validates IDs', () => {
  assert.deepEqual(expenseMonth('2026-12'), { start: '2026-12-01', end: '2027-01-01' });
  assert.throws(() => expenseMonth('2026-13'));
  assert.equal(expenseId('12'), 12);
  for (const id of ['0', '-1', '1 OR 1=1', '2.3']) assert.throws(() => expenseId(id));
});
