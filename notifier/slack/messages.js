// Slack メッセージフォーマット

export function buildSlackMessage(apiData) {
  const immediate = apiData.immediate || [];
  const digest = apiData.digest || [];

  const blocks = [];

  // ヘッダー
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: '🚨 防災情報アラート',
    },
  });

  // タイムスタンプ
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `📅 ${new Date(apiData.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
      },
    ],
  });

  // サマリー
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `新着エントリ: *${apiData.summary?.totalNewEntries || 0}* 件`,
    },
  });

  // 即時通知セクション
  if (immediate.length > 0) {
    blocks.push({
      type: 'divider',
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚨 *即時通知* (${immediate.length}件)`,
      },
    });

    for (const alert of immediate.slice(0, 5)) {
      const areas = alert.areas ? alert.areas.join(', ') : '全国';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${alert.reportTitle}*\n  地域: ${areas}`,
        },
      });
    }

    if (immediate.length > 5) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `他 ${immediate.length - 5} 件`,
          },
        ],
      });
    }
  }

  // 集約通知セクション
  if (digest.length > 0) {
    blocks.push({
      type: 'divider',
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *集約通知* (${digest.length}件)`,
      },
    });

    for (const alert of digest.slice(0, 3)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• ${alert.reportTitle}`,
        },
      });
    }

    if (digest.length > 3) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `他 ${digest.length - 3} 件`,
          },
        ],
      });
    }
  }

  // 通知なしの場合
  if (immediate.length === 0 && digest.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '特に通知すべき防災情報はありません。',
      },
    });
  }

  blocks.push({
    type: 'divider',
  });

  const apiUrl = process.env.API_URL ||
    'https://raw.githubusercontent.com/user/emergency-alert/main/api/latest.json';

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `<${apiUrl}|詳細はこちら>`,
      },
    ],
  });

  return {
    blocks,
    text: `防災情報アラート: 即時${immediate.length}件、集約${digest.length}件`,
  };
}

export function buildThreadMessage(alert) {
  // 詳細メッセージ用（スレッド返信）
  const text = `
*${alert.reportTitle}*
• 情報種別: ${alert.infoType}
• 対象地域: ${alert.areas.join(', ')}
• 変更内容: 新規${alert.changes.added}件, 格上げ${alert.changes.upgraded}件, 格下げ${alert.changes.downgraded}件, 解除${alert.changes.removed}件
• 発表時刻: ${new Date(alert.reportId).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
  `.trim();

  return {
    text,
  };
}
