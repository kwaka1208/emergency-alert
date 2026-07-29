import test from 'node:test';
import assert from 'node:assert';
import { loadSeverityConfig, getSeverity, isImmediateSeverity } from '../../src/lib/severity.js';

test('loadSeverityConfig - loads configuration', () => {
  const config = {
    '気象特別警報': { level: 'immediate' },
    '気象警報・注意報（Ｒ０６）': { level: 'digest' },
  };
  const result = loadSeverityConfig(config);
  assert.strictEqual(result instanceof Map, true);
  assert.strictEqual(result.size, 2);
});

test('getSeverity - matches prefix', () => {
  const config = {
    '気象特別警報': { level: 'immediate' },
    '気象警報・注意報（Ｒ０６）': { level: 'digest' },
    '熱中症': { level: 'record' },
  };
  const severityMap = loadSeverityConfig(config);

  assert.strictEqual(getSeverity('気象特別警報・警報・注意報', severityMap), 'immediate');
  assert.strictEqual(getSeverity('気象警報・注意報（Ｒ０６）（大雨）', severityMap), 'digest');
  assert.strictEqual(getSeverity('熱中症警戒アラート', severityMap), 'record');
});

test('getSeverity - returns null for non-matching title', () => {
  const config = { '気象': { level: 'digest' } };
  const severityMap = loadSeverityConfig(config);
  assert.strictEqual(getSeverity('地震速報', severityMap), null);
});

test('getSeverity - handles null/empty', () => {
  const config = {};
  const severityMap = loadSeverityConfig(config);
  assert.strictEqual(getSeverity(null, severityMap), null);
  assert.strictEqual(getSeverity('', severityMap), null);
});

test('isImmediateSeverity - checks severity level', () => {
  assert.strictEqual(isImmediateSeverity('immediate'), true);
  assert.strictEqual(isImmediateSeverity('digest'), false);
  assert.strictEqual(isImmediateSeverity('record'), false);
});
