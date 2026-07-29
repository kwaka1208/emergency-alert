# JMA Alert Notifier

気象庁防災情報（[jma-api](https://github.com/kwaka1208/jma-api) が提供する JSON API）を Slack に自動通知するシステムです。

## 概要

### 目的

気象庁の防災情報を監視して、重要な警報・警告・地震情報などを Slack チャネルに通知するリファレンス実装です。

- **データ取得と整理**: [jma-api](https://github.com/kwaka1208/jma-api) が担当
- **通知ロジック**: このリポジトリが担当（Slack webhook 経由）

### アーキテクチャ

```
[jma-api リポジトリ]
毎分フィード取得 → XML パース → 状態差分 → 深刻度分類
    ↓
api/latest.json
    ↓
REST API (raw.githubusercontent.com/kwaka1208/jma-api)
    ↓
[emergency-alert リポジトリ] Slack 通知
JSON 参照 → 未送信フィルタ → Slack webhook
```

## セットアップ

### 1. このリポジトリをクローン

```bash
git clone https://github.com/your-username/emergency-alert.git
cd emergency-alert
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. 環境変数を設定

```bash
cp .env.example .env
# .env を編集して SLACK_WEBHOOK_URL を設定
```

Slack webhook の取得方法は [notifier/slack/README.md](notifier/slack/README.md) を参照してください。

### 4. GitHub Actions Secret を設定

GitHub リポジトリの **Settings** → **Secrets and variables** → **Actions** で以下を設定：

- `SLACK_WEBHOOK_URL`: Slack webhook URL

### 5. テスト

```bash
npm test
```

## 動作確認

### ローカルでのテスト実行

```bash
# テストモードで実行（Slack には送信しない）
SLACK_NOTIFY_TEST=true node notifier/slack/index.js
```

### GitHub Actions の自動実行

ワークフロー `.github/workflows/notify-slack.yml` は以下のスケジュールで実行されます：

- **毎5分**: Slack に通知（jma-api の latest.json を参照）
- 送信済み通知は `api/sent-notifs.json` で管理

## API 仕様

### データソース

```
https://raw.githubusercontent.com/kwaka1208/jma-api/main/api/latest.json
```

jma-api が提供する JSON の仕様は [jma-api README](https://github.com/kwaka1208/jma-api/blob/main/README.md) を参照してください。

## ディレクトリ構成

```
notifier/
└── slack/                 # Slack 通知アダプタ
    ├── index.js          # メイン処理
    ├── messages.js       # Slack メッセージ整形
    └── README.md         # セットアップ手順

.github/
└── workflows/
    └── notify-slack.yml  # GitHub Actions ワークフロー

api/
└── sent-notifs.json      # 送信済み通知の履歴（自動生成）

test/
└── ...                   # テスト（将来追加予定）
```

## ライセンス

気象庁のデータを利用しているため、以下に従ってください：

- [気象庁データ利用規約](https://www.jma.go.jp/jma/kishou/minkan/gaiyou.html)
- [防災情報XML技術資料](https://xml.kishou.go.jp/tec_material.html)

本プログラムのコードは MIT ライセンスで利用可能です（気象庁データ部分を除く）。

## サポート

問題が発生した場合：

1. [notifier/slack/README.md](notifier/slack/README.md) でセットアップを確認
2. リポジトリの **Actions** タブでワークフロー実行ログを確認
3. `npm test` で動作検証
4. GitHub Issues で報告

---

**気象庁防災情報を、より使いやすく、より正確に。**
