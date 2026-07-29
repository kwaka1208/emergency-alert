# 気象庁防災情報 API

このディレクトリに、気象庁防災情報の整理済み JSON が保存されます。

GitHub Actions で 15分ごとに自動更新。

## エンドポイント

### 最新情報
```
https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json
```

### アーカイブ
```
https://raw.githubusercontent.com/your-username/emergency-alert/main/api/archive/{YYYY-MM}/{timestamp}.json
```

## 使用例

### Node.js
```javascript
const response = await fetch(
  'https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json'
);
const data = await response.json();
console.log(data.summary);
```

### Python
```python
import requests

url = 'https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json'
data = requests.get(url).json()
print(data['summary'])
```

### cURL
```bash
curl https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json | jq .
```

## JSONスキーマ

```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "feeds": [
    {
      "feed": "extra",
      "count": 12,
      "entries": [ ... ]
    },
    {
      "feed": "eqvol",
      "count": 5,
      "entries": [ ... ]
    }
  ],
  "summary": {
    "totalFeeds": 4,
    "totalNewEntries": 45
  }
}
```

## 更新頻度

- `api/latest.json`: 15分ごと
- `api/archive/`: 15分ごと

## 詳細

詳しくは [docs/GITHUB_ACTIONS_SETUP.md](../docs/GITHUB_ACTIONS_SETUP.md) を参照。
