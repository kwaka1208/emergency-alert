// GitHub Actions から実行: JMA フィードをポーリング
// JSONを api/ フォルダに保存

import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { fetchFeed } from '../src/lib/feed.js';
import { parseAtomFeed } from '../src/lib/atom.js';
import { buildFeedJSON } from '../src/lib/json-builder.js';
import { classifyBySeverity } from '../src/lib/severity-filter.js';
import severityConfig from '../src/config/severity.json' with { type: 'json' };
import crypto from 'node:crypto';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

const FEEDS = [
  { name: 'extra', url: 'https://www.data.jma.go.jp/developer/xml/feed/extra.xml' },
  { name: 'eqvol', url: 'https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml' },
  { name: 'other', url: 'https://www.data.jma.go.jp/developer/xml/feed/other.xml' },
  { name: 'regular', url: 'https://www.data.jma.go.jp/developer/xml/feed/regular.xml' },
];

const seenEntries = new Set();

async function main() {
  try {
    console.log('🚀 Starting JMA feed poll...');

    // フィードをポーリング
    const feedResults = [];
    for (const feed of FEEDS) {
      try {
        console.log(`📡 Polling ${feed.name}...`);
        const result = await pollFeed(feed);
        feedResults.push(result);
        console.log(`   ✅ ${result.count} new entries`);
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
        feedResults.push({
          feed: feed.name,
          count: 0,
          entries: [],
          error: err.message,
        });
      }
    }

    // 全エントリを集約して分類
    const allEntries = [];
    for (const result of feedResults) {
      if (result.entries) {
        allEntries.push(...result.entries);
      }
    }
    const classified = classifyBySeverity(allEntries);

    // 集計JSON を生成
    const batchJSON = {
      timestamp: new Date().toISOString(),
      feeds: feedResults,
      summary: {
        totalFeeds: FEEDS.length,
        totalNewEntries: feedResults.reduce((sum, f) => sum + f.count, 0),
      },
      immediate: classified.immediate,
      digest: classified.digest,
      record: classified.record,
    };

    // api/ フォルダに保存
    await fs.mkdir('api', { recursive: true });
    const jsonStr = JSON.stringify(batchJSON, null, 2);
    await fs.writeFile('api/latest.json', jsonStr);
    console.log('✅ Saved to api/latest.json');

    // アーカイブにも保存
    const timestamp = new Date().toISOString();
    const year = timestamp.slice(0, 7);
    await fs.mkdir(`api/archive/${year}`, { recursive: true });
    await fs.writeFile(`api/archive/${year}/${timestamp.replace(/[:.]/g, '-')}.json`, jsonStr);
    console.log(`✅ Saved to api/archive/${year}/`);

    console.log('✅ Poll completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
}

async function pollFeed(feed) {
  const userAgent = 'jma-alert-bot/1.0 (+https://example.com/contact)';

  const response = await fetchFeed(feed.url, { userAgent });

  if (response.status === 304) {
    return {
      feed: feed.name,
      count: 0,
      entries: [],
      cached: true,
    };
  }

  const doc = parser.parse(response.body);
  const feedData = parseAtomFeed(doc);

  // 旧体系などを除外してフィルタリング
  const filteredEntries = filterNewFormatOnly(feedData.entries);

  const newEntries = [];
  for (const entry of filteredEntries) {
    const hash = crypto.createHash('sha1').update(entry.id).digest('hex');
    if (!seenEntries.has(hash)) {
      seenEntries.add(hash);
      newEntries.push(entry);
    }
  }

  const feedJSON = buildFeedJSON(feed.name, newEntries);
  return feedJSON;
}

function filterNewFormatOnly(entries) {
  const allTitles = new Set([
    ...severityConfig.immediate.titles,
    ...severityConfig.digest.titles,
    ...severityConfig.record.titles,
  ]);

  return entries.filter(entry => allTitles.has(entry.title));
}

main();
