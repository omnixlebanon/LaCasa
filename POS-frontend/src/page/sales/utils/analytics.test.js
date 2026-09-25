import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSales, filterTransactionsByTimeframe, generateLineChartData, getProductMetrics } from './analytics.js';
const summary = [{ product_id: 1, product_name: 'Coffee', product_price: 5, cost: 99 }];
const order = { order_id: 'one', order_date: '2026-09-25T12:00:00', details: { cost_snapshot_version: 1, discount: 2, items: [{ product_id: 1, qty: 2, price: 5, unit_cost: 1.5, total_cost: 3, cost_source: 'checkout_recipe' }] } };
test('historical cost uses checkout snapshot even after recipe change or deletion', () => {
  for (const products of [summary, []]) {
    const { transactions } = normalizeSales([order], products);
    assert.equal(transactions[0].totalCost, 3);
    assert.equal(transactions[0].totalRevenue, 8);
    assert.equal(transactions[0].totalProfit, 5);
  }
});
test('legacy orders never substitute current recipe costs or claim profit', () => {
  const legacy = { ...order, details: { items: [{ product_id: 1, qty: 2, price: 5 }] } };
  const data = normalizeSales([legacy], summary);
  assert.equal(data.transactions[0].totalCost, null);
  assert.equal(data.transactions[0].totalProfit, null);
  assert.equal(getProductMetrics(data.products, data.transactions)[0].missingCost, true);
  assert.equal(getProductMetrics(data.products, data.transactions)[0].isMostProfitable, false);
});
test('expense-only dates reduce business result, without increasing units sold', () => {
  const expense = { timestamp: '2026-09-24T00:00:00', totalRevenue: 0, totalCost: 20, totalProfit: -20, quantity: 0 };
  const sale = normalizeSales([order], summary).transactions[0];
  const selected = filterTransactionsByTimeframe([expense, sale], 'custom', new Date('2026-09-25T15:00:00'), '2026-09-24', '2026-09-25');
  const rows = generateLineChartData(selected, 'custom', [], new Date('2026-09-25'), '2026-09-24', '2026-09-25');
  assert.equal(rows.reduce((sum, row) => sum + row.cost, 0), 23);
  assert.equal(rows.reduce((sum, row) => sum + row.profit, 0), -15);
  assert.equal(rows.reduce((sum, row) => sum + row.units, 0), 2);
});
