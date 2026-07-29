// 構造化ログ。GCP Cloud Logging 対応。

export function structuredLog(severity, message, data = {}) {
  const logEntry = {
    severity: severity.toUpperCase(),
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // GCP Cloud Logging 互換の JSON 形式で出力
  console.log(JSON.stringify(logEntry));
}

export function logPollStats(stats) {
  structuredLog('info', 'Poll statistics', {
    feeds_total: stats.feeds || 0,
    new_entries: stats.newEntries || 0,
    cached_responses: stats.cached || 0,
    duration_ms: stats.duration_ms || 0,
  });
}

export function logDiffStats(diff, feedName) {
  structuredLog('info', 'Diff detected', {
    feed: feedName,
    added: diff.added.length,
    upgraded: diff.upgraded.length,
    downgraded: diff.downgraded.length,
    removed: diff.removed.length,
  });
}

export function logNotificationStats(severityBreakdown) {
  structuredLog('info', 'Notification statistics', {
    immediate: severityBreakdown.immediate || 0,
    digest: severityBreakdown.digest || 0,
    record: severityBreakdown.record || 0,
    total: (severityBreakdown.immediate || 0) +
           (severityBreakdown.digest || 0) +
           (severityBreakdown.record || 0),
  });
}
