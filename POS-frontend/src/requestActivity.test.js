import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginRequest, getPendingRequests, subscribeToRequests } from './requestActivity.js';

test('keeps loading until concurrent requests settle, and tolerates duplicate cleanup', () => {
  const counts = [];
  const unsubscribe = subscribeToRequests(() => counts.push(getPendingRequests()));
  const first = beginRequest();
  const second = beginRequest();
  second();
  assert.equal(getPendingRequests(), 1);
  second();
  assert.equal(getPendingRequests(), 1);
  first();
  assert.equal(getPendingRequests(), 0);
  assert.deepEqual(counts, [1, 2, 1, 0]);
  unsubscribe();
  beginRequest()();
  assert.deepEqual(counts, [1, 2, 1, 0]);
});
