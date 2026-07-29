# JMA Alert Core System

気象庁防災情報XML（PULL型）を毎分ポーリングし、**日本国内全域**の防災情報を整理した JSON を REST API で公開するシステムです。

## 概要

### 目的

気象警報・注意報・地震情報・津波情報など、気象庁の防災情報XMLから以下を実現：

1. **全国全件を取り込み** — 逃さない
2. **通知は厳しく絞る** — 適切な情報のみ配信
3. **状態差分を検知** — 繰り返し通知を避ける
4. **REST API で提供** — 利用者が自由に統合可能

### アーキテクチャ

```
気象庁XML（毎分更新）
    ↓
[poller] フィード取得・重複排除
    ↓
[processor] 電文パース・状態差分
    ↓
[api-builder] 深刻度分類・JSON生成
    ↓
GitHub jma-alert-api リポジトリ
    ↓
REST API (raw.githubusercontent.com)
```

詳細: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 技術スタック

- **ランタイム**: Node.js 22 (ESM)
- **クラウド**: Google Cloud Platform (Cloud Functions gen2, Firestore, Cloud Scheduler)
- **テスト**: Node.js 標準 test モジュール
- **ライブラリ**: `fast-xml-parser`, `@google-cloud/*`

## セットアップ

### 1. 依存関係インストール

```bash
npm install
```

### 2. テスト実行

```bash
npm test
# 55個のテストが実行されます
```

### 3. jma-alert-api リポジトリの準備

[docs/SETUP_API_REPO.md](docs/SETUP_API_REPO.md) を参照して、GitHub に `jma-alert-api` リポジトリを作成してください。

### 4. Google Cloud にデプロイ

```bash
# 自動デプロイスクリプト
./deployment/deploy.sh <PROJECT_ID>

# または詳細な手順は DEPLOY.md を参照
```

[DEPLOY.md](DEPLOY.md) - 完全なデプロイガイド

## API 仕様

### エンドポイント

```
https://raw.githubusercontent.com/{owner}/jma-alert-api/main/latest.json
```

### レスポンス形式

```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "immediate": [
    {
      "reportId": "...",
      "reportTitle": "津波警報",
      "infoType": "発表",
      "eventID": "eq-2026-07-29-001",
      "serialCount": 1,
      "changes": {
        "total": 5,
        "added": 5,
        "upgraded": 0,
        "downgraded": 0,
        "removed": 0
      },
      "areas": ["500000", "500010", ...]
    }
  ],
  "digest": [ ... ],     // 警報クラス（集約）
  "record": [ ... ],     // 注意報・予報（記録）
  "summary": {
    "total": 23,
    "byLevel": {
      "immediate": 2,
      "digest": 8,
      "record": 13
    }
  }
}
```

### 深刻度レベル

| レベル | 対象 | 用途 |
|--------|------|------|
| **immediate** | 特別警報、津波警報、噴火警報など | 即座に個別通知 |
| **digest** | 暴風・波浪・大雪の警報クラス | 5～15分ごとに集約 |
| **record** | 注意報、予報情報など | 記録のみ（通知なし） |

## 使用例

### Node.js

```javascript
const response = await fetch(
  'https://raw.githubusercontent.com/your-username/jma-alert-api/main/latest.json'
);
const data = await response.json();

// 即時通知対象
if (data.immediate.length > 0) {
  console.log('🚨 Immediate alerts:', data.immediate);
}

// 集約通知対象
if (data.digest.length > 0) {
  console.log('⚠️ Digest alerts:', data.digest);
}
```

### Python

```python
import requests

url = 'https://raw.githubusercontent.com/your-username/jma-alert-api/main/latest.json'
data = requests.get(url).json()

for alert in data['immediate']:
    print(f"Alert: {alert['reportTitle']}")
```

### cURL

```bash
curl https://raw.githubusercontent.com/your-username/jma-alert-api/main/latest.json | jq .
```

## 設定

### 環境変数

| 変数 | 説明 | 既定値 |
|-----|------|--------|
| `GOOGLE_CLOUD_PROJECT` | Google Cloud プロジェクトID | 必須 |
| `USER_AGENT` | フィード取得時の User-Agent | `jma-alert-bot/1.0 ...` |
| `PUSH_TO_GITHUB` | GitHub への自動push | `true` |
| `GITHUB_OWNER` | GitHub ユーザー/組織名 | 環境変数から取得 |
| `GITHUB_REPO` | jma-alert-api リポジトリ | 環境変数から取得 |
| `TITLE_ALLOW` | 対象情報名（カンマ区切り） | Phase 0実測のトップ8種 |
| `TARGET_AREAS` | 対象地域（カンマ区切り） | 空（全国） |

### 深刻度分類の更新

`src/config/severity.json` を編集して、情報名→深刻度のマッピングを変更できます。

## 運用

### モニタリング

```bash
# ログ確認
gcloud functions logs read pollJmaFeed --gen2 --limit 50

# メトリクス確認
gcloud logging read "resource.type=cloud_function" --format json
```

### ポーリング実行テスト

```bash
gcloud scheduler jobs run poll-jma-feed --location asia-northeast1
```

### トラブルシューティング

- **Cloud Functions がタイムアウト**: 環境を見直し（メモリ、max-instances）
- **GitHub push失敗**: Secret Manager トークン確認
- **Firestore quota超過**: TTL ポリシー確認

詳細は [DEPLOY.md](DEPLOY.md) を参照。

## 開発

### ローカル実行

```bash
# テスト実行
npm test

# 特定のテストのみ
npm test -- --grep "poller"
```

### 新しい機能の追加

1. テストを先に書く（TDD）
2. 実装
3. `npm test` で確認
4. コミット

### ディレクトリ構成

```
src/
├── lib/                    # ライブラリ関数
│   ├── atom.js            # Atom フィードパース（pure）
│   ├── severity.js        # 深刻度判定（pure）
│   ├── diff.js            # 状態差分（pure）
│   ├── report.js          # 電文パース
│   ├── state-manager.js   # 状態管理（pure）
│   ├── api-builder.js     # JSON生成
│   ├── feed.js            # フィード取得
│   ├── store.js           # Firestore操作
│   ├── github.js          # GitHub API
│   └── logging.js         # 構造化ログ
├── poller/
│   ├── index.js          # ポーラーメインロジック
│   └── http.js           # Cloud Functions エントリ
└── config/
    └── severity.json     # 情報名→深刻度マッピング

test/
├── fixtures/             # テストデータ（実データ）
│   ├── *_l.xml          # Phase 0 フィード集計
│   └── reports/         # 気象電文サンプル
└── unit/                 # 単体テスト
```

## ライセンス

気象庁のデータを利用しているため、以下に従ってください：

- [気象庁データ利用規約](https://www.jma.go.jp/jma/kishou/minkan/gaiyou.html)
- [防災情報XML技術資料](https://xml.kishou.go.jp/tec_material.html)

本プログラムのコードは MIT ライセンスで利用可能です（気象庁データ部分を除く）。

## 次のステップ

### 通知リファレンス実装

Slack/LINE など各種サービスへの通知例を別リポジトリで公開予定：

- `jma-alert-notification` (コミングスーン)
  - Slack Bot の実装例
  - LINE Messaging API の実装例
  - ローカルで動作確認可能な例

### カスタマイズ

- 対象地域の限定（TARGET_AREAS）
- 深刻度の調整（severity.json）
- 通知ロジックの実装（別リポジトリ）

## サポート

問題が発生した場合：

1. [DEPLOY.md](DEPLOY.md) のトラブルシューティング確認
2. Cloud Logging でエラーを確認
3. テストで該当コンポーネント検証

---

**気象庁防災情報を、より使いやすく、より正確に。**
