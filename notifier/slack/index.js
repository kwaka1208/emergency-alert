// Slack 通知メイン
// GitHub Actions から実行: API JSON を取得して Slack に通知

import { buildSlackMessage } from './messages.js';

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

    // メッセージを構築
    const message = buildSlackMessage(apiData);

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

    console.log('✅ Slack notification sent successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
