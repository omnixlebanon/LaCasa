import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationStation, preparationSnapshot, pendingPreparation } from './preparation.js';

test('routes drinks and desserts to the bar and food to the kitchen', () => {
    for (const category of ['Hot Drinks', 'Milkshakes', 'Iced Coffee', 'Desserts', 'Chia Pudding', 'Juices']) {
        assert.equal(preparationStation({ product_category: category }), 'Bar');
    }
    assert.equal(preparationStation({ product_category: 'Sandwiches' }), 'Kitchen');
});
test('prints only added quantities, keeping separate notes for the same product', () => {
    const items = [{ lineId: 'a', product_id: 1, qty: 2, note: 'No sugar' }];
    const printed = preparationSnapshot(items);
    assert.deepEqual(pendingPreparation(items, printed), []);
    const added = [...items.map(item => ({ ...item, qty: 3 })), { lineId: 'b', product_id: 1, qty: 1, note: 'Extra sugar' }];
    assert.deepEqual(pendingPreparation(added, printed).map(item => [item.qty, item.note]), [[1, 'No sugar'], [1, 'Extra sugar']]);
    assert.deepEqual(pendingPreparation([{ ...items[0], qty: 1 }], printed), []);
});
test('changed notes reprint the complete line with a replacement instruction', () => {
    const items = [{ lineId: 'a', qty: 2, note: 'No onions' }];
    const printed = preparationSnapshot(items);
    const pending = pendingPreparation([{ ...items[0], note: '' }], printed);
    assert.equal(pending[0].qty, 2);
    assert.equal(pending[0].noteChanged, true);
});
test('supports previously saved lines without line IDs', () => {
    const items = [{ product_id: 6, qty: 1 }, { product_id: 7, qty: 2 }];
    assert.deepEqual(pendingPreparation(items, preparationSnapshot(items)), []);
    assert.deepEqual(pendingPreparation(items.slice(1), preparationSnapshot(items)), []);
});
