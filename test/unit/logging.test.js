import test from 'node:test';
import assert from 'node:assert';
import { structuredLog, logPollStats } from '../../src/lib/logging.js';

test('structuredLog - outputs JSON structure', () => {
  // ログ出力をキャプチャするため、console.log を一時的にモック
  let capturedLog = '';
  const originalLog = console.log;
  console.log = (msg) => {
    capturedLog = msg;
  };

  structuredLog('info', 'Test message', { data: 'value' });

  console.log = originalLog;

  const parsed = JSON.parse(capturedLog);
  assert.strictEqual(parsed.severity, 'INFO');
  assert.strictEqual(parsed.message, 'Test message');
  assert.strictEqual(parsed.data, 'value');
  assert(parsed.timestamp);
});

test('logPollStats - formats statistics', () => {
  let capturedLog = '';
  const originalLog = console.log;
  console.log = (msg) => {
    capturedLog = msg;
  };

  logPollStats({
    feeds: 4,
    newEntries: 23,
    duration_ms: 1234,
  });

  console.log = originalLog;

  const parsed = JSON.parse(capturedLog);
  assert.strictEqual(parsed.feeds_total, 4);
  assert.strictEqual(parsed.new_entries, 23);
  assert.strictEqual(parsed.duration_ms, 1234);
});
