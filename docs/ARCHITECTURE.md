# システムアーキテクチャ

気象庁防災情報 REST API システムの全体構成です。

## 全体図

```
┌─────────────────────────────────────────────────────────────┐
│           気象庁防災情報XML（毎分更新）                      │
│    https://www.data.jma.go.jp/developer/xml/feed/          │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴──────────────┐
        ▼ 5分ごと（0,5,10...分）   ▼ 5分ごと（2,7,12...分）
┌──────────────────────┐  ┌──────────────────────┐
│ Poll JMA Feed        │  │ Notify to Slack      │
│                      │  │                      │
│ ポーラー処理         │  │ Slack通知処理        │
│ • フィード取得       │  │ • JSON取得           │
│ • 重複排除           │  │ • Slack webhook      │
│ • JSON生成           │  │                      │
│ • git push           │  │（ポーリング後2分）   │
└──────────────────────┘  └──────────────────────┘
        │
        ▼ commit
api/latest.json に保存
                     │
                     ▼ commit
┌─────────────────────────────────────────────────────────────┐
│        GitHub Repository (emergency-alert)                  │
│                                                              │
│  api/latest.json              # 最新データ                  │
│  api/archive/{YYYY-MM}/       # 過去データ                  │
│    {timestamp}.json                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼ REST API
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   ┌─────────────┐          ┌──────────────────┐
   │  Slack Bot  │          │ Other Systems    │
   │             │          │                  │
   │  実装例      │          │ Line, Mail, etc. │
   └─────────────┘          └──────────────────┘
```

## コンポーネント

### 1. ポーラー（scripts/github-poll.js）

**役割:** 気象庁のフィードから新着エントリを検出し JSON を生成

**処理:**
- 複数フィードの並列ポーリング
  - `extra.xml` - 気象警報・注意報
  - `eqvol.xml` - 地震・津波・火山
  - `other.xml` - 台風など
  - `regular.xml` - 定時情報
- 条件付きGET（ETag / If-Modified-Since）
- Atom フィードのパース（fast-xml-parser）
- エントリの重複排除（SHA-1 hash）

**出力:** JSON形式の新着エントリ

```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "feeds": [
    {
      "feed": "extra",
      "count": 5,
      "entries": [ ... ]
    }
  ],
  "summary": {
    "totalFeeds": 4,
    "totalNewEntries": 12
  }
}
```

### 2. JSON ストレージ（api/latest.json と api/archive/）

**役割:** REST API エンドポイントとしての機能

**ファイル配置:**
```
api/
├── latest.json              # 最新（毎回更新）
└── archive/
    ├── 2026-07/
    │   ├── 2026-07-29T10-00-00Z.json
    │   └── 2026-07-29T10-15-00Z.json
    └── 2026-08/
```

**REST API:**
```
https://raw.githubusercontent.com/{owner}/emergency-alert/main/api/latest.json
```

### 3. Slack Bot（notifier/slack/）

**役割:** JSON データから Slack メッセージを生成・送信

**処理:**
- API_URL から最新 JSON を fetch
- Block Kit フォーマットでメッセージを構築
- Slack Incoming Webhook で投稿

**メッセージ形式:**
- 新着エントリ数をサマリー表示
- フィード毎に件数表示

## データフロー

### 5分ごとの処理（スケジュール実行）

```
時刻     Poll JMA Feed          Notify to Slack
────────────────────────────────────────────────
0分      ├─ ポーリング         
         ├─ JSON 生成
         └─ git push
2分                             ├─ API 取得
                                ├─ Slack 投稿
                                └─ 完了
────────────────────────────────────────────────
5分      ├─ ポーリング
         ├─ JSON 生成
         └─ git push
7分                             ├─ API 取得
                                ├─ Slack 投稿
                                └─ 完了
```

### ポーリング処理（Poll JMA Feed）

```
1. GitHub Actions Workflow トリガー（schedule: */5 * * * *）
   ↓
2. scripts/github-poll.js 実行
   ├ 4フィード並列ポーリング
   ├ Atom パース
   ├ 重複排除（メモリ内、セッション単位）
   ├ JSON 生成
   └ api/latest.json に書き込み
   ↓
3. git commit & push
   ├ api/latest.json を add
   ├ コミット
   └ GitHub に push
```

### 通知処理（Notify to Slack）

```
1. GitHub Actions Workflow トリガー（schedule: 2分遅延）
   ↓
2. notifier/slack/index.js 実行
   ├ API_URL から JSON 取得
   ├ Slack メッセージ構築
   └ Slack Webhook 投稿
   
3. エラー時
   ├ Secret 設定がない → 警告のみ
   ├ Webhook URL 無効 → エラーログ出力
   └ Slack API エラー → リトライなし（次回実行で再試行）
```

## ライブラリと技術スタック

### コア ライブラリ

| モジュール | 役割 | 特徴 |
|----------|------|------|
| `src/lib/feed.js` | HTTP フィード取得 | 条件付きGET対応 |
| `src/lib/atom.js` | Atom フィードパース | fast-xml-parser使用 |
| `src/lib/json-builder.js` | JSON生成 | フィード別集計 |

### 依存ライブラリ

- `fast-xml-parser` - Atom XML パース
- Node.js 22 (ESM)
- Node.js 標準: `crypto` (SHA-1)、`fs/promises` (ファイル)

### 削減されたコンポーネント

次のコンポーネントはシステムから削除：
- Google Cloud Functions - GitHub Actions で置き換え
- Google Cloud Firestore - セッション内メモリで置き換え
- Google Cloud Scheduler - GitHub Actions schedule で置き換え
- Google Cloud Logging - console.log で置き換え

## パフォーマンス設計

| 項目 | 値 | 理由 |
|-----|-----|------|
| ポーリング間隔 | 5分 | GitHub Actions の最小単位、気象庁規約内 |
| ETag キャッシュ | HTTP ヘッダ | 不要な転送削減 |
| フィード並列度 | 4並列 | 気象庁への負荷回避 |
| ワークフロー timeout | 10分（デフォルト） | 十分な処理時間 |

## 信頼性設計

### 重複排除

- Entry ID の SHA-1 をキーとして、メモリ内で追跡
- 同一セッション内で重複を検出
- 次回ポーリングでも「見たことある」を検出するため ID をハッシュ化

### 再試行

- GitHub Actions の標準リトライ機構
- Slack 通知失敗は || true でスキップ（ポーリングは続行）

### 状態管理

- ステートレス設計（Firestore 不要）
- 毎回フィード全体を読み直す（JSON 更新）

## スケーラビリティ

### 高頻度フィードへの対応

- ETag キャッシュで不要な転送を削減
- フィード内の新着エントリ数は通常数十件
- 荒天時の「再発行」は同一エントリなので重複排除でカット

### アーカイブ成長

- 月別ディレクトリで整理
- 1ヶ月あたり ~2880ファイル（15分ごと）
- GitHub 容量は十分（アーカイブ自動削除も検討）

## セキュリティ

### 認証・認可

- GitHub Token は `GITHUB_TOKEN`（GitHub Actions自動供給）
- Slack Webhook URL は Secret として保管
- API（`api/latest.json`）は public read

### アクセス制御

- ワークフローは該当リポジトリのみ修正可能
- API 使用者の認証は実装例で対応
- 気象庁へのアクセスは User-Agent で識別

## 運用

### 監視

- GitHub Actions ワークフロー実行ログ確認
- エラー時は Actions タブで詳細を表示
- `api/latest.json` を curl で動作確認可能

### バックアップ

- GitHub リポジトリ全体が版管理
- `api/archive/` に月別保存
- git log で過去データを復元可能

### 保守

- 新規フィード追加時は `scripts/github-poll.js` の FEEDS 配列を修正
- Slack 通知ロジック修正は `notifier/slack/` で実装
- テスト: `npm test` で回帰確認
