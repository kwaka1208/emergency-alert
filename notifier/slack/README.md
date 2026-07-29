# Slack Bot セットアップガイド

防災情報を Slack に自動通知するボットです。

## セットアップ手順

### ステップ1: Slack App を作成

1. [Slack App Directory](https://api.slack.com/apps) を開く
2. **Create New App** → **From scratch** をクリック
3. アプリ名: `JMA Alert Bot` （任意）
4. ワークスペースを選択

### ステップ2: Incoming Webhooks を設定

1. 左メニュー → **Incoming Webhooks**
2. **Activate Incoming Webhooks** を ON
3. **Add New Webhook to Workspace** をクリック
4. 通知先チャンネルを選択 → **Allow**
5. **Webhook URL** をコピー

### ステップ3: GitHub Secret に登録

このリポジトリの Settings → Secrets and variables → Actions

**New repository secret** で以下を追加：

```
SLACK_WEBHOOK_URL = https://hooks.slack.com/services/...
```

### ステップ4: ワークフローを実行

リポジトリの **Actions** → **Slack Notification** → **Run workflow**

---

## 動作仕様

### 実行間隔

- **デフォルト**: 30分ごと
- **変更方法**: `.github/workflows/slack-notify.yml` の `cron` を編集

### 通知内容

| レベル | 説明 | 通知 |
|--------|------|------|
| **即時** | 特別警報、津波警報など | 個別にピン留め |
| **集約** | 警報クラス | まとめて表示 |

### メッセージ例

```
🚨 防災情報アラート

🚨 即時通知 (2件)
• 津波警報
  対象地域: 北海道, 青森県
• 特別警報
  対象地域: 大阪府

⚠️ 集約通知 (5件)
• 暴風警報
• 波浪警報
（他 3 件）
```

---

## 使用例

### 手動実行

```
Actions → Slack Notification → Run workflow → Run workflow
```

### 自動実行確認

```
Actions → Slack Notification → 最新の実行 → notify
```

ログを確認して、通知が送信されたか確認できます。

---

## トラブルシューティング

### Slack に通知が届かない

1. **Webhook URL が正しいか確認**
   - Settings → Secrets で SLACK_WEBHOOK_URL を確認
   - Slack App の Incoming Webhooks で URL を確認

2. **チャンネルが削除されていないか確認**
   - Webhook を作成したチャンネルが存在するか確認
   - 削除されている場合は新しい Webhook を作成

3. **ワークフローが実行されているか確認**
   - Actions タブでワークフロー実行履歴を確認
   - 失敗している場合はログを確認

### エラーが出ている

ワークフローのログを確認：

```
Actions → Slack Notification → 最新の実行 → notify
```

エラーメッセージから原因を特定できます。

---

## カスタマイズ

### 通知チャンネルを変更

新しい Webhook URL を作成：

1. Slack App → Incoming Webhooks
2. **Add New Webhook to Workspace**
3. 別のチャンネルを選択
4. GitHub Secret を更新

### 実行間隔を変更

`.github/workflows/slack-notify.yml` の `cron` を編集：

```yaml
schedule:
  - cron: '0 * * * *'  # 1時間ごと
  # または
  - cron: '0 9,12,15,18,21 * * *'  # 特定の時間のみ
```

### メッセージをカスタマイズ

`notifier/slack/messages.js` を編集してメッセージフォーマットを変更できます。

---

**Slack で防災情報をリアルタイムに受け取れます！** 🚀
