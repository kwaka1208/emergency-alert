# CLAUDE.md

気象庁防災情報を Slack に通知するシステムのリファレンス実装です。

## 責務の分離

このシステムは **通知ロジック専用** です。データの取得・整理は [jma-api](https://github.com/kwaka1208/jma-api) が担当します。

- **jma-api**: フィード取得、XML パース、状態差分判定、深刻度分類、JSON 生成
- **emergency-alert**: JSON API 参照、送信済み判定、Slack webhook 送信

## アーキテクチャ

```
jma-api が毎分実行
    ↓
api/latest.json を更新
    ↓
emergency-alert が 5 分ごとに実行
    ↓
api/latest.json を参照
    ↓
未送信エントリを抽出
    ↓
Slack webhook に POST
    ↓
送信済み記録を api/sent-notifs.json に保存
```

## 設計方針

### 1. 状態管理

通知済み ID を `api/sent-notifs.json`（GitHub リポジトリ内）に記録することで、重複送信を防ぐ。

```json
[
  {
    "reportId": "http://example.com/xml/20260729100000_0.xml",
    "reportTitle": "気象警報・注意報",
    "eventID": "e12345",
    "sentAt": "2026-07-29T10:00:00.000Z"
  }
]
```

### 2. 通知ロジック

- jma-api が `immediate` / `digest` / `record` に分類した JSON を参照
- 即時通知（`immediate`）のうち、未送信のもののみ Slack に送信
- 集約通知（`digest`）は必要に応じてまとめて送信

### 3. テストモード

環境変数 `SLACK_NOTIFY_TEST=true` 時は、Slack に送信せずログ出力のみ。開発時の動作検証に使用。

## 実装上の注意

### api/sent-notifs.json の管理

- 手動で削除・編集しない。GitHub Actions が更新する
- 重複送信を防ぐため、毎回実行時に読み込む
- 古い記録は定期的に削除する（運用ポリシーで決定）

### Slack webhook URL

- `.env` または GitHub Actions Secret で設定
- 絶対にリポジトリにコミットしない
- 必要に応じて新しい webhook を発行して置き換える

### エラーハンドリング

- jma-api に接続できない場合は実行を中止（Slack に送信しない）
- Slack API エラーは継続的にログ出力し、次回実行で再試行

## ローカル開発

### テスト実行

```bash
npm test
```

### 通知スクリプト実行

```bash
# テストモード（Slack に送信しない）
SLACK_NOTIFY_TEST=true node notifier/slack/index.js

# 実運用（SLACK_WEBHOOK_URL 必須）
node notifier/slack/index.js
```

### 手動でのテストデータ投入

```bash
# api/latest.json をダウンロードしてローカルに配置
curl https://raw.githubusercontent.com/kwaka1208/jma-api/main/api/latest.json > api/latest.json

# notifier を実行
SLACK_NOTIFY_TEST=true node notifier/slack/index.js
```

## トラブルシューティング

**通知が届かない**
- GitHub Actions のログを確認（Actions タブ）
- `SLACK_WEBHOOK_URL` が正しく設定されているか確認
- `SLACK_NOTIFY_TEST=true` で試す

**重複送信される**
- `api/sent-notifs.json` の内容を確認
- ファイルが壊れていないか確認（JSON パース可能か）

**エラーで停止する**
- jma-api の API が応答しているか確認
- GitHub Actions の実行ログを確認

## 未実装・将来の拡張

- LINE Messaging API への通知
- メール通知
- Discord 通知
- 深刻度ごとの通知先分岐
- 時間帯別のサイレント設定
