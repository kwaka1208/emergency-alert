// Slack 通知メイン
// GitHub Actions から実行: API JSON を取得して Slack に通知

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildSlackMessage } from './messages.js';

// Dedup logic — pure functions to track sent notifications locally
function buildSentIdSet(sentRecords) {
  return new Set(sentRecords.map(r => r.reportId));
}

function filterUnsent(entries, sentIds) {
  return entries.filter(entry => !sentIds.has(entry.reportId));
}

function addSentRecord(entry) {
  return {
    reportId: entry.reportId,
    reportTitle: entry.reportTitle,
    eventID: entry.eventID,
    sentAt: new Date().toISOString(),
  };
}

async function main() {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      console.log('⚠️  SLACK_WEBHOOK_URL not set, skipping Slack notification');
      process.exit(0);
    }

    console.log('🚀 Fetching JMA alert data...');

    // ローカルまたはリモートから API データを取得
    const apiData = await loadApiData();
    console.log(`✅ Fetched data with ${apiData.summary.totalNewEntries} new entries`);

    const isTestMode = process.env.SLACK_NOTIFY_TEST === 'true';
    if (isTestMode) {
      console.log('🧪 Test mode enabled');
    }

    // 送信済みリストを読み込み
    const sentRecords = await loadSentRecords();
    const sentIds = buildSentIdSet(sentRecords);

    // 即時通知から未送信のものだけをフィルタリング
    const immediate = apiData.immediate || [];
    const unsentImmediate = filterUnsent(immediate, sentIds);

    console.log(`📋 Immediate alerts: ${immediate.length} total, ${unsentImmediate.length} unsent`);

    // テストモードでなく、即時通知がなければスキップ
    if (!isTestMode && unsentImmediate.length === 0) {
      console.log('✅ No new immediate alerts to send');
      process.exit(0);
    }

    // メッセージを構築（未送信の即時通知と全ての集約通知）
    const digest = apiData.digest || [];
    const messageData = {
      ...apiData,
      immediate: unsentImmediate,
      digest: digest,
    };
    const message = buildSlackMessage(messageData);

    // テストモード時は通知内容を確認してから送信
    if (isTestMode) {
      console.log('📋 Test message preview:');
      console.log(JSON.stringify(message, null, 2).slice(0, 500) + '...');
    }

    // Slack に送信
    console.log('📤 Sending to Slack...');
    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!slackResponse.ok) {
      throw new Error(`Slack API error: ${slackResponse.status}`);
    }

    // 本番モード時のみ送信済みリストを更新（テストデータを混ぜない）
    if (!isTestMode) {
      const newRecords = unsentImmediate.map(entry => addSentRecord(entry));
      await saveSentRecords([...sentRecords, ...newRecords]);
    }

    const modeLabel = isTestMode ? ' (テストモード)' : '';
    console.log(`✅ Slack notification sent successfully (${unsentImmediate.length} immediate)${modeLabel}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

async function loadApiData() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const localPath = path.join(currentDir, '../../api/latest.json');

  // ローカルファイルを優先的に試す
  try {
    const content = await fs.readFile(localPath, 'utf-8');
    console.log('📂 Loaded from local api/latest.json');
    return JSON.parse(content);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  // ローカルがない場合、リモートから取得
  const apiUrl = process.env.API_URL ||
    'https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json';

  console.log(`📡 Fetching from remote: ${apiUrl}`);
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch API: ${response.status}`);
  }

  return response.json();
}

async function loadSentRecords() {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const recordPath = path.join(currentDir, '../../api/sent-notifs.json');
    const content = await fs.readFile(recordPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function saveSentRecords(records) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const recordPath = path.join(currentDir, '../../api/sent-notifs.json');
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(recordPath, JSON.stringify(records, null, 2));
}

main();
