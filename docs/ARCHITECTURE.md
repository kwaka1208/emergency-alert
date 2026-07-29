# システムアーキテクチャ

気象庁防災情報APIシステムの全体構成です。

## 全体図

```
┌─────────────────────────────────────────────────────────────┐
│           気象庁防災情報XML（毎分更新）                      │
│    https://www.data.jma.go.jp/developer/xml/feed/          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│        JMA Alert Core System (emergency-alert)              │
│                  Google Cloud                                │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Poller     │    │  Processor   │    │  API Builder │  │
│  │              │    │              │    │              │  │
│  │ フィード取得  │──▶│ 電文パース    │──▶│ JSON生成     │  │
│  │ 重複排除     │    │ 状態差分判定  │    │ 深刻度分類   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                    │                    │         │
│         └────────────────────┴────────────────────┘         │
│                              │                              │
│                     Firestore（状態管理）                    │
│                              │                              │
│                     Cloud Logging（ログ）                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│        jma-alert-api (GitHub Repository)                    │
│                                                              │
│  latest.json              ◀─ Cloud Functions pushes         │
│  archive/{YYYY-MM}/       ◀─ every minute                   │
│    {timestamp}.json                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼ REST API
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   ┌─────────────┐          ┌──────────────────┐
   │  Slack Bot  │          │ Other Systems    │
   │             │          │                  │
   │ 通知実装例   │          │ Line, Mail, etc. │
   └─────────────┘          └──────────────────┘
```

## コンポーネント

### 1. Poller（src/poller/index.js）

**役割:** 気象庁のフィードから新着エントリを検出

**処理:**
- 条件付きGET（ETag / If-Modified-Since）
- Atom フィードのパース
- エントリの重複排除（SHA-1 hash）
- 新着のみを抽出

**出力:** JSON形式の新着エントリリスト

**制約:**
- 電文本体を取得しない（poller は軽量に）
- フィードのみ取得
- 同時接続を制限

### 2. Processor（src/processor/index.js）

**役割:** 電文XMLから変化を検知

**処理:**
- 電文本体取得
- XML パース
- 府県予報区ごとの警報・注意報状態を管理
- 前回状態との差分判定
- 古い電文による状態巻き戻し防止（ReportDateTime比較）

**出力:** 変化があったもののみ

### 3. API Builder（src/lib/api-builder.js）

**役割:** 最終的なAPI形式でJSON生成

**処理:**
- EventID による続報束ね
- 深刻度分類（immediate / digest / record）
- メタデータ集約

**出力:** REST API用JSON

```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "immediate": [ ... ],     // 津波、特別警報など
  "digest": [ ... ],        // 警報クラス（集約）
  "record": [ ... ],        // 注意報、予報（記録）
  "summary": { ... }
}
```

### 4. GitHub API（src/lib/github.js）

**役割:** JSONをGitHubリポジトリに公開

**ファイル配置:**
```
jma-alert-api/
├── latest.json              # 最新（毎分更新）
└── archive/
    ├── 2026-07/
    │   └── 2026-07-29T10-00-00Z.json
    └── 2026-08/
```

**REST API:**
```
https://raw.githubusercontent.com/{owner}/jma-alert-api/main/latest.json
```

### 5. Firestore（状態管理）

**Collections:**

| Collection | 用途 | TTL |
|-----------|------|-----|
| `jmaFeedState` | フィード取得状態（ETag） | なし |
| `jmaSeenEntries` | エントリ重複排除 | 48時間 |
| `jmaReportState` | 府県ごとの警報状態 | なし |

### 6. Cloud Logging（監視）

**出力形式:** JSON（GCP Cloud Logging互換）

**ログタイプ:**
- `info`: フィード取得件数、変更検知
- `warn`: GitHub push失敗など
- `error`: エラー詳細

## データフロー

### 毎分の処理フロー

```
1. Cloud Scheduler (毎分実行)
   ↓
2. Cloud Functions HTTP トリガー
   ↓
3. pollFeeds() - 4フィード並列取得
   ├ フィード URL に条件付きGET
   ├ Atom パース
   ├ 重複排除（Firestore）
   └ 新着エントリ抽出
   ↓
4. API JSON生成
   ├ 新着エントリ → JSON
   ├ 情報名から深刻度判定
   └ EventID で続報束ね
   ↓
5. GitHub push
   ├ latest.json 更新
   └ archive/{YYYYMM}/{timestamp}.json 保存
   ↓
6. Cloud Logging 出力
   └ 統計情報・エラー
```

## パフォーマンス設計

| 項目 | 値 | 理由 |
|-----|-----|------|
| Cloud Functions timeout | 55秒 | 毎分起動と重ならない |
| max-instances | 3 | 気象庁への同時接続制限 |
| メモリ | 512MB | フィード解析に必要 |
| ポーリング間隔 | 1分 | 気象庁の最大アクセス頻度 |
| ETag キャッシュ | 有効 | 不要な転送削減 |
| Firestore TTL | 48時間 | 重複排除の猶予 |

## 信頼性設計

### 重複排除

- Entry ID の SHA-1 をキーとして Firestore に記録
- ALREADY_EXISTS エラーで既処理判定
- 48時間のTTLで古い記録を自動削除

### 状態巻き戻し防止

- ReportDateTime で電文の新旧判定
- 古い電文による状態上書きを防止

### 再試行

- Cloud Scheduler は自動リトライ（1回）
- デッドライン 60秒
- Pub/Sub は at-least-once 配信

### 変化検知

- 前回状態と比較
- 変化がなければ通知しない
- イベント型ではなく差分型（重複防止）

## スケーラビリティ

### 荒天時の対応

- Entry 数が増加 → Firestore は自動スケール
- 同時接続制限で気象庁への負荷回避
- Pub/Sub（将来実装時）で非同期化可能

### データ成長

- Archive は月別ディレクトリで管理
- 古いデータは定期削除（GitHub Actions）
- Firestore TTL で不要なドキュメント自動削除

## セキュリティ

### 認証・認可

- Cloud Functions は OIDC トークン認証
- GitHub Token は Secret Manager で管理
- サービスアカウントに最小権限付与

### アクセス制御

- Cloud Functions は内部のみ（Scheduler から）
- GitHub リポジトリは public
- API 使用者の認証は実装例（リファレンス）で対応

## 運用

### 監視

- Cloud Logging で構造化ログ出力
- 連続エラーで自動アラート（要設定）
- 304率、新着件数、エラーレートをメトリクス化

### バックアップ

- Firestore は定期自動バックアップ
- GitHub リポジトリはレプリケーション

### ロールバック

- Cloud Functions のバージョン管理
- 前のバージョンへの即座のロールバック可能
