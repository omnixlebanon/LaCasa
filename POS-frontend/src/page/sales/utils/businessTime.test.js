import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessDate, businessTimestamp } from './businessTime.js';
import { filterTransactionsByTimeframe, generateLineChartData } from './analytics.js';

test('sales filters and charts follow Beirut across device timezones', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['Africa/Accra', 'Africa/Johannesburg', 'America/Los_Angeles', 'Asia/Beirut']) {
      process.env.TZ = zone;
      const now = new Date('2026-09-30T21:30:00Z'); // October 1, 00:30 in Beirut.
      const rows = [
        { timestamp: '2026-09-30 23:59:00', totalRevenue: 1 },
        { timestamp: '2026-10-01 00:15:00', totalRevenue: 2 },
        { timestamp: '2026-09-30T21:20:00Z', totalRevenue: 3 },
        { timestamp: '2026-10-01 00:31:00', totalRevenue: 4 },
      ].map(row => ({ totalCost: 0, totalProfit: 0, quantity: 1, ...row }));
      assert.equal(businessDate(now), '2026-10-01');
      for (const period of ['daily', 'monthly']) {
        assert.deepEqual(filterTransactionsByTimeframe(rows, period, now).map(row => row.totalRevenue), [2, 3]);
      }
      const selected = filterTransactionsByTimeframe(rows, 'daily', now);
      const chart = generateLineChartData(selected, 'daily', [], now);
      assert.equal(chart.length, 24);
      assert.equal(chart[0].revenue, 5);
      assert.equal(filterTransactionsByTimeframe(rows, 'custom', now, '2026-10-01', '2026-10-01').length, 3);
      assert.equal(generateLineChartData([], 'monthly', [], now).length, 31);
      assert.equal(businessTimestamp(rows[1].timestamp), '2026-10-01 00:15:00 (Asia/Beirut)');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('Beirut calendar handles winter offset and year boundaries', () => {
  assert.equal(businessDate(new Date('2026-12-31T22:30:00Z')), '2027-01-01');
  assert.equal(businessTimestamp('2026-01-01T10:00:00Z'), '2026-01-01 12:00:00 (Asia/Beirut)');
  assert.equal(businessTimestamp('2026-07-01T10:00:00Z'), '2026-07-01 13:00:00 (Asia/Beirut)');
  const rows = [{ timestamp: '2027-01-01 00:15:00' }, { timestamp: '2026-12-31 23:59:00' }];
  assert.equal(filterTransactionsByTimeframe(rows, 'yearly', new Date('2026-12-31T22:30:00Z')).length, 1);
  assert.equal(businessTimestamp('invalid'), '');
});
