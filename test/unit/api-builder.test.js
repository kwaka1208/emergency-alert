import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { buildApiJSON } from '../../src/lib/api-builder.js';

let severityConfig;

// テスト前に設定ファイルを読み込む
const configJson = await fs.readFile('src/config/severity.json', 'utf-8');
severityConfig = JSON.parse(configJson);

test('api-builder - builds API JSON from processed entries', () => {
  const entries = [
    {
      entry: { id: '1', title: 'Test Report', updated: '2026-07-29T10:00:00Z' },
      report: {
        title: '気象警報・注意報（Ｈ２７）',
        infoType: '発表',
        reportDateTime: '2026-07-29T10:00:00+09:00',
        eventID: null,
      },
      diff: {
        added: [{ areaCode: '150010', warnings: ['10:大雨'] }],
        upgraded: [],
        downgraded: [],
        removed: [],
      },
    },
  ];

  const result = buildApiJSON(entries, severityConfig);

  assert(result.timestamp);
  assert.strictEqual(result.summary.total, 1);
  assert.strictEqual(result.summary.byLevel.digest, 1);
  assert.strictEqual(result.digest.length, 1);
});

test('api-builder - classifies by severity', () => {
  const entries = [
    {
      entry: { id: '1', title: 'Tsunami', updated: '2026-07-29T10:00:00Z' },
      report: {
        title: '津波警報',
        infoType: '発表',
        reportDateTime: '2026-07-29T10:00:00+09:00',
        eventID: null,
      },
      diff: {
        added: [{ areaCode: '500000', warnings: ['tsunami'] }],
        upgraded: [],
        downgraded: [],
        removed: [],
      },
    },
    {
      entry: { id: '2', title: 'Weather', updated: '2026-07-29T10:01:00Z' },
      report: {
        title: '府県天気予報（Ｒ１）',
        infoType: '発表',
        reportDateTime: '2026-07-29T10:01:00+09:00',
        eventID: null,
      },
      diff: {
        added: [{ areaCode: '150000', warnings: ['weather'] }],
        upgraded: [],
        downgraded: [],
        removed: [],
      },
    },
  ];

  const result = buildApiJSON(entries, severityConfig);

  assert.strictEqual(result.summary.byLevel.immediate, 1);
  assert.strictEqual(result.summary.byLevel.record, 1);
});

test('api-builder - bundles same EventID', () => {
  const eventId = 'eq-2026-07-29-001';

  const entries = [
    {
      entry: { id: '1', title: 'Eq 1', updated: '2026-07-29T10:00:00Z' },
      report: {
        title: '震源・震度に関する情報',
        infoType: '発表',
        reportDateTime: '2026-07-29T10:00:00+09:00',
        eventID: eventId,
      },
      diff: {
        added: [{ areaCode: '130000', warnings: ['shindo5'] }],
        upgraded: [],
        downgraded: [],
        removed: [],
      },
    },
    {
      entry: { id: '2', title: 'Eq 2 (followup)', updated: '2026-07-29T10:05:00Z' },
      report: {
        title: '震源・震度に関する情報',
        infoType: '発表',
        reportDateTime: '2026-07-29T10:05:00+09:00',
        eventID: eventId,
      },
      diff: {
        added: [],
        upgraded: [{ areaCode: '130000', added: ['shindo6'] }],
        downgraded: [],
        removed: [],
      },
    },
  ];

  const result = buildApiJSON(entries, severityConfig);

  // 同一EventIDで束ねられるので、resultは1件
  const bundledItem = result.record[0];
  assert.strictEqual(bundledItem.serialCount, 2);
  assert(bundledItem.eventID);
});

test('api-builder - aggregates area changes', () => {
  const entries = [
    {
      entry: { id: '1', title: 'Report', updated: '2026-07-29T10:00:00Z' },
      report: {
        title: '気象警報・注意報（Ｒ０６）（大雨）',
        infoType: '発表',
        reportDateTime: '2026-07-29T10:00:00+09:00',
        eventID: null,
      },
      diff: {
        added: [
          { areaCode: '150010', warnings: ['10:大雨'] },
          { areaCode: '150020', warnings: ['10:大雨'] },
        ],
        upgraded: [],
        downgraded: [],
        removed: [],
      },
    },
  ];

  const result = buildApiJSON(entries, severityConfig);

  const item = result.digest[0];
  assert.strictEqual(item.changes.added, 2);
  assert.strictEqual(item.areas.length, 2);
});
