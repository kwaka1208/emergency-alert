# GitHub Actions セットアップガイド

このプロジェクトは **GitHub Actions** を使用して、気象庁防災情報を定期的にポーリングし、JSON を公開できます。

Google Cloud は不要です。GitHub のみで動作します。

## セットアップ手順

### 1. jma-alert-api リポジトリを作成

GitHub で新規リポジトリ `jma-alert-api` を作成してください。

```
https://github.com/your-username/jma-alert-api
```

### 2. このリポジトリに Personal Access Token を登録

#### Token を生成

GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)

**必要なスコープ:**
- ✅ `repo` (すべて)
- ✅ `public_repo`

#### Repository Secrets に登録

このリポジトリ (emergency-alert) の Settings → Secrets and variables → Actions

以下を追加：

| Secret 名 | 値 |
|----------|-----|
| `JMA_ALERT_API_TOKEN` | Personal Access Token |
| `JMA_ALERT_API_OWNER` | GitHub ユーザー名 |
| `JMA_ALERT_API_REPO` | `jma-alert-api` |

**追加方法:**
```
Repository → Settings → Secrets and variables → Actions → New repository secret
```

### 3. ワークフローが有効になったか確認

このリポジトリの Actions タブで、`Poll JMA Feed` ワークフローが表示されていれば OK です。

### 4. 手動で 1回実行

```
Actions → Poll JMA Feed → Run workflow → Run workflow
```

---

## 動作確認

### ワークフローのログを確認

```
Actions → Poll JMA Feed → 最新のワークフロー実行 → poll
```

成功時のログ：
```
🚀 Starting JMA feed poll from GitHub Actions...
📡 Polling extra...
   ✅ X new entries
📡 Polling eqvol...
   ✅ X new entries
...
✅ Poll completed successfully
```

### jma-alert-api に JSON が push されたか確認

```bash
curl https://raw.githubusercontent.com/your-username/jma-alert-api/main/latest.json | jq .
```

レスポンス例：
```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "feeds": [ ... ],
  "summary": { ... }
}
```

---

## スケジュール設定

現在は **15分ごと** に実行されます。変更したい場合：

`.github/workflows/poll-jma.yml` の以下を修正：

```yaml
on:
  schedule:
    - cron: '*/15 * * * *'  # ← この部分
```

### よく使うスケジュール

| 間隔 | cron 式 |
|-----|--------|
| 5分ごと | `*/5 * * * *` |
| 15分ごと | `*/15 * * * *` |
| 30分ごと | `*/30 * * * *` |
| 1時間ごと | `0 * * * *` |

---

## トラブルシューティング

### ワークフローが実行されない

1. **Personal Access Token の権限確認**
   ```bash
   curl -H "Authorization: token YOUR_TOKEN" \
     https://api.github.com/user
   ```

2. **Repository Secrets が正しく設定されているか確認**
   - Settings → Secrets and variables → Actions

3. **ワークフローが有効か確認**
   - `.github/workflows/poll-jma.yml` が存在するか
   - `on:` セクションが正しいか

### Push に失敗する

```
ERROR: GitHub API error: ...
```

**原因と対応:**
- Token の権限不足 → 新しい Token を生成
- jma-alert-api リポジトリが存在しない → 作成する
- Secret が設定されていない → 設定し直す

### ポーリングが失敗する

```
ERROR: (gcloud.functions.deploy) ...
```

気象庁サーバーへのアクセス問題の可能性：
1. ネットワークを確認
2. 気象庁サーバーが停止していないか確認
3. User-Agent が正しいか確認

---

## API 仕様

### エンドポイント

```
https://raw.githubusercontent.com/your-username/jma-alert-api/main/latest.json
```

### レスポンス形式

```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "feeds": [
    {
      "feed": "extra",
      "count": 12,
      "entries": [...]
    },
    ...
  ],
  "summary": {
    "totalFeeds": 4,
    "totalNewEntries": 45
  }
}
```

---

## 使用例

### Node.js

```javascript
async function getLatestAlerts() {
  const response = await fetch(
    'https://raw.githubusercontent.com/your-username/jma-alert-api/main/latest.json'
  );
  const data = await response.json();
  
  console.log(`新着エントリ: ${data.summary.totalNewEntries}`);
  console.log(data.feeds);
}
```

### Python

```python
import requests

url = 'https://raw.githubusercontent.com/your-username/jma-alert-api/main/latest.json'
data = requests.get(url).json()

print(f"New entries: {data['summary']['totalNewEntries']}")
```

### cURL

```bash
curl https://raw.githubusercontent.com/your-username/jma-alert-api/main/latest.json | jq .
```

---

## 費用

GitHub Actions は **月 2,000 分まで無料** です。

このワークフローの実行時間：通常 **30～60秒**

月間コスト：
```
(60秒 / 3600) × 4回/時間 × 24時間 × 30日 = 約 480分/月
```

**完全に無料の範囲内です** ✅

---

## セキュリティ注意事項

- **Personal Access Token は絶対に共有しない**
- **Secret に登録したら、コードに埋め込まない**
- Token の有効期限を定期的に更新（GitHub デフォルト: 無制限、手動設定推奨）

---

**これで、Google Cloud なしで、気象庁防災情報を REST API で公開できます！** 🚀
