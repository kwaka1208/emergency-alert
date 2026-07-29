// GitHub Actions から実行: JMA フィードをポーリングし、jma-alert-api へ push

import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { fetchFeed } from '../src/lib/feed.js';
import { parseAtomFeed } from '../src/lib/atom.js';
import { buildFeedJSON } from '../src/lib/json-builder.js';
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
    console.log('🚀 Starting JMA feed poll from GitHub Actions...');

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

    // 集計JSON を生成
    const batchJSON = {
      timestamp: new Date().toISOString(),
      feeds: feedResults,
      summary: {
        totalFeeds: FEEDS.length,
        totalNewEntries: feedResults.reduce((sum, f) => sum + f.count, 0),
      },
    };

    // ローカルに保存
    await fs.mkdir('data/latest', { recursive: true });
    const jsonStr = JSON.stringify(batchJSON, null, 2);
    await fs.writeFile('data/latest/data.json', jsonStr);
    console.log('✅ Saved to data/latest/data.json');

    // jma-alert-api へ push
    if (process.env.JMA_ALERT_API_TOKEN) {
      console.log('📤 Pushing to jma-alert-api repository...');
      await pushToGitHub(batchJSON);
      console.log('✅ Pushed to jma-alert-api');
    } else {
      console.log('⚠️  JMA_ALERT_API_TOKEN not set, skipping push');
    }

    console.log('✅ Poll completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
}

async function pollFeed(feed) {
  const userAgent = 'jma-alert-bot/1.0 (+https://example.com/contact)';

  // フィード取得
  const response = await fetchFeed(feed.url, { userAgent });

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
    const hash = crypto.createHash('sha1').update(entry.id).digest('hex');
    if (!seenEntries.has(hash)) {
      seenEntries.add(hash);
      newEntries.push(entry);
    }
  }

  // JSON生成
  const feedJSON = buildFeedJSON(feed.name, newEntries);

  return feedJSON;
}

async function pushToGitHub(jsonData) {
  const token = process.env.JMA_ALERT_API_TOKEN;
  const owner = process.env.JMA_ALERT_API_OWNER;
  const repo = process.env.JMA_ALERT_API_REPO;

  if (!token || !owner || !repo) {
    throw new Error('Missing GitHub credentials');
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const yearMonth = now.toISOString().slice(0, 7);

  // latest.json を更新
  await pushFile(
    token,
    owner,
    repo,
    'latest.json',
    jsonData
  );

  // アーカイブに保存
  await pushFile(
    token,
    owner,
    repo,
    `archive/${yearMonth}/${timestamp}.json`,
    jsonData
  );
}

async function pushFile(token, owner, repo, filePath, content) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  // 既存ファイルの SHA を取得
  let sha = null;
  try {
    const getResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (getResponse.ok) {
      const existing = await getResponse.json();
      sha = existing.sha;
    }
  } catch (err) {
    // ファイルが存在しない場合はスキップ
  }

  // ファイルをコミット
  const body = {
    message: `Update ${filePath} - ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    branch: 'main',
  };

  if (sha) {
    body.sha = sha;
  }

  const pushResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!pushResponse.ok) {
    const error = await pushResponse.json();
    throw new Error(`GitHub API error: ${error.message}`);
  }

  console.log(`   ✅ Pushed ${filePath}`);
}

main();
