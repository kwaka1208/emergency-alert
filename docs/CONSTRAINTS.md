# 制約と規約

このシステムが従うべき制約と規約です。**交渉の余地のない要件です。**

## 気象庁サーバーへのアクセス制限

### ハードリミット

**1日10GB以上のダウンロードが検知されるとIPアドレスが遮断される。**

全国運用でも電文の総量は1日数百MB程度に収まる見込みですが、以下は厳密に守る必要があります。

### 要件1: 条件付きGET（If-None-Match / If-Modified-Since）

毎回フルダウンロードするのではなく、HTTP ヘッダで変更を確認：

```javascript
// ETag を保存し、次回リクエストに付与
const headers = {
  'If-None-Match': previousETag,
  'If-Modified-Since': previousLastModified
};

// 304 Not Modified なら、データ取得をスキップ
if (response.status === 304) {
  return cached;  // キャッシュを使用
}
```

**効果**: 変化がない場合、ネットワーク転送ほぼ0

### 要件2: 一度取得した電文URLは二度取得しない

フィードから新着 entry を検出したら、その電文 URL から本体を取りに行います。**ここで重複排除を通す**：

```
フィード取得（毎分、几帳面）
  ↓
新着 entry 検出（entry.id がまだ見たことない）
  ↓
その電文 XML を1回だけ取得
  ↓
次回以降、同じ URL は取得しない
```

同一 URL を複数回取得すると、気象庁への意図しない負荷になります。

### 要件3: ポーリング間隔は最短1分

- 気象庁フィードの更新間隔が毎分
- それより短くしても新しいデータがない
- サーバー負荷を考慮

**現在**: GitHub Actions は 5分ごと（実用性とのバランス）
**最高速**: 1分は技術的に可能だが、GitHub Actions では最小5分

### 要件4: 電文取得の同時接続数は5程度に制限

並列化しすぎると気象庁側に「殺到」に見える：

```javascript
// ❌ 悪い例
await Promise.all([
  fetchFeed('extra'),
  fetchFeed('eqvol'),
  fetchFeed('other'),
  fetchFeed('regular')
].map(f => f.then(downloadReportXML)))  // 無制限に並列化

// ✅ 良い例
const queue = pLimit(5);  // 最大5並列
await Promise.all([...].map(entry => queue(() => downloadReportXML(entry))))
```

### 要件5: --max-instances を設定し暴走時の被害を抑える

Google Cloud Functions 利用時：

```yaml
# Cloud Functions コンフィグ
maxInstances: 3
```

GitHub Actions では instance 管理不要だが、並列実行を制限する。

### 要件6: 開発・テスト中に実サーバーへ繰り返しアクセスしない

フィクスチャを使用：

```bash
# ✅ 良い例
npm test  # test/fixtures/ から JSON をロード

# ❌ 悪い例
curl https://www.data.jma.go.jp/developer/xml/feed/extra.xml  # テスト時に毎回叩く
```

気象庁へのアクセスは本番運用のみ。

---

## 学習データ上の情報名を信用しない

### 背景

2026年5月29日に防災気象情報の体系が大きく変わった：

**旧体系**（2026年5月28日まで）
- 大雨警報・大雨注意報
- 土砂災害警戒情報

**新体系**（2026年5月29日以降）
- レベル3大雨警報
- レベル4土砂災害危険警報
- レベル5土砂災害特別警報
- 集約通報
- 気象防災速報

一方、暴風・波浪・大雪などは従来名のまま。

### 影響

インターネット上のサンプルコードおよびモデルの記憶は、旧体系のものが大半である。

### 対処

**情報名・電文コードをリテラルで書く場合は、必ず実物のフィード／技術資料で裏を取ること。**

```javascript
// ❌ 危険
const isWarning = title.includes('警報');  // 旧体系に基づく

// ✅ 正しい
// 気象庁の最新 XML から実際のタイトルを確認してから書く
const isHighAlert = title.includes('レベル4') || title.includes('レベル5');
```

### 参照先

- [情報の取得方法](https://xml.kishou.go.jp/xmlpull.html)
- [技術資料](https://xml.kishou.go.jp/tec_material.html)
- [電文一覧](https://xml.kishou.go.jp/xmllist.pdf)
- [新体系の説明](https://www.jma.go.jp/jma/kishou/know/bosai/keiho-update2026/)

---

## フィード保持期間は約10分

フィード（例：`extra.xml`）は、直近少なくとも10分ぶんのエントリを掲載しています。

それより古いエントリは削除される可能性があります。

### 影響

- ポーリング障害が数分続いた場合、取りこぼすリスク
- ただし毎分ポーリングなら約10回ぶんの猶次がある
- 複雑なリトライロジックは不要（次回実行で自然に回復する前提）

### 長期フィード（`*_l.xml`）

毎時更新、数日ぶんの全入電を掲載。用途：
- (a) 流量の実測
- (b) 障害復旧時の取りこぼし回収

通常運転では叩かない（アクセス数削減）。

---

## GitHub Actions のスケジュール制限

### Cron の最小単位は5分

```yaml
on:
  schedule:
    - cron: '*/5 * * * *'   # ✅ OK（5分ごと）
    - cron: '*/1 * * * *'   # ❌ GitHub が受け付けない
```

GitHub Actions は cron `*/1` をサポートしていません。最小単位は5分です。

### Scheduler デッドラインとの重複回避

現在 5分ごとですが、将来 Google Cloud Functions へ移行する場合：

- **Scheduler**: 毎分起動
- **Functions**: 55秒 timeout、attempt-deadline 60秒

Scheduler の起動と Functions のタイムアウトが重ならないよう調整：

```yaml
# Cloud Functions の場合
timeout: 55s
attemptDeadline: 60s

# Scheduler
- schedule: '*/1 * * * *'  # 毎分、60秒以上のギャップなし
```

---

## HTTP User-Agent の設定

気象庁サーバーは User-Agent を記録・分析しています。

```javascript
const userAgent = 'jma-alert-bot/1.0 (+https://example.com/contact)';

// すべての fetch に付与
const response = await fetch(url, {
  headers: { 'User-Agent': userAgent }
});
```

識別可能にしておくと、問題発生時に対応しやすくなります。

---

## まとめ

| 制約 | 理由 | 遵守方法 |
| --- | --- | --- |
| 1日10GB上限 | 気象庁サーバー保護 | 条件付けGET、重複排除、同時接続制限 |
| 電文URL二重取得禁止 | サーバー負荷 | 重複排除を通す |
| ポーリング最短1分 | フィード更新頻度 | GitHub Actions では5分 |
| 同時接続5程度 | サーバー負荷制限 | pLimit 等で制御 |
| 情報名は実データ確認 | 体系の変更履歴 | 2026年5月29日の体系変更を把握 |
| フィード保持10分 | データ可用性 | 定期的にポーリング |

これらを守ることで、**気象庁と共存でき、長期運用が可能**になります。
