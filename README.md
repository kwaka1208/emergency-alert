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
    ↓ GitHub Actions（5分ごと）
[ポーラー] フィード取得・重複排除・JSON生成
    ↓
api/latest.json（このリポジトリ内）
    ↓
REST API (raw.githubusercontent.com)
    ↓
【Slack Bot】（自動通知）
【その他のカスタム通知】
```

詳細: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 技術スタック

- **ランタイム**: Node.js 22 (ESM)
- **自動化**: GitHub Actions（15分ごと）
- **テスト**: Node.js 標準 test モジュール
- **ライブラリ**: `fast-xml-parser`

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

### 3. GitHub にリポジトリをプッシュ

```bash
git remote add origin https://github.com/your-username/emergency-alert.git
git push -u origin main
```

### 4. GitHub Actions を実行

リポジトリの **Actions** → **Poll JMA Feed & Notify** → **Run workflow**

詳細は [docs/GITHUB_ACTIONS_SETUP.md](docs/GITHUB_ACTIONS_SETUP.md) を参照。

## API 仕様

### エンドポイント

```
https://raw.githubusercontent.com/{owner}/emergency-alert/main/api/latest.json
```

### レスポンス形式

```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "feeds": [
    {
      "feed": "extra",
      "count": 5,
      "entries": [
        {
          "id": "http://example.com/xml/20260729100000_0.xml",
          "title": "気象警報・注意報",
          "updated": "2026-07-29T10:00:00Z",
          "author": "気象庁",
          "link": "http://example.com/xml/20260729100000_0.xml"
        }
      ]
    }
  ],
  "summary": {
    "totalFeeds": 4,
    "totalNewEntries": 12
  }
}
```

## 使用例

### Node.js

```javascript
const response = await fetch(
  'https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json'
);
const data = await response.json();

console.log(`取得タイムスタンプ: ${data.timestamp}`);
console.log(`新着エントリ: ${data.summary.totalNewEntries}件`);

// 各フィードの内容
for (const feed of data.feeds) {
  console.log(`${feed.feed}: ${feed.count}件`);
}
```

### Python

```python
import requests

url = 'https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json'
data = requests.get(url).json()

print(f"Timestamp: {data['timestamp']}")
print(f"Total new entries: {data['summary']['totalNewEntries']}")

for feed in data['feeds']:
    print(f"{feed['feed']}: {feed['count']} entries")
```

### cURL

```bash
curl https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json | jq .
```

## GitHub Actions での実行

### 自動スケジュール

- **ポーリング**: 毎5分（0分, 5分, 10分...）
- **Slack通知**: 毎5分（2分, 7分, 12分...）— ポーリングから2分後

### 手動実行

```
ポーリング:
  Actions → Poll JMA Feed → Run workflow

Slack通知:
  Actions → Notify to Slack → Run workflow
```

### 実行ログ確認

リポジトリの **Actions** → 対象ワークフロー → 実行詳細 → ログを確認

### トラブルシューティング

- **ポーリング失敗**: ログを確認し、気象庁サーバーの状態を確認
- **Slack通知が届かない**: `SLACK_WEBHOOK_URL` Secret を確認
- **API JSONが更新されない**: git 権限を確認

詳細は [docs/GITHUB_ACTIONS_SETUP.md](docs/GITHUB_ACTIONS_SETUP.md) を参照。

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
│   ├── atom.js            # Atom フィードパース
│   ├── feed.js            # フィード取得（HTTP）
│   ├── json-builder.js    # JSON生成
│   └── ...
├── config/
│   └── severity.json     # 情報名→深刻度マッピング（将来用）
└── ...

scripts/
├── github-poll.js        # GitHub Actions ポーラー

notifier/
└── slack/                # Slack Bot 実装例
    ├── index.js
    └── messages.js

api/
├── latest.json           # 最新データ（自動生成）
└── archive/              # アーカイブ

test/
├── fixtures/             # テストデータ
└── unit/                 # 単体テスト
```

## ライセンス

気象庁のデータを利用しているため、以下に従ってください：

- [気象庁データ利用規約](https://www.jma.go.jp/jma/kishou/minkan/gaiyou.html)
- [防災情報XML技術資料](https://xml.kishou.go.jp/tec_material.html)

本プログラムのコードは MIT ライセンスで利用可能です（気象庁データ部分を除く）。

## 通知の実装

### Slack Bot

このリポジトリに含まれる Slack Bot の実装例：

```bash
# セットアップ: notifier/slack/README.md を参照
```

### カスタム通知

REST API から JSON を取得して、任意のシステムと統合可能：

```bash
# 例: 定期的に API から取得して自分のシステムに通知
curl https://raw.githubusercontent.com/{owner}/emergency-alert/main/api/latest.json \
  | jq '.feeds[] | select(.count > 0)'
```

## カスタマイズ

将来的に以下をカスタマイズ可能：

- 深刻度の調整（`src/config/severity.json`）
- 対象情報名の選別
- 通知ロジックの追加（notifier/ に実装例を追加）

## サポート

問題が発生した場合：

1. [docs/GITHUB_ACTIONS_SETUP.md](docs/GITHUB_ACTIONS_SETUP.md) でセットアップ確認
2. リポジトリの **Actions** タブでワークフロー実行ログを確認
3. `npm test` でコンポーネントを検証

---

**気象庁防災情報を、より使いやすく、より正確に。**
