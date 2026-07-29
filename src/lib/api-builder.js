// API出力用JSON生成。全フィード・全処理結果を集約し、
// severity に基づいて immediate / digest / record に分類。

import { loadSeverityConfig, getSeverity } from './severity.js';

export function buildApiJSON(processedEntries, severityConfig) {
  const severityMap = loadSeverityConfig(severityConfig);

  const result = {
    timestamp: new Date().toISOString(),
    immediate: [],
    digest: [],
    record: [],
    summary: {
      total: 0,
      byLevel: { immediate: 0, digest: 0, record: 0 },
    },
  };

  // EventID でグループ化（続報の束ね）
  const eventGroups = groupByEventId(processedEntries);

  for (const [eventId, entries] of eventGroups) {
    // 各グループで最新の情報を取得
    const aggregated = aggregateEventEntries(entries);

    // 深刻度を判定
    const severity = getSeverity(aggregated.reportTitle, severityMap);

    const item = {
      timestamp: aggregated.timestamp,
      reportId: aggregated.reportId,
      reportTitle: aggregated.reportTitle,
      infoType: aggregated.infoType,
      eventID: eventId,
      serialCount: entries.length,
      changes: aggregated.changes,
      areas: aggregated.areas,
    };

    if (severity === 'immediate') {
      result.immediate.push(item);
      result.summary.byLevel.immediate++;
    } else if (severity === 'digest') {
      result.digest.push(item);
      result.summary.byLevel.digest++;
    } else {
      result.record.push(item);
      result.summary.byLevel.record++;
    }

    result.summary.total++;
  }

  return result;
}

function groupByEventId(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const eventId = entry.report.eventID || `entry:${entry.entry.id}`;

    if (!groups.has(eventId)) {
      groups.set(eventId, []);
    }
    groups.get(eventId).push(entry);
  }

  return groups;
}

function aggregateEventEntries(entries) {
  // 同一EventIDの複数エントリを集約
  // 最新のレポート情報を優先し、変更をマージ
  if (entries.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      reportId: '',
      reportTitle: '',
      infoType: '発表',
      changes: { total: 0, added: 0, upgraded: 0, downgraded: 0, removed: 0 },
      areas: [],
    };
  }

  // ReportDateTime でソート（降順）
  entries.sort((a, b) => {
    const dateA = new Date(a.report.reportDateTime || '0');
    const dateB = new Date(b.report.reportDateTime || '0');
    return dateB - dateA;
  });

  const latest = entries[0];

  // 全エントリの変更を集約
  const allAreas = new Set();
  let totalAdded = 0;
  let totalUpgraded = 0;
  let totalDowngraded = 0;
  let totalRemoved = 0;

  for (const entry of entries) {
    const diff = entry.diff;
    totalAdded += diff.added.length;
    totalUpgraded += diff.upgraded.length;
    totalDowngraded += diff.downgraded.length;
    totalRemoved += diff.removed.length;

    // 対象地域を集約
    [...diff.added, ...diff.upgraded, ...diff.downgraded, ...diff.removed].forEach(change => {
      if (change.areaCode) {
        allAreas.add(change.areaCode);
      }
    });
  }

  return {
    timestamp: latest.entry.updated,
    reportId: latest.entry.id,
    reportTitle: latest.report.title,
    infoType: latest.report.infoType,
    changes: {
      total: totalAdded + totalUpgraded + totalDowngraded + totalRemoved,
      added: totalAdded,
      upgraded: totalUpgraded,
      downgraded: totalDowngraded,
      removed: totalRemoved,
    },
    areas: Array.from(allAreas).sort(),
  };
}
