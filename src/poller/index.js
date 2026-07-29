// ポーラー。毎分実行。
// 4フィードの条件付きGET → 重複排除 → JSON生成

import { XMLParser } from 'fast-xml-parser';
import crypto from 'node:crypto';
import { fetchFeed } from '../lib/feed.js';
import { parseAtomFeed } from '../lib/atom.js';
import { buildFeedJSON, buildBatchJSON } from '../lib/json-builder.js';
import { MockFeedStateStore } from '../lib/store.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

const FEEDS = [
  { name: 'extra', url: 'https://www.data.jma.go.jp/developer/xml/feed/extra.xml' },
  { name: 'eqvol', url: 'https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml' },
  { name: 'other', url: 'https://www.data.jma.go.jp/developer/xml/feed/other.xml' },
  { name: 'regular', url: 'https://www.data.jma.go.jp/developer/xml/feed/regular.xml' },
];

export async function pollFeeds(store, userAgent) {
  const feedResults = [];

  for (const feed of FEEDS) {
    try {
      const result = await pollFeed(feed, store, userAgent);
      feedResults.push(result);
    } catch (err) {
      console.error(`Error polling ${feed.name}:`, err.message);
      feedResults.push({
        feed: feed.name,
        count: 0,
        entries: [],
        error: err.message,
      });
    }
  }

  return buildBatchJSON(feedResults);
}

async function pollFeed(feed, store, userAgent) {
  const state = await store.getFeedState(feed.name);

  // 条件付きGET
  const response = await fetchFeed(feed.url, {
    etag: state.etag,
    lastModified: state.lastModified,
    userAgent,
  });

  // 304 Not Modified
  if (response.status === 304) {
    return {
      feed: feed.name,
      count: 0,
      entries: [],
      cached: true,
    };
  }

  // パース
  const doc = parser.parse(response.body);
  const feedData = parseAtomFeed(doc);

  // 重複排除
  const newEntries = [];
  for (const entry of feedData.entries) {
    const hash = hashEntry(entry.id);
    const isProcessed = await store.isEntryProcessed(hash);
    if (!isProcessed) {
      newEntries.push(entry);
    }
  }

  // JSON生成
  const feedJSON = buildFeedJSON(feed.name, newEntries);

  // ETag保存（全処理後）
  if (response.etag || response.lastModified) {
    await store.saveFeedState(
      feed.name,
      response.etag,
      response.lastModified
    );
  }

  return feedJSON;
}

function hashEntry(entryId) {
  return crypto
    .createHash('sha1')
    .update(entryId)
    .digest('hex');
}
