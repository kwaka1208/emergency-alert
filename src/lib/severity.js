// 情報名から深刻度を判定。pure function。
// severity の値: 'immediate' | 'digest' | 'record' | null（対象外）

export function loadSeverityConfig(configObject) {
  const result = new Map();
  for (const [levelName, levelConfig] of Object.entries(configObject)) {
    if (levelConfig.level && Array.isArray(levelConfig.titles)) {
      for (const title of levelConfig.titles) {
        result.set(title, levelConfig.level);
      }
    }
  }
  return result;
}

export function getSeverity(title, severityMap) {
  if (!title || !severityMap) return null;

  for (const [prefix, level] of severityMap) {
    if (title.startsWith(prefix)) {
      return level;
    }
  }

  return null;
}

export function isImmediateSeverity(severity) {
  return severity === 'immediate';
}

export function isDigestSeverity(severity) {
  return severity === 'digest';
}

export function isRecordOnlySeverity(severity) {
  return severity === 'record';
}
