// プロセッサ。電文処理 → 状態差分判定 → JSON生成

import { XMLParser } from 'fast-xml-parser';
import { parseReport } from '../lib/report.js';
import { buildNewState, calculateStateDiff, hasStateDiff } from '../lib/state-manager.js';
import { buildFeedJSON } from '../lib/json-builder.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

export async function processEntry(entry, store, userAgent, fetchReportFn = null) {
  // fetchReportFn がない場合はスキップ（テスト用）
  if (!fetchReportFn) {
    return null;
  }

  try {
    // 電文本体を取得
    const reportXml = await fetchReportFn(entry.id, { userAgent });

    // パース
    const doc = parser.parse(reportXml);
    const reportData = parseReport(doc);

    // 状態を構築
    const newState = buildNewState(reportData);

    // 状態キーを決定（ReportDateTimeとタイトルから）
    const stateKey = buildStateKey(reportData);

    // 前回状態を取得
    const oldState = await store.getReportState(stateKey) || [];

    // 古い電文が遅れて届かないよう ReportDateTime で判定
    const oldDateTime = new Date(oldState.reportDateTime || '0');
    const newDateTime = new Date(reportData.reportDateTime || '0');

    if (newDateTime < oldDateTime) {
      // 古い電文は無視
      return null;
    }

    // 状態差分を計算
    const diff = calculateStateDiff(oldState.data || [], newState, reportData.infoType);

    if (!hasStateDiff(diff)) {
      // 差分がなければ処理しない
      return null;
    }

    // 新しい状態を保存
    await store.saveReportState(stateKey, {
      reportDateTime: reportData.reportDateTime,
      data: newState,
    });

    return {
      entry: {
        id: entry.id,
        title: entry.title,
        updated: entry.updated,
      },
      report: reportData,
      state: newState,
      diff: diff,
    };
  } catch (err) {
    console.error(`Error processing entry ${entry.id}:`, err.message);
    return null;
  }
}

export function buildStateKey(reportData) {
  // タイトルとInfoKindから状態キーを作成
  return `${reportData.infoKind}:${reportData.title}`;
}

export function buildProcessorJSON(processedEntries) {
  const results = [];

  for (const entry of processedEntries) {
    if (entry) {
      results.push({
        id: entry.entry.id,
        title: entry.entry.title,
        updated: entry.entry.updated,
        content: JSON.stringify({
          infoType: entry.report.infoType,
          eventID: entry.report.eventID,
          changes: {
            added: entry.diff.added.length,
            upgraded: entry.diff.upgraded.length,
            downgraded: entry.diff.downgraded.length,
            removed: entry.diff.removed.length,
          },
        }),
      });
    }
  }

  return buildFeedJSON('processor', results);
}

export class MockReportStore {
  constructor() {
    this.states = new Map();
  }

  async getReportState(key) {
    return this.states.get(key) || null;
  }

  async saveReportState(key, state) {
    this.states.set(key, state);
  }
}
