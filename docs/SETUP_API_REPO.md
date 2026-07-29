# jma-alert-api リポジトリ セットアップガイド

防災情報API データ公開用リポジトリの初期化手順です。

## 1. GitHub リポジトリ作成

```bash
# GitHub.com で新規作成するか、CLI で:
gh repo create jma-alert-api \
  --public \
  --description "気象庁防災情報API - JSON形式で公開" \
  --source=. \
  --remote=origin \
  --push
```

## 2. リポジトリ構成

```
jma-alert-api/
├── README.md              # API仕様書
├── latest.json            # 最新の防災情報（毎分更新）
└── archive/
    ├── 2026-07/
    │   ├── 2026-07-29T10-00-00Z.json
    │   └── 2026-07-29T10-01-00Z.json
    └── 2026-08/
```

## 3. 初期ファイル

### README.md テンプレート

```markdown
# 気象庁防災情報API

気象庁の防災情報XML（PULL型）を整理し、JSON形式で REST API として公開します。

## エンドポイント

### 最新情報
```
https://raw.githubusercontent.com/{owner}/jma-alert-api/main/latest.json
```

### アーカイブ
```
https://raw.githubusercontent.com/{owner}/jma-alert-api/main/archive/{YYYY-MM}/{timestamp}.json
```

## JSONスキーマ

```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "immediate": [
    {
      "reportId": "...",
      "reportTitle": "津波警報",
      "infoType": "発表",
      "eventID": "...",
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
  "digest": [...],
  "record": [...],
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

## 深刻度レベル

### `immediate` - 即時通知
特別警報、津波警報、噴火警報など、直ちに通知すべき情報。

### `digest` - 集約通知
暴風・波浪・大雪等の警報クラス。5〜15分ごとに1通にまとめて通知。

### `record` - 記録のみ
注意報、予報情報など、記録のみ対象。

## 利用例

### Node.js

```javascript
const response = await fetch(
  'https://raw.githubusercontent.com/{owner}/jma-alert-api/main/latest.json'
);
const data = await response.json();

// 即時通知対象
console.log('Immediate:', data.immediate);
```

### Python

```python
import requests

url = 'https://raw.githubusercontent.com/{owner}/jma-alert-api/main/latest.json'
data = requests.get(url).json()
print(data['immediate'])
```

## 更新頻度

- `latest.json`: 毎分更新（気象庁から新着がある場合）
- `archive/`: 毎分保存

## 使用ライセンス

気象庁のデータを利用しているため、気象庁の利用規約に従ってください。
参考: https://www.jma.go.jp/jma/kishou/minkan/gaiyou.html
```

### latest.json テンプレート

```bash
# 初期ファイルを作成
cat > latest.json << 'EOF'
{
  "timestamp": "2026-07-29T00:00:00Z",
  "immediate": [],
  "digest": [],
  "record": [],
  "summary": {
    "total": 0,
    "byLevel": {
      "immediate": 0,
      "digest": 0,
      "record": 0
    }
  }
}
EOF
```

## 4. GitHub Actions（オプション）

毎月末に古いアーカイブを削除する workflow（`.github/workflows/cleanup.yml`）

```yaml
name: Cleanup Old Archives
on:
  schedule:
    - cron: '0 0 1 * *'  # 毎月1日

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Remove archives older than 3 months
        run: |
          find archive -name "*.json" -mtime +90 -delete
      - name: Commit and push
        run: |
          git config --global user.email "bot@example.com"
          git config --global user.name "Bot"
          git add -A
          git commit -m "Cleanup old archives" || true
          git push
```

## 5. デプロイ確認

リポジトリが public になったら、以下でアクセス確認：

```bash
curl https://raw.githubusercontent.com/{owner}/jma-alert-api/main/latest.json | jq .
```

---

**次のステップ:** `emergency-alert` リポジトリの Cloud Functions をこのリポジトリへの push を有効にしてデプロイ
