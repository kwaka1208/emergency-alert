# テスト戦略

実サーバーアクセスに依存しない、堅牢なテスト設計です。

## テスト方針

### ✅ テストすること

- **純粋関数**: atom.js, severity.js, diff.js, state-manager.js
- **ロジック**: エントリパース、状態差分判定、深刻度分類
- **エッジケース**: 1件のエントリ、取消電文、古い電文

### ❌ テストしないこと

- **実サーバーアクセス**: 気象庁サーバーへの実装リクエスト
- **外部API**: Slack Webhook、GitHub API の実際の呼び出し
- **ステートフル操作**: Firestore、ファイルシステムへの実写入

---

## フィクスチャデータ

### テストデータの役割

実際の気象庁フィードからダウンロードしたサンプルを保存：

```
test/fixtures/
├── README.md
├── feeds/
│   ├── extra.xml              # 気象警報・注意報フィード
│   ├── eqvol.xml              # 地震・津波・火山フィード
│   ├── other.xml              # その他
│   └── regular.xml            # 定時情報
├── reports/                   # 電文サンプル
│   ├── alert_tokyo_1.xml      # 東京都心の警報
│   ├── alert_tokyo_2.xml      # 同じ府県の連続電文
│   ├── tsunami.xml            # 津波警報
│   ├── earthquake.xml         # 地震情報
│   ├── cancellation.xml       # 取消電文
│   ├── correction.xml         # 訂正電文
│   ├── special_warning.xml    # 特別警報
│   └── delay.xml              # 遅延電文
└── PHASE0_REPORT.json         # Phase 0 実測データ
```

### 実装方針

**フィクスチャは決して変更しない**（テストの再現性が失われる）。

新しい電文フォーマットが出たら、新しいファイルを追加。

---

## テストレイヤー

### Layer 1: Atom フィードパース

**ファイル**: `test/unit/atom.test.js`

**テスト内容**:

| テスト | 期待値 | ファイル |
| --- | --- | --- |
| 複数エントリのパース | 18個のエントリを正確に抽出 | extra.xml |
| エントリの id フィールド | URL として保存される | 任意 |
| エントリの updated | ISO 8601 として正規化 | 任意 |
| エントリ1件だけ | 正しくパースされる | 手作成 XML |

```javascript
it('parses feed with multiple entries', () => {
  const feed = parseAtomFeed(xmlDoc);
  expect(feed.entries).toHaveLength(18);
  expect(feed.entries[0].id).toMatch(/^http/);
});
```

### Layer 2: 重複排除

**ファイル**: `test/unit/atom.test.js`

**テスト内容**:

| テスト | 期待値 |
| --- | --- |
| 同じ ID が2回来た | 2回目を除外 |
| 別の ID | 両方を取得 |
| 40エントリ（10分ぶん）のループ | 重複なく処理 |

```javascript
it('detects duplicate entries by SHA1 hash', () => {
  const hash1 = sha1(entry1.id);
  const hash2 = sha1(entry1.id);  // 同じ
  expect(hash1).toBe(hash2);
});
```

### Layer 3: 電文パース

**ファイル**: `test/unit/report.test.js`

**テスト内容**:

| テスト | 期待値 | ファイル |
| --- | --- | --- |
| 気象警報パース | Area ごとに Kind を抽出 | alert_tokyo_1.xml |
| 津波警報パース | Warning タイプ、対象都道府県 | tsunami.xml |
| 地震情報パース | EventID、震度速報 | earthquake.xml |
| 1つの Area | 配列に正規化される | 手作成 |
| 複数 Area | すべて抽出される | alert_tokyo_1.xml |

```javascript
it('parses Flood content with areas', () => {
  const report = parseReport(xmlString);
  expect(report.areas).toHaveLength(3);
  expect(report.areas[0].code).toBe('130000');  // 東京都
});
```

### Layer 4: 状態差分判定

**ファイル**: `test/unit/diff.test.js`

**最も重要なテスト層。**

**テスト内容**:

| テスト | 入力 | 期待値 |
| --- | --- | --- |
| 新規発表 | 前回:[], 現在:[警報] | changed.added = 1 |
| 格上げ | 前回:[注意], 現在:[警報] | changed.upgraded = 1 |
| 格下げ | 前回:[警報], 現在:[注意] | changed.downgraded = 1 |
| 解除 | 前回:[警報], 現在:[] | changed.removed = 1 |
| 変化なし | 前回:[警報], 現在:[警報] | changed.total = 0 |

```javascript
it('detects new alert', () => {
  const diff = diff([], [alertA]);
  expect(diff.added).toBe(1);
  expect(diff.total).toBe(1);
});

it('detects alert cancellation', () => {
  const diff = diff([alertA], []);
  expect(diff.removed).toBe(1);
  expect(diff.total).toBe(1);
});
```

### Layer 5: 連続電文テスト（状態遷移）

**ファイル**: `test/unit/state-manager.test.js`

**最も現実的なテスト。**

**テスト手順**:

```
1. 初期状態を作成: state = {}

2. 電文1を処理（alert_tokyo_1.xml）
   → 東京都に警報が発表される
   → state.tokyo = [警報]
   → 変更検知: added=1

3. 電文2を処理（alert_tokyo_2.xml、同じ府県の続報）
   → 同じ警報が格上げされる
   → state.tokyo = [警報+]
   → 変更検知: upgraded=1

4. 電文3を処理（cancellation.xml）
   → 警報が全解除
   → state.tokyo = []
   → 変更検知: removed=1
```

**なぜ大事か**: 実運用では、複数の電文が連続して来て、その都度状態が遷移する。

---

### Layer 6: 深刻度判定

**ファイル**: `test/unit/severity.test.js`

**テスト内容**:

| 情報名 | 期待される深刻度 | テストファイル |
| --- | --- | --- |
| 津波警報 | immediate | tsunami.xml |
| 特別警報 | immediate | special_warning.xml |
| 暴風警報 | digest | alert_tokyo_1.xml |
| 注意報 | record | 手作成 |
| 気象防災速報 | record | - |

```javascript
it('classifies tsunami as immediate', () => {
  const severity = getSeverity('津波警報');
  expect(severity).toBe('immediate');
});

it('classifies wind warning as digest', () => {
  const severity = getSeverity('暴風警報');
  expect(severity).toBe('digest');
});
```

### Layer 7: EventID 束ね

**ファイル**: `test/unit/api-builder.test.js`

**テスト内容**:

| テスト | 入力 | 期待値 |
| --- | --- | --- |
| 同一 EventID | 地震情報3件（震度速報→震源情報→震源震度） | 1つの通知オブジェクト |
| 異なる EventID | 別々の地震 | 複数の通知オブジェクト |
| serialCount 増加 | EventID A は serial 1, 2, 3 | 最新版で代替 |

```javascript
it('bundles reports with same EventID', () => {
  const events = [
    { eventID: 'eq-001', serialCount: 1, ... },
    { eventID: 'eq-001', serialCount: 2, ... },
    { eventID: 'eq-001', serialCount: 3, ... },
  ];
  const bundled = bundleByEventID(events);
  expect(bundled).toHaveLength(1);
  expect(bundled[0].serialCount).toBe(3);
});
```

---

## エッジケーステスト

### エッジケース一覧

| ケース | 理由 | テストファイル |
| --- | --- | --- |
| Area が1件だけ | fast-xml-parser の配列化問題 | atom.test.js |
| 古い ReportDateTime | 遅延電文への対応 | state-manager.test.js |
| InfoType = 訂正 | 同じ EventID の上書き | report.test.js |
| InfoType = 取消 | 状態を全削除 | state-manager.test.js |
| 空のフィード | 更新がない場合 | atom.test.js |
| タイムゾーン混在 | `+09:00` と `Z` | diff.test.js |
| 同一プリフィックスの情報名 | 部分マッチの除外 | severity.test.js |

---

## テスト実行

### ローカル実行

```bash
# すべてのテスト
npm test

# 特定のテストファイルのみ
npm test -- atom.test.js

# パターンマッチ
npm test -- --grep "state-manager"

# 詳細出力
npm test -- --reporter tap
```

### GitHub Actions での自動実行

```yaml
# .github/workflows/test.yml（別ワークフロー）
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm install
      - run: npm test
```

---

## カバレッジ目標

| レイヤー | 行カバレッジ | ブランチカバレッジ |
| --- | --- | --- |
| atom.js（フィードパース） | 100% | 100% |
| diff.js（状態差分） | 100% | 100% |
| severity.js（深刻度判定） | 100% | 100% |
| state-manager.js（状態管理） | 95% | 90% |
| json-builder.js（JSON生成） | 90% | 85% |

### なぜ 100% でなくか

- エラーハンドリングの一部（ネットワーク例外等）は実装テストで検証
- 純粋ロジックは 100% 目指す
- I/O 操作は 70～90% で十分

---

## フィクスチャの更新

### 新しい電文フォーマットが出た場合

1. 気象庁から最新 XML をダウンロード
2. `test/fixtures/reports/` に保存
3. 新しいテストケースを追加
4. git commit

```bash
git add test/fixtures/new_format.xml
git commit -m "Add fixture: new earthquake information format"
```

### 決してやってはいけないこと

```bash
# ❌ 絶対ダメ
rm test/fixtures/*.xml
curl https://www.data.jma.go.jp/... > test/fixtures/extra.xml
npm test  # テスト結果が毎回変わる
```

---

## 実装例

### 簡単なテストの書き方

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { parseAtomFeed } from '../src/lib/atom.js';
import fs from 'fs/promises';

test('Atom feed parsing', async () => {
  const xml = await fs.readFile('test/fixtures/feeds/extra.xml', 'utf8');
  const feed = parseAtomFeed(xml);
  
  assert.ok(feed.entries);
  assert.strictEqual(feed.entries.length, 18);
  assert.match(feed.entries[0].id, /^http/);
});
```

### 状態遷移テストの書き方

```javascript
test('State transition: new alert → upgrade → cancel', async () => {
  let state = {};

  // ステップ1: 新規発表
  const report1 = parseReport(await fs.readFile('.../alert_1.xml', 'utf8'));
  const diff1 = computeDiff(state, report1);
  state = applyState(state, report1);
  assert.strictEqual(diff1.added, 1);

  // ステップ2: 格上げ
  const report2 = parseReport(await fs.readFile('.../alert_2.xml', 'utf8'));
  const diff2 = computeDiff(state, report2);
  state = applyState(state, report2);
  assert.strictEqual(diff2.upgraded, 1);

  // ステップ3: 取消
  const report3 = parseReport(await fs.readFile('.../cancellation.xml', 'utf8'));
  const diff3 = computeDiff(state, report3);
  state = applyState(state, report3);
  assert.strictEqual(diff3.removed, 1);
});
```

---

## まとめ

| 方針 | 実装 |
| --- | --- |
| 実サーバーアクセスなし | フィクスチャ使用 |
| 純粋関数に厚くテスト | 副作用なしの関数を優先 |
| エッジケースを網羅 | 既知の落とし穴 9つをカバー |
| 状態遷移を検証 | 連続電文での差分判定テスト |
| 時系列的正確性 | ReportDateTime テスト |

詳細は [docs/IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) で実装上の落とし穴を確認ください。
