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

const { recurrenceInput, expandExpenses } = require('../services/expenseRecurrence');
test('recurring bills clamp short months without drifting or double counting', () => {
  const bill = { expense_id: 1, expense_date: '2024-01-31', amount: '50', frequency: 'monthly' };
  assert.deepEqual(expandExpenses([bill], '2024-01-01', '2024-03-31').map(row => row.expense_date), ['2024-03-31', '2024-02-29', '2024-01-31']);
  assert.deepEqual(expandExpenses([{ ...bill, stopped_before: '2024-03-01' }], '2024-01-01', '2024-12-31').map(row => row.expense_date), ['2024-02-29', '2024-01-31']);
  assert.equal(expandExpenses([{ ...bill, repeat_until: '2024-02-29' }], '2024-01-01', '2025-01-01').length, 2);
  assert.equal(expandExpenses([bill], '2024-03-01', '2024-03-31')[0].expense_date, '2024-03-31');
});
test('weekly/yearly repetition and inclusive end dates', () => {
  const bill = { expense_id: 2, expense_date: '2024-02-29', amount: '5', frequency: 'yearly' };
  assert.deepEqual(expandExpenses([bill], '2025-01-01', '2028-12-31').map(row => row.expense_date), ['2028-02-29', '2027-02-28', '2026-02-28', '2025-02-28']);
  assert.equal(expandExpenses([{ ...bill, frequency: 'weekly', repeat_until: '2024-03-07' }], '2024-02-01', '2024-04-01').length, 2);
  assert.throws(() => recurrenceInput({ frequency: 'daily' }));
  assert.throws(() => recurrenceInput({ frequency: 'monthly', date: '2026-09-25', repeat_until: '2026-01-01' }));
});
