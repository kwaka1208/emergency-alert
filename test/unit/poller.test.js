import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { parseAtomFeed } from '../../src/lib/atom.js';
import { buildFeedJSON } from '../../src/lib/json-builder.js';
import { MockFeedStateStore } from '../../src/lib/store.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

test('poller - parses extra feed from fixture', async () => {
  const xml = await fs.readFile('test/fixtures/extra_l.xml', 'utf-8');
  const doc = parser.parse(xml);
  const feedData = parseAtomFeed(doc);

  assert(feedData.entries.length > 0);
  assert(feedData.entries[0].id);
  assert(feedData.entries[0].title);
});

test('poller - detects 304 not modified', async () => {
  const store = new MockFeedStateStore();
  await store.saveFeedState('test', 'etag-old', 'last-mod-old');

  const state = await store.getFeedState('test');
  assert.strictEqual(state.etag, 'etag-old');
  assert.strictEqual(state.lastModified, 'last-mod-old');
});

test('poller - generates JSON for new entries', () => {
  const entries = [
    { id: '1', title: 'New Alert', updated: '2026-07-29T10:00:00Z' },
  ];

  const result = buildFeedJSON('extra', entries);

  assert.strictEqual(result.feed, 'extra');
  assert.strictEqual(result.count, 1);
  assert.strictEqual(result.entries[0].title, 'New Alert');
});

test('poller - duplicate detection with mock store', async () => {
  const store = new MockFeedStateStore();

  // First time: entry is new
  const isProcessed1 = await store.isEntryProcessed('entry-id-hash');
  assert.strictEqual(isProcessed1, false);

  // Second time: entry is already seen
  const isProcessed2 = await store.isEntryProcessed('entry-id-hash');
  assert.strictEqual(isProcessed2, true);
});

test('poller - handles multiple feeds independently', async () => {
  const store = new MockFeedStateStore();

  await store.saveFeedState('extra', 'etag-extra', null);
  await store.saveFeedState('eqvol', 'etag-eqvol', null);

  const stateExtra = await store.getFeedState('extra');
  const stateEqvol = await store.getFeedState('eqvol');

  assert.strictEqual(stateExtra.etag, 'etag-extra');
  assert.strictEqual(stateEqvol.etag, 'etag-eqvol');
});
