import test from 'node:test';
import assert from 'node:assert';
import { MockFeedStateStore } from '../../src/lib/store.js';

test('MockFeedStateStore - saves and retrieves state', async (t) => {
  const store = new MockFeedStateStore();
  await store.saveFeedState('extra', 'etag-123', 'last-mod');

  const state = await store.getFeedState('extra');
  assert.strictEqual(state.etag, 'etag-123');
  assert.strictEqual(state.lastModified, 'last-mod');
});

test('MockFeedStateStore - tracks seen entries', async (t) => {
  const store = new MockFeedStateStore();

  const isProcessed1 = await store.isEntryProcessed('entry-hash-1');
  assert.strictEqual(isProcessed1, false); // 新規

  const isProcessed2 = await store.isEntryProcessed('entry-hash-1');
  assert.strictEqual(isProcessed2, true); // 既に処理済み
});

test('MockFeedStateStore - different entries are tracked separately', async (t) => {
  const store = new MockFeedStateStore();

  await store.isEntryProcessed('entry-1');
  await store.isEntryProcessed('entry-2');

  const isProcessed1 = await store.isEntryProcessed('entry-1');
  const isProcessed2 = await store.isEntryProcessed('entry-2');

  assert.strictEqual(isProcessed1, true);
  assert.strictEqual(isProcessed2, true);
});
