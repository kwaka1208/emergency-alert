// エントリを深刻度で分類する。pure function。

import severityConfig from '../config/severity.json' with { type: 'json' };

export function classifyBySeverity(entries) {
  const classified = {
    immediate: [],
    digest: [],
    record: [],
  };

  for (const entry of entries) {
    const level = getSeverityLevel(entry.title);
    classified[level].push({
      ...entry,
      severity: level,
    });
  }

  return classified;
}

function getSeverityLevel(title) {
  if (severityConfig.immediate.titles.includes(title)) {
    return 'immediate';
  }
  if (severityConfig.digest.titles.includes(title)) {
    return 'digest';
  }
  return 'record';
}

export function isNotifiable(level) {
  return level === 'immediate' || level === 'digest';
}
