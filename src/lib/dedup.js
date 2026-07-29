// 送信済み通知の記録と確認。

export function filterUnsent(entries, sentIds) {
  return entries.filter(entry => !sentIds.has(entry.id));
}

export function buildSentIdSet(sentRecords) {
  return new Set(sentRecords.map(r => r.id));
}

export function addSentRecord(entry, timestamp = new Date().toISOString()) {
  return {
    id: entry.id,
    title: entry.title,
    severity: entry.severity,
    sentAt: timestamp,
  };
}
