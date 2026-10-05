import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSmallSlices } from './pie.js';
test('groups slices strictly below 2.5 percent and preserves totals', () => {
    const rows = [{ name: 'Main', value: 94.5 }, { name: 'Boundary', value: 2.5 }, { name: 'Small', value: 2 }, { name: 'Tiny', value: 1 }];
    assert.deepEqual(groupSmallSlices(rows, 2.5).map(row => [row.name, row.value]), [['Main', 94.5], ['Boundary', 2.5], ['Others', 3]]);
    assert.deepEqual(groupSmallSlices(rows).map(row => [row.name, row.value]), rows.map(row => [row.name, row.value]));
    assert.deepEqual(groupSmallSlices([]), []);
});
