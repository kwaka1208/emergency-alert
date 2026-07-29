// 府県予報区ごとの警報・注意報状態を管理。pure function。

export function buildNewState(reportInfo) {
  // 電文の information から、「府県予報区コード → 警報・注意報の集合」を構築
  const stateMap = new Map();

  for (const info of reportInfo.information) {
    const areaCode = info.areaCode;
    if (!stateMap.has(areaCode)) {
      stateMap.set(areaCode, {
        areaCode,
        areaName: info.areaName,
        warnings: new Set(),
      });
    }

    const state = stateMap.get(areaCode);
    state.warnings.add(`${info.kindCode}:${info.kindName}`);
  }

  // Set を配列に変換
  const result = [];
  for (const [, state] of stateMap) {
    result.push({
      areaCode: state.areaCode,
      areaName: state.areaName,
      warnings: Array.from(state.warnings).sort(),
    });
  }

  return result;
}

export function calculateStateDiff(oldState, newState, infoType) {
  // infoType === '取消' は全解除
  if (infoType === '取消') {
    return {
      added: [],
      upgraded: [],
      downgraded: [],
      removed: oldState.map(s => ({
        areaCode: s.areaCode,
        areaName: s.areaName,
        warnings: s.warnings,
      })),
    };
  }

  const oldMap = new Map();
  for (const state of oldState) {
    oldMap.set(state.areaCode, new Set(state.warnings));
  }

  const newMap = new Map();
  for (const state of newState) {
    newMap.set(state.areaCode, new Set(state.warnings));
  }

  const diff = {
    added: [],
    upgraded: [],
    downgraded: [],
    removed: [],
  };

  // 新規追加 / 格上げ
  for (const [areaCode, newWarnings] of newMap) {
    const oldWarnings = oldMap.get(areaCode);

    if (!oldWarnings) {
      // 新規地域
      diff.added.push({
        areaCode,
        warnings: Array.from(newWarnings),
      });
    } else {
      // 既存地域：追加された警報を検知
      const added = Array.from(newWarnings).filter(w => !oldWarnings.has(w));
      if (added.length > 0) {
        diff.upgraded.push({
          areaCode,
          added,
          previous: Array.from(oldWarnings),
          current: Array.from(newWarnings),
        });
      }
    }
  }

  // 格下げ / 解除
  for (const [areaCode, oldWarnings] of oldMap) {
    const newWarnings = newMap.get(areaCode);

    if (!newWarnings) {
      // 全解除
      diff.removed.push({
        areaCode,
        warnings: Array.from(oldWarnings),
      });
    } else {
      // 既存地域：削除された警報を検知
      const removed = Array.from(oldWarnings).filter(w => !newWarnings.has(w));
      if (removed.length > 0) {
        diff.downgraded.push({
          areaCode,
          removed,
          previous: Array.from(oldWarnings),
          current: Array.from(newWarnings),
        });
      }
    }
  }

  return diff;
}

export function hasStateDiff(diff) {
  return (
    diff.added.length > 0 ||
    diff.upgraded.length > 0 ||
    diff.downgraded.length > 0 ||
    diff.removed.length > 0
  );
}
