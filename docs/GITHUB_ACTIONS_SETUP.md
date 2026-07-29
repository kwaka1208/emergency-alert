# GitHub Actions セットアップガイド

このプロジェクトは **GitHub Actions** を使用して、[jma-api](https://github.com/kwaka1208/jma-api) が提供する防災情報 JSON を定期的に監視し、Slack に通知します。

## セットアップ手順

### 1. このリポジトリを GitHub にプッシュ

```bash
git remote add origin https://github.com/your-username/emergency-alert.git
git push -u origin main
```

### 2. Slack webhook URL を取得

[Slack で Incoming Webhook を作成](https://api.slack.com/messaging/webhooks) し、webhook URL を取得してください。

詳細は [notifier/slack/README.md](../notifier/slack/README.md) を参照。

### 3. GitHub Actions Secret を設定

リポジトリの **Settings** → **Secrets and variables** → **Actions** で `SLACK_WEBHOOK_URL` を追加：

```
名前: SLACK_WEBHOOK_URL
値: [手順 2 で取得した webhook URL をペースト]
```

### 4. ワークフローが有効か確認

リポジトリの **Actions** タブを開き、以下のワークフローが表示されていることを確認：

- `Notify to Slack` — Slack 通知実行

### 5. 手動で 1 回実行してテスト

```
Actions → Notify to Slack → Run workflow → Run workflow
```

実行完了後、Slack に通知が送信されれば成功です。

## ワークフロー動作

### スケジュール

- **毎 5 分実行**: `notify-slack.yml`
- **jma-api の api/latest.json を参照**: 
  - `https://raw.githubusercontent.com/kwaka1208/jma-api/main/api/latest.json`
- **未送信の即時通知（immediate）をフィルタリング**
- **Slack webhook に POST**
- **api/sent-notifs.json に送信済み記録を保存**

### ログ確認

```
Actions → Notify to Slack → 最新の実行 → notify
```

成功時のログ例：

```
🚀 Fetching JMA alert data...
✅ Fetched data with 3 new entries
📋 Immediate alerts: 2 total, 1 unsent
📤 Sending to Slack...
✅ Slack notification sent successfully (1 immediate)
```

## トラブルシューティング

### Slack に通知が届かない

1. **Secret が正しく設定されているか確認**
   - リポジトリの Settings → Secrets を確認
   - `SLACK_WEBHOOK_URL` が存在するか確認

2. **ワークフローのログを確認**
   - Actions タブで実行ログを確認
   - エラーメッセージを確認

3. **webhook URL を再発行**
   - Slack Admin Console で新しい webhook を作成
   - Secret を更新

### API データが取得できない

- jma-api リポジトリが正常に動作しているか確認
- jma-api の api/latest.json が更新されているか確認

```bash
curl https://raw.githubusercontent.com/kwaka1208/jma-api/main/api/latest.json | jq '.timestamp'
```

### テストモード

環境変数を追加して、Slack に送信せずにログ出力のみにできます：

ワークフロー内で以下の環境変数を設定：

```yaml
env:
  SLACK_NOTIFY_TEST: 'true'
```

ログに通知内容が表示されれば、本番実行可能です。

## カスタマイズ

### 実行スケジュールを変更

`.github/workflows/notify-slack.yml` の `schedule` セクションを編集：

```yaml
schedule:
  - cron: '*/5 * * * *'  # 毎5分（現在の設定）
  # 例: 毎15分
  # - cron: '*/15 * * * *'
  # 例: 毎時00分
  # - cron: '0 * * * *'
```

詳細: [Cron syntax](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)

### API URL をカスタマイズ

`.github/workflows/notify-slack.yml` で `API_URL` を指定：

```yaml
env:
  API_URL: https://raw.githubusercontent.com/kwaka1208/jma-api/main/api/latest.json
```

## サポート

問題が発生した場合：

1. ワークフローのログを確認（Actions タブ）
2. [notifier/slack/README.md](../notifier/slack/README.md) を参照
3. GitHub Issues で報告
