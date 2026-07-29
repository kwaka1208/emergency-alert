import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { parseReport } from '../../src/lib/report.js';
import { buildNewState, calculateStateDiff, hasStateDiff } from '../../src/lib/state-manager.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

test('buildNewState - creates state map from report', () => {
  const reportInfo = {
    information: [
      { areaCode: '150010', areaName: '下越', kindCode: '10', kindName: '大雨注意報' },
      { areaCode: '150010', areaName: '下越', kindCode: '14', kindName: '雷注意報' },
      { areaCode: '150020', areaName: '中越', kindCode: '10', kindName: '大雨注意報' },
    ],
  };

  const state = buildNewState(reportInfo);

  assert.strictEqual(state.length, 2);
  const shimo = state.find(s => s.areaCode === '150010');
  assert(shimo);
  assert.strictEqual(shimo.warnings.length, 2);
});

test('calculateStateDiff - detects new warnings', () => {
  const oldState = [
    { areaCode: '150010', warnings: ['10:大雨注意報'] },
  ];

  const newState = [
    { areaCode: '150010', warnings: ['10:大雨注意報', '14:雷注意報'] },
  ];

  const diff = calculateStateDiff(oldState, newState, '発表');

  assert.strictEqual(hasStateDiff(diff), true);
  assert.strictEqual(diff.upgraded.length, 1);
  assert.strictEqual(diff.upgraded[0].added.includes('14:雷注意報'), true);
});

test('calculateStateDiff - detects removed warnings', () => {
  const oldState = [
    { areaCode: '150010', warnings: ['10:大雨注意報', '14:雷注意報'] },
  ];

  const newState = [
    { areaCode: '150010', warnings: ['10:大雨注意報'] },
  ];

  const diff = calculateStateDiff(oldState, newState, '発表');

  assert.strictEqual(diff.downgraded.length, 1);
  assert.strictEqual(diff.downgraded[0].removed.includes('14:雷注意報'), true);
});

test('calculateStateDiff - detects full cancellation on 取消', () => {
  const oldState = [
    { areaCode: '150010', warnings: ['10:大雨注意報', '14:雷注意報'] },
    { areaCode: '150020', warnings: ['10:大雨注意報'] },
  ];

  const diff = calculateStateDiff(oldState, [], '取消');

  assert.strictEqual(diff.removed.length, 2);
  assert.strictEqual(hasStateDiff(diff), true);
});

test('calculateStateDiff - no diff when state unchanged', () => {
  const oldState = [
    { areaCode: '150010', warnings: ['10:大雨注意報', '14:雷注意報'] },
  ];

  const newState = [
    { areaCode: '150010', warnings: ['10:大雨注意報', '14:雷注意報'] },
  ];

  const diff = calculateStateDiff(oldState, newState, '発表');

  assert.strictEqual(hasStateDiff(diff), false);
});

test('calculateStateDiff - fixture: niigata samestate', async () => {
  const xml1 = await fs.readFile('test/fixtures/reports/keiho_niigata_samestate_1.xml', 'utf-8');
  const xml2 = await fs.readFile('test/fixtures/reports/keiho_niigata_samestate_2.xml', 'utf-8');

  const doc1 = parser.parse(xml1);
  const doc2 = parser.parse(xml2);

  const report1 = parseReport(doc1);
  const report2 = parseReport(doc2);

  const state1 = buildNewState(report1);
  const state2 = buildNewState(report2);

  const diff = calculateStateDiff(state1, state2, '発表');

  // 内容が同じなので差分がない（またはごく小さい）
  console.log(`Niigata same state diff:`, diff);
});
