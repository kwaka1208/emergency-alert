import { test } from 'node:test';
import assert from 'node:assert';
import { classifyBySeverity, isNotifiable } from '../../src/lib/severity-filter.js';

test('classifyBySeverity', async (t) => {
  await t.test('分類：即時通知', () => {
    const entries = [
      { id: '1', title: '気象特別警報' },
      { id: '2', title: '津波警報' },
      { id: '3', title: '噴火警報' },
    ];

    const result = classifyBySeverity(entries);

    assert.strictEqual(result.immediate.length, 3);
    assert.strictEqual(result.digest.length, 0);
    assert.strictEqual(result.record.length, 0);
  });

  await t.test('分類：集約通知', () => {
    const entries = [
      { id: '1', title: '気象警報・注意報（Ｒ０６）（大雨）' },
      { id: '2', title: '竜巻注意情報' },
      { id: '3', title: '土砂災害警戒情報' },
    ];

    const result = classifyBySeverity(entries);

    assert.strictEqual(result.immediate.length, 0);
    assert.strictEqual(result.digest.length, 3);
    assert.strictEqual(result.record.length, 0);
  });

  await t.test('分類：記録のみ', () => {
    const entries = [
      { id: '1', title: '気象警報・注意報（Ｒ０６）（その他注意報）' },
      { id: '2', title: '府県気象解説情報' },
      { id: '3', title: '震源・震度に関する情報' },
    ];

    const result = classifyBySeverity(entries);

    assert.strictEqual(result.immediate.length, 0);
    assert.strictEqual(result.digest.length, 0);
    assert.strictEqual(result.record.length, 3);
  });

  await t.test('分類：混合', () => {
    const entries = [
      { id: '1', title: '気象特別警報' },
      { id: '2', title: '気象警報・注意報（Ｒ０６）（大雨）' },
      { id: '3', title: '府県天気予報（Ｒ１）' },
    ];

    const result = classifyBySeverity(entries);

    assert.strictEqual(result.immediate.length, 1);
    assert.strictEqual(result.digest.length, 1);
    assert.strictEqual(result.record.length, 1);
    assert.strictEqual(result.immediate[0].severity, 'immediate');
    assert.strictEqual(result.digest[0].severity, 'digest');
    assert.strictEqual(result.record[0].severity, 'record');
  });

  await t.test('分類：未知のタイトル', () => {
    const entries = [
      { id: '1', title: '未知の情報' },
    ];

    const result = classifyBySeverity(entries);

    assert.strictEqual(result.immediate.length, 0);
    assert.strictEqual(result.digest.length, 0);
    assert.strictEqual(result.record.length, 1);
    assert.strictEqual(result.record[0].severity, 'record');
  });
});

test('isNotifiable', async (t) => {
  await t.test('即時通知は通知可能', () => {
    assert.strictEqual(isNotifiable('immediate'), true);
  });

  await t.test('集約通知は通知可能', () => {
    assert.strictEqual(isNotifiable('digest'), true);
  });

  await t.test('記録のみは通知不可', () => {
    assert.strictEqual(isNotifiable('record'), false);
  });
});
