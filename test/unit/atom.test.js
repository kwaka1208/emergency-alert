import test from 'node:test';
import assert from 'node:assert';
import { normalizeEntries, sortEntriesByTime, parseAtomFeed } from '../../src/lib/atom.js';

test('normalizeEntries - converts single entry to array', () => {
  const single = { id: '1', title: 'test' };
  const result = normalizeEntries(single);
  assert.strictEqual(Array.isArray(result), true);
  assert.strictEqual(result.length, 1);
  assert.deepStrictEqual(result[0], single);
});

test('normalizeEntries - returns array as-is', () => {
  const entries = [
    { id: '1', title: 'test1' },
    { id: '2', title: 'test2' },
  ];
  const result = normalizeEntries(entries);
  assert.strictEqual(Array.isArray(result), true);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result, entries);
});

test('normalizeEntries - handles null/undefined', () => {
  assert.deepStrictEqual(normalizeEntries(null), []);
  assert.deepStrictEqual(normalizeEntries(undefined), []);
});

test('sortEntriesByTime - sorts by updated timestamp', () => {
  const entries = [
    { id: '1', updated: '2026-07-29T10:00:00Z' },
    { id: '2', updated: '2026-07-29T08:00:00Z' },
    { id: '3', updated: '2026-07-29T09:00:00Z' },
  ];
  const result = sortEntriesByTime(entries);
  assert.strictEqual(result[0].id, '2');
  assert.strictEqual(result[1].id, '3');
  assert.strictEqual(result[2].id, '1');
});

test('parseAtomFeed - parses valid feed', () => {
  const doc = {
    feed: {
      id: 'test-feed',
      title: 'Test Feed',
      updated: '2026-07-29T10:00:00Z',
      entry: [
        { id: '1', updated: '2026-07-29T10:00:00Z' },
        { id: '2', updated: '2026-07-29T09:00:00Z' },
      ],
    },
  };
  const result = parseAtomFeed(doc);
  assert.strictEqual(result.id, 'test-feed');
  assert.strictEqual(result.title, 'Test Feed');
  assert.strictEqual(result.entries.length, 2);
  assert.strictEqual(result.entries[0].id, '2'); // sorted
});
