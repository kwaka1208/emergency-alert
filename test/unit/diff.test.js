import test from 'node:test';
import assert from 'node:assert';
import { calculateDiff, hasChanges } from '../../src/lib/diff.js';

test('calculateDiff - detects new alerts', () => {
  const oldState = [];
  const newState = [
    ['area-01', { title: '暴風警報', level: 'digest' }],
  ];
  const diff = calculateDiff(oldState, newState);
  assert.strictEqual(diff.added.length, 1);
  assert.strictEqual(diff.added[0].key, 'area-01');
});

test('calculateDiff - detects removed alerts', () => {
  const oldState = [
    ['area-01', { title: '暴風警報', level: 'digest' }],
  ];
  const newState = [];
  const diff = calculateDiff(oldState, newState);
  assert.strictEqual(diff.removed.length, 1);
  assert.strictEqual(diff.removed[0].key, 'area-01');
});

test('calculateDiff - detects upgrade', () => {
  const oldState = [
    ['area-01', { title: '暴風注意報', level: 'record' }],
  ];
  const newState = [
    ['area-01', { title: '暴風警報', level: 'digest' }],
  ];
  const diff = calculateDiff(oldState, newState);
  assert.strictEqual(diff.upgraded.length, 1);
  assert.strictEqual(diff.downgraded.length, 0);
});

test('calculateDiff - detects downgrade', () => {
  const oldState = [
    ['area-01', { title: '暴風警報', level: 'digest' }],
  ];
  const newState = [
    ['area-01', { title: '暴風注意報', level: 'record' }],
  ];
  const diff = calculateDiff(oldState, newState);
  assert.strictEqual(diff.downgraded.length, 1);
  assert.strictEqual(diff.upgraded.length, 0);
});

test('calculateDiff - ignores unchanged alerts', () => {
  const oldState = [
    ['area-01', { title: '暴風警報', level: 'digest' }],
  ];
  const newState = [
    ['area-01', { title: '暴風警報', level: 'digest' }],
  ];
  const diff = calculateDiff(oldState, newState);
  assert.strictEqual(hasChanges(diff), false);
});

test('hasChanges - returns true when there are changes', () => {
  const diff = { added: [{ key: 'a1' }], upgraded: [], downgraded: [], removed: [] };
  assert.strictEqual(hasChanges(diff), true);
});

test('hasChanges - returns false when no changes', () => {
  const diff = { added: [], upgraded: [], downgraded: [], removed: [] };
  assert.strictEqual(hasChanges(diff), false);
});
