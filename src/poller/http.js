// Cloud Functions gen2 HTTP トリガー用エントリポイント

import { Firestore } from '@google-cloud/firestore';
import { pollFeeds } from './index.js';
import { FeedStateStore } from '../lib/store.js';
import { buildApiJSON } from '../lib/api-builder.js';
import { pushToGitHub } from '../lib/github.js';
import { structuredLog } from '../lib/logging.js';

const db = new Firestore();
const store = new FeedStateStore(db);

export async function pollJmaFeed(req, res) {
  const startTime = Date.now();

  try {
    const userAgent = process.env.USER_AGENT || 'jma-alert-bot/1.0 (+https://example.com/contact)';

    // ステップ1: フィード取得 → JSON生成
    structuredLog('info', 'Starting feed poll', { timestamp: new Date().toISOString() });

    const batchJSON = await pollFeeds(store, userAgent);

    // ステップ2: 処理結果の統計
    const stats = {
      timestamp: new Date().toISOString(),
      feeds: batchJSON.summary.totalFeeds,
      newEntries: batchJSON.summary.totalNewEntries,
      duration_ms: Date.now() - startTime,
    };

    structuredLog('info', 'Feed poll completed', stats);

    // ステップ3: GitHub に push（オプション）
    if (process.env.PUSH_TO_GITHUB === 'true') {
      try {
        await pushToGitHub(batchJSON, {
          owner: process.env.GITHUB_OWNER,
          repo: process.env.GITHUB_REPO,
          token: process.env.GITHUB_TOKEN,
        });
        structuredLog('info', 'Pushed to GitHub', { entries: batchJSON.summary.totalNewEntries });
      } catch (err) {
        structuredLog('warn', 'GitHub push failed', { error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Feed poll completed',
      stats,
      feeds: batchJSON.feeds.slice(0, 2), // 最初の2フィードだけ返す
    });
  } catch (err) {
    structuredLog('error', 'Feed poll failed', {
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
