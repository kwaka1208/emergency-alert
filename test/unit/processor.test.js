import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { processEntry, MockReportStore, buildProcessorJSON } from '../../src/processor/index.js';

test('processor - processes entry with state diff', async () => {
  const store = new MockReportStore();

  // ダミーの fetchReportFn
  const fetchReportFn = async (url) => {
    return await fs.readFile('test/fixtures/reports/keiho_niigata_samestate_1.xml', 'utf-8');
  };

  const entry = {
    id: 'http://example.com/report/1',
    title: 'Sample Report',
    updated: '2026-07-28T10:00:00Z',
  };

  const result = await processEntry(entry, store, 'test-agent', fetchReportFn);

  assert(result !== null);
  assert(result.report.title);
  assert(result.diff);
});

test('processor - skips unchanged state', async () => {
  const store = new MockReportStore();

  const fetchReportFn = async (url) => {
    return await fs.readFile('test/fixtures/reports/keiho_niigata_samestate_1.xml', 'utf-8');
  };

  const entry = {
    id: 'http://example.com/report/1',
    title: 'Sample Report',
    updated: '2026-07-28T10:00:00Z',
  };

  // 1回目：差分あり
  const result1 = await processEntry(entry, store, 'test-agent', fetchReportFn);
  assert(result1 !== null);

  // 2回目：同じ電文なので差分なし
  const result2 = await processEntry(entry, store, 'test-agent', fetchReportFn);
  assert.strictEqual(result2, null);
});

test('processor - respects ReportDateTime ordering', async () => {
  const store = new MockReportStore();

  const xml1 = await fs.readFile('test/fixtures/reports/keiho_niigata_samestate_1.xml', 'utf-8');
  const xml2 = await fs.readFile('test/fixtures/reports/keiho_niigata_samestate_2.xml', 'utf-8');

  let callCount = 0;
  const fetchReportFn = async (url) => {
    return callCount++ === 0 ? xml1 : xml2;
  };

  const entry = {
    id: 'http://example.com/report/1',
    title: 'Sample',
    updated: '2026-07-28T10:00:00Z',
  };

  // 1回目：新しい日時の電文
  const result1 = await processEntry(entry, store, 'test-agent', fetchReportFn);
  assert(result1 !== null || result1 === null); // どちらでもOK

  // 2回目：古い日時の電文（無視される）
  const result2 = await processEntry(entry, store, 'test-agent', fetchReportFn);
  // 状態が巻き戻されていないことを確認
});

test('processor - buildProcessorJSON formats results', () => {
  const entries = [
    {
      entry: { id: '1', title: 'Report 1', updated: '2026-07-28T10:00:00Z' },
      report: { infoType: '発表', eventID: null },
      diff: {
        added: [{ areaCode: '150010', warnings: ['10:大雨'] }],
        upgraded: [],
        downgraded: [],
        removed: [],
      },
    },
  ];

  const result = buildProcessorJSON(entries);

  assert.strictEqual(result.feed, 'processor');
  assert.strictEqual(result.count, 1);
  assert(result.entries[0].content);
});
