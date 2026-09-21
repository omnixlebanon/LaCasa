const test = require('node:test');
const assert = require('node:assert/strict');
const { monthlyOccurrences, monthDays, shiftInput, dateRange, weekdays, weeklyOccurrences, recurringOccurrences } = require('../services/schedulingRules');
const { salaryMonth, salaryAmount, payrollTotals } = require('../services/payrollRules');

test('weekly schedules select Monday, Wednesday, and Sunday across a month boundary', () => {
  const series = { starts_on: '2026-01-01', weekdays: [1, 3, 7] };
  assert.deepEqual(weeklyOccurrences(series, '2026-08-30', '2026-09-09'), ['2026-08-30', '2026-08-31', '2026-09-02', '2026-09-06', '2026-09-07', '2026-09-09']);
  assert.deepEqual(weeklyOccurrences({ ...series, starts_on: '2026-09-02', stopped_from: '2026-09-07' }, '2026-08-30', '2026-09-09'), ['2026-09-02', '2026-09-06']);
});

test('all weekdays repeat indefinitely and weekday input is validated', () => {
  assert.deepEqual(weekdays([7, 1, 7]), [1, 7]);
  for (const input of [[], [0], [8], [1.5], ['1'], undefined]) assert.throws(() => weekdays(input), { status: 400 });
  assert.equal(weeklyOccurrences({ starts_on: '2026-01-01', weekdays: '[1,2,3,4,5,6,7]' }, '2046-01-01', '2046-01-31').length, 31);
});

test('existing monthly rules retain their meaning while new rules use weekdays', () => {
  assert.deepEqual(recurringOccurrences({ starts_on: '2026-01-01', month_days: [1], weekdays: null }, '2026-09-01', '2026-09-14'), ['2026-09-01']);
  assert.deepEqual(recurringOccurrences({ starts_on: '2026-01-01', month_days: null, weekdays: [1] }, '2026-09-01', '2026-09-14'), ['2026-09-07', '2026-09-14']);
});

test('monthly schedules skip nonexistent dates without rolling into another month', () => {
  const series = { starts_on: '2026-01-01', month_days: [1, 29, 30, 31] };
  assert.deepEqual(monthlyOccurrences(series, '2026-02-01', '2026-03-31'), ['2026-02-01', '2026-03-01', '2026-03-29', '2026-03-30', '2026-03-31']);
  assert.deepEqual(monthlyOccurrences(series, '2028-02-01', '2028-02-29'), ['2028-02-01', '2028-02-29']);
});

test('monthly schedules have no finite generation horizon and respect start and stop boundaries', () => {
  const series = { starts_on: '2026-09-15', month_days: '[1,15,31]' };
  assert.deepEqual(monthlyOccurrences(series, '2046-01-01', '2046-01-31'), ['2046-01-01', '2046-01-15', '2046-01-31']);
  assert.deepEqual(monthlyOccurrences({ ...series, stopped_from: '2026-10-15' }, '2026-09-01', '2026-10-31'), ['2026-09-15', '2026-10-01']);
});

test('invalid days, dates, range sizes, and shift times are rejected', () => {
  assert.deepEqual(monthDays([31, 1, 31]), [1, 31]);
  for (const days of [[], [0], [32], [1.5], ['1']]) assert.throws(() => monthDays(days), { status: 400 });
  assert.throws(() => dateRange('2026-02-30', '2026-03-01'), { status: 400 });
  assert.throws(() => dateRange('2026-01-01', '2027-01-01'), { status: 400 });
  assert.throws(() => shiftInput({ userId: 1, date: '2026-09-01', startTime: '25:00', endTime: '26:00' }), { status: 400 });
  assert.throws(() => shiftInput({ userId: 1, date: '2026-09-01', startTime: '09:00', endTime: '09:00' }), { status: 400 });
});

test('salary month and currency validation handle year boundaries and reject malformed amounts', () => {
  assert.deepEqual(salaryMonth('2026-12'), { start: '2026-12-01', end: '2027-01-01' });
  assert.equal(salaryAmount('1200.50'), '1200.50');
  for (const amount of [-1, '1.001', '', null, 'Infinity', '10000000000']) assert.throws(() => salaryAmount(amount), { status: 400 });
  assert.throws(() => salaryMonth('2026-13'), { status: 400 });
});

test('payroll sums decimal deductions in cents and separates unset salary from zero salary', () => {
  const totals = payrollTotals('1000.30', [{ amount: '0.10' }, { amount: '0.20' }]);
  assert.equal(totals.netSalary, 1000);
  assert.equal(totals.deductionsTotal, 0.3);
  assert.equal(payrollTotals(null, []).baseSalary, null);
  assert.equal(payrollTotals('0.00', []).payableAmount, 0);
});

test('late deductions after payment require adjustment instead of silently staying paid', () => {
  const payment = { status: 'paid', amount_paid: '1000.00', paid_at: '2026-09-01 10:00:00' };
  assert.equal(payrollTotals('1000', [], payment).paymentStatus, 'paid');
  const changed = payrollTotals('1000', [{ amount: '75.25' }], payment);
  assert.equal(changed.paymentStatus, 'adjustment_required');
  assert.equal(changed.amountPaid, 1000);
  assert.equal(changed.paymentDifference, -75.25);
  const excess = payrollTotals('10', [{ amount: '25' }]);
  assert.equal(excess.netSalary, -15);
  assert.equal(excess.payableAmount, 0);
});
