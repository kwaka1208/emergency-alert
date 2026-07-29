# 実装上の落とし穴（既知）

実装時に実際に引っかかった注意点をまとめています。

## 1. Entry の `id` は電文 XML の URL そのもの

### 落とし穴

Atom フィードの各 `entry` には `id` フィールドがあります。

```xml
<entry>
  <id>http://example.com/xml/20260729100000_0.xml</id>
  <title>気象警報・注意報</title>
  <updated>2026-07-29T10:00:00Z</updated>
</entry>
```

この `id` は **電文本体の XML URL と完全に一致**します。

### 活用

重複排除キーとしてそのまま使える：

```javascript
const seenEntries = new Set();

for (const entry of feedData.entries) {
  const hash = crypto.createHash('sha1').update(entry.id).digest('hex');
  if (!seenEntries.has(hash)) {
    seenEntries.add(hash);
    newEntries.push(entry);  // 初見
  }
}
```

### なぜこれが重要か

- 気象庁が電文に一意な URL を割り当てている
- 重複排除が確実になる
- フィード内での位置・順序は関係ない

---

## 2. 時刻表現が混在している

### 落とし穴

```xml
<!-- フィード全体の更新時刻 -->
<feed updated="2026-07-29T10:00:00+09:00">
  <!-- 各エントリの更新時刻 -->
  <entry>
    <updated>2026-07-29T01:00:00Z</updated>
  </entry>
</feed>
```

- `feed` のタイムゾーン: `+09:00`（日本時間）
- `entry` のタイムゾーン: `Z`（UTC）

**文字列比較すると9時間ずれます。**

### 対処

**必ず Date に正規化してから比較**：

```javascript
const feedTime = new Date(feed.updated);  // +09:00 → UTC に自動変換
const entryTime = new Date(entry.updated);  // Z → UTC

if (entryTime > feedTime) {
  // 正しい比較
}
```

### なぜこれが起こるか

- 気象庁が Atom フィードの仕様に従っている
- feed 要素は ISO 8601 の `±HH:MM` を使う
- entry 要素は Z（ゼロタイムゾーン、UTC）を使う

---

## 3. ETag の保存は全エントリ Publish 完了後

### 落とし穴

```javascript
// ❌ 悪い例
const etag = response.headers.get('etag');
saveETag(etag);  // ← ここで保存

for (const entry of newEntries) {
  await publishToSlack(entry);  // Slack 通知中...
}
// 通知中に例外が起きると？
```

Slack 通知の途中で例外が起きたとき、すでに ETag を保存していたら、次回 304 が返り、**そのぶんのエントリを恒久的に取りこぼす。**

### 対処

**ETag は処理完了後に保存**：

```javascript
// ✅ 良い例
const newEntries = [];
for (const entry of entries) {
  if (isNew(entry)) {
    newEntries.push(entry);
  }
}

// 全ての Publish を完了
for (const entry of newEntries) {
  await publishToSlack(entry);
}

// 最後に ETag を保存（前の処理がすべて成功した）
saveETag(response.headers.get('etag'));
```

### なぜこれが重要か

- Pub/Sub は at-least-once なので、retry が起きる
- Slack 通知も失敗する可能性がある
- 全処理が成功してから状態を更新することが atomic な処理につながる

---

## 4. Head/InfoType に 発表・訂正・取消・遅延 が入る

### 落とし穴

電文 XML の `Head/InfoType` フィールド：

```xml
<Head>
  <Title>気象警報・注意報</Title>
  <InfoType>発表</InfoType>  <!-- または 訂正 / 取消 / 遅延 -->
  <DateTime>2026-07-29T10:00:00+09:00</DateTime>
</Head>
```

**`取消` は状態差分の「解除」として扱う必要があります。**

無視すると、解除済みの警報が出っぱなしに見えます。

### 対処

```javascript
const handleInfoType = (infoType, alerts) => {
  if (infoType === '取消') {
    return clearAllAlerts(alerts);  // 全解除
  }
  if (infoType === '訂正') {
    return updateAlerts(alerts);    // 既存を上書き
  }
  // '発表', '遅延' など
  return alerts;
};
```

### 重要なこと

- 同じ EventID で複数の InfoType が来る
- 時系列順（ReportDateTime）で処理する必要がある
- 古い「訂正」より新しい「発表」を優先

---

## 5. fast-xml-parser は要素が1件のとき配列にしない

### 落とし穴

```javascript
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser();
const doc = parser.parse(xmlString);

// 複数の Area がある場合
doc.feed.entry[0].content.Flood.Area  // Array ✅

// Area が1つだけの場合
doc.feed.entry[0].content.Flood.Area  // Object ❌（配列ではない！）

// 結果
for (const area of doc.feed.entry[0].content.Flood.Area) {  // 1つだけの場合エラー
  // 'Object' is not iterable
}
```

### 対処

**配列に正規化する関数を用意**：

```javascript
const normalize = (value) => {
  return Array.isArray(value) ? value : [value];
};

// 使用
const areas = normalize(doc.feed.entry[0].content.Flood.Area);
for (const area of areas) {
  // 1つだけの場合も複数の場合も動く
}
```

### なぜこれが起こるか

- XML では `<Area>` が1つだけの場合、単一要素扱い
- `<Area>...<Area>...<Area>` が3つあれば配列扱い
- fast-xml-parser が XML の構造をそのまま反映

---

## 6. フィードの保持は約10分

### 落とし穴

気象庁のフィード（`extra.xml`）は、直近少なくとも10分ぶんのエントリを掲載。

```
現在: 10:30
フィードに掲載: 10:20～10:30 のエントリ
フィードに掲載されない: 10:19 以前
```

5分の障害が起きた場合：

```
10:30 実行 → OK
10:35 実行 → エラー（ネットワーク障害）
10:40 実行 → エラー（継続）
10:45 実行 → OK（復旧）
```

10:35～10:45 の期間のエントリが **フィードから消えた可能性**がある。

### 対処

**複雑なリトライロジックは不要**。次回実行で自然に回復する前提でよい：

```javascript
// 10:45 のポーリングで、10:20～10:45 のエントリを取得
// 10:35～10:40 のぶんで取りこぼしがあれば、
// 20分以内の再ポーリングで復旧する

// → 障害から数分で復旧するシステムなら十分
```

### 長期フィードでの回収

数日にわたる障害の場合は、長期フィード（`*_l.xml`）で回収：

```javascript
// 通常
pollFeed('extra.xml');

// 長時間障害が起きた場合
pollFeed('extra_l.xml');  // 数日ぶんを取得
```

---

## 7. Scheduler の毎分起動と関数タイムアウトを重ねない

### 落とし穴

Google Cloud Functions を使う場合（GitHub Actions では不要）：

```yaml
# Cloud Scheduler
schedule: '*/1 * * * *'  # 毎分、正確に 00秒 に起動

# Cloud Functions
timeout: 120s  # 2分以上
```

このような設定だと：

```
10:00:00 実行開始 → 10:02:00 タイムアウト → 10:01:00 の実行開始できない！
```

**実行が重複する。**

### 対処

```yaml
# ✅ 正しい設定
# Cloud Functions
timeout: 55s

# Cloud Scheduler
schedule: '*/1 * * * *'

# 処理が 55秒で終わり、60秒以内に復帰
# 次の実行に余裕ができる
```

---

## 8. 状態差分の複雑性

### 落とし穴

前回状態と現在状態を比較するとき、順序が重要：

```
前回: []
現在: [警報A]
→ 新規発表（通知）

前回: [警報A]
現在: [警報A, 注意報B]
→ 新規発表 注意報B（通知）

前回: [警報A, 注意報B]
現在: [警報A]
→ 解除 注意報B（通知）
```

単純な差分では不足。**変更の "理由" も追跡**する必要がある。

### 対処

状態差分テスト用に実データを用意：

```
test/fixtures/
├── 気象警報・注意報_東京_1回目.xml
├── 気象警報・注意報_東京_2回目.xml  # 同じ府県の連続する2電文
└── 状態遷移テスト.test.js
```

---

## 9. ReportDateTime で電文の新旧判定

### 落とし穴

古い電文が遅れて届く場合がある：

```
最新: ReportDateTime = 2026-07-29T10:30:00+09:00
遅延: ReportDateTime = 2026-07-29T10:20:00+09:00（遅れて届いた）
```

最後に届いたからといって、**最新とは限らない。**

### 対処

```javascript
const applyStateUpdate = (previousState, newReport) => {
  const prevTime = new Date(previousReport.ReportDateTime);
  const newTime = new Date(newReport.ReportDateTime);

  if (newTime < prevTime) {
    // 古い電文 → 無視
    return previousState;
  }
  
  // 新しい方を適用
  return updateState(previousState, newReport);
};
```

---

## まとめ：テスト計画

上記の落とし穴を避けるため、以下をテスト：

| 落とし穴 | テスト | ファイル |
| --- | --- | --- |
| 1. Entry ID 重複排除 | エントリ重複テスト | test/unit/atom.test.js |
| 2. 時刻混在 | 時刻比較テスト | test/unit/diff.test.js |
| 3. ETag 保存タイミング | 状態遷移テスト | test/unit/state-manager.test.js |
| 4. InfoType 取消 | 取消電文テスト | test/fixtures/reports/ |
| 5. 配列化 | Atom パーステスト | test/unit/atom.test.js |
| 6. フィード保持 | 実装ドキュメント参照 | - |
| 7. タイムアウト | 設定チェック | .github/workflows/ |
| 8. 状態差分 | 連続電文テスト | test/fixtures/ |
| 9. ReportDateTime | 時系列テスト | test/unit/state-manager.test.js |

詳細は [docs/TESTING_STRATEGY.md](TESTING_STRATEGY.md) を参照。
