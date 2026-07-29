// Slack 通知メイン
// GitHub Actions から実行: API JSON を取得して Slack に通知

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildSlackMessage } from './messages.js';
import { filterUnsent, buildSentIdSet, addSentRecord } from '../../src/lib/dedup.js';

async function main() {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      console.log('⚠️  SLACK_WEBHOOK_URL not set, skipping Slack notification');
      process.exit(0);
    }

    console.log('🚀 Fetching JMA alert data...');

    // API から最新データを取得
    const apiUrl = process.env.API_URL ||
      'https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json';

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch API: ${response.status}`);
    }

    const apiData = await response.json();
    console.log(`✅ Fetched data with ${apiData.summary.totalNewEntries} new entries`);

    // 送信済みリストを読み込み
    const sentRecords = await loadSentRecords();
    const sentIds = buildSentIdSet(sentRecords);

    // 即時通知から未送信のものだけをフィルタリング
    const immediate = apiData.immediate || [];
    const unsentImmediate = filterUnsent(immediate, sentIds);

    console.log(`📋 Immediate alerts: ${immediate.length} total, ${unsentImmediate.length} unsent`);

    if (unsentImmediate.length === 0) {
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

    // 送信済みリストを更新
    const newRecords = unsentImmediate.map(entry => addSentRecord(entry));
    await saveSentRecords([...sentRecords, ...newRecords]);

    console.log(`✅ Slack notification sent successfully (${unsentImmediate.length} immediate)`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
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
