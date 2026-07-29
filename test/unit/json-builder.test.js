import test from 'node:test';
import assert from 'node:assert';
import { buildFeedJSON, buildBatchJSON } from '../../src/lib/json-builder.js';

test('buildFeedJSON - formats feed entries', () => {
  const entries = [
    { id: '1', title: 'Alert 1', updated: '2026-07-29T10:00:00Z', link: 'http://...' },
    { id: '2', title: 'Alert 2', updated: '2026-07-29T11:00:00Z', link: 'http://...' },
  ];

  const result = buildFeedJSON('extra', entries);

  assert.strictEqual(result.feed, 'extra');
  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.entries.length, 2);
  assert.strictEqual(result.entries[0].title, 'Alert 1');
});

test('buildFeedJSON - handles empty entries', () => {
  const result = buildFeedJSON('extra', []);
  assert.strictEqual(result.count, 0);
  assert.deepStrictEqual(result.entries, []);
});

test('buildFeedJSON - includes timestamp', () => {
  const result = buildFeedJSON('extra', []);
  assert(result.timestamp);
  assert(new Date(result.timestamp)); // valid ISO string
});

test('buildBatchJSON - aggregates multiple feeds', () => {
  const feedResults = [
    { feed: 'extra', count: 5, entries: [] },
    { feed: 'eqvol', count: 2, entries: [] },
    { feed: 'other', count: 0, entries: [] },
  ];

  const result = buildBatchJSON(feedResults);

  assert.strictEqual(result.summary.totalFeeds, 3);
  assert.strictEqual(result.summary.totalNewEntries, 7);
  assert.strictEqual(result.feeds.length, 3);
});
