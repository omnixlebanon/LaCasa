import test from 'node:test';
import assert from 'node:assert/strict';
import { splitOrder } from './splitOrder.js';
import { pendingPreparation } from './preparation.js';

const order = { id: 'source', checkoutOperationId: 'source', label: 'T1', tableId: 1, tableName: 'T1', orderType: 'dine-in',
    items: [{ lineId: 'a', product_id: 1, product_price: 10, qty: 3, note: 'No onions' }, { lineId: 'b', product_id: 1, product_price: 10, qty: 1, note: 'Extra onions' }],
    discount: { type: 'usd', value: 5 }, preparationPrinted: true, printedPreparation: { a: { qty: 2, note: 'No onions' }, b: { qty: 1, note: 'Extra onions' } } };

test('splits quantities and fixed discount while preserving identity, notes and table ownership', () => {
    const before = structuredClone(order);
    const { original, split } = splitOrder(order, [1, 1], 'new', 'Second bill');
    assert.deepEqual(order, before);
    assert.equal(original.tableId, 1);
    assert.equal(split.tableId, undefined);
    assert.equal(split.checkoutOperationId, 'new');
    assert.deepEqual(split.items.map(item => item.note), ['No onions', 'Extra onions']);
    assert.equal(original.items[0].qty, 2);
    assert.equal(original.discount.value + split.discount.value, 5);
    assert.equal(split.discount.value, 2.5);
    assert.deepEqual(pendingPreparation(split.items, split.printedPreparation), []);
    assert.equal(pendingPreparation(original.items, original.printedPreparation)[0].qty, 1);
});

test('keeps percent discounts and supports legacy line identities', () => {
    const source = { ...order, discount: { type: 'percent', value: 10 }, items: [{ product_id: 1, qty: 2, product_price: 5 }], printedPreparation: { 'legacy-1': { qty: 2, note: '' } } };
    const { original, split } = splitOrder(source, [1], 'new', 'Second bill');
    assert.deepEqual(original.discount, source.discount);
    assert.deepEqual(split.discount, source.discount);
    assert.deepEqual(pendingPreparation(split.items, split.printedPreparation), []);
});

test('rejects empty, complete, fractional, stale and excessive selections', () => {
    for (const quantities of [[0, 0], [3, 1], [0.5, 0], [4, 0], [1], [-1, 1]]) {
        assert.throws(() => splitOrder(order, quantities, 'new', 'Second bill'));
    }
});
