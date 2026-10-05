import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderVisible } from './reorder.js';
test('dragging inserts rows into the selected position without moving other categories',()=>{
 const all=[{id:1},{id:9},{id:2},{id:3},{id:8},{id:4}];
 const visible=all.filter(row=>row.id<8);
 assert.deepEqual(reorderVisible(all,visible,'id',1,3).map(row=>row.id),[2,9,3,1,8,4]);
 assert.deepEqual(reorderVisible(all,visible,'id',4,1).map(row=>row.id),[4,9,1,2,8,3]);
 assert.equal(reorderVisible(all,visible,'id',1,1),all);
 assert.equal(reorderVisible(all,visible,'id',1,9),all);
 assert.deepEqual(all.map(row=>row.id),[1,9,2,3,8,4]);
});
