import test from 'node:test';
import assert from 'node:assert';
import { MockGitHub } from '../../src/lib/github.js';

test('MockGitHub - stores files', async () => {
  const github = new MockGitHub();
  const jsonData = {
    timestamp: '2026-07-29T10:00:00Z',
    immediate: [],
    digest: [],
    record: [],
  };

  await github.pushToGitHub(jsonData, {
    owner: 'test-owner',
    repo: 'test-repo',
    token: 'test-token',
  });

  const latest = github.getFile('latest.json');
  assert(latest);
  assert.strictEqual(latest.timestamp, '2026-07-29T10:00:00Z');
});

test('MockGitHub - creates archive path with date', async () => {
  const github = new MockGitHub();
  const jsonData = { test: true };

  await github.pushToGitHub(jsonData, {
    owner: 'test',
    repo: 'test',
    token: 'test',
  });

  // アーカイブファイルが存在することを確認
  const files = Array.from(github.files.keys());
  assert(files.some(f => f.startsWith('archive/')));
});
