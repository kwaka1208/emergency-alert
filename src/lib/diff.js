// 状態差分の判定。pure function。
// 府県予報区ごとの警報・注意報の状態を比較し、変化を検出する。

export function calculateDiff(oldState, newState) {
  const changes = {
    added: [],
    upgraded: [],
    downgraded: [],
    removed: [],
  };

  const oldMap = new Map(oldState || []);
  const newMap = new Map(newState || []);

  // 新規追加 / 格上げ
  for (const [key, newInfo] of newMap) {
    const oldInfo = oldMap.get(key);
    if (!oldInfo) {
      changes.added.push({ key, info: newInfo });
    } else if (compareLevel(newInfo.level, oldInfo.level) > 0) {
      changes.upgraded.push({ key, old: oldInfo, new: newInfo });
    }
  }

  // 格下げ / 解除
  for (const [key, oldInfo] of oldMap) {
    const newInfo = newMap.get(key);
    if (!newInfo) {
      changes.removed.push({ key, info: oldInfo });
    } else if (compareLevel(newInfo.level, oldInfo.level) < 0) {
      changes.downgraded.push({ key, old: oldInfo, new: newInfo });
    }
  }

  return changes;
}

// レベル比較。larger = より深刻。
function compareLevel(newLevel, oldLevel) {
  const levels = {
    'immediate': 100,
    'digest': 50,
    'record': 10,
  };
  return (levels[newLevel] || 0) - (levels[oldLevel] || 0);
}

export function hasChanges(diff) {
  return (
    diff.added.length > 0 ||
    diff.upgraded.length > 0 ||
    diff.downgraded.length > 0 ||
    diff.removed.length > 0
  );
}
