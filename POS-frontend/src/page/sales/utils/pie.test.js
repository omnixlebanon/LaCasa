import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSmallSlices } from './pie.js';
test('groups slices strictly below five percent and preserves totals', () => {
    const rows = [{ name: 'Main', value: 90 }, { name: 'Boundary', value: 5 }, { name: 'Small', value: 4 }, { name: 'Tiny', value: 1 }];
    assert.deepEqual(groupSmallSlices(rows, 5).map(row => [row.name, row.value]), [['Main', 90], ['Boundary', 5], ['Others', 5]]);
    assert.deepEqual(groupSmallSlices(rows).map(row => [row.name, row.value]), rows.map(row => [row.name, row.value]));
    assert.deepEqual(groupSmallSlices([]), []);
});
