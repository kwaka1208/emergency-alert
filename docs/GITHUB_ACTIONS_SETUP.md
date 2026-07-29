# GitHub Actions セットアップガイド

このプロジェクトは **GitHub Actions** を使用して、気象庁防災情報を定期的にポーリングし、JSON を `api/` フォルダに自動保存できます。

Google Cloud は不要です。GitHub のみで動作します。

## セットアップ手順

### 1. リポジトリを GitHub にプッシュ

このリポジトリ (emergency-alert) を GitHub にプッシュしてください。

```bash
git remote add origin https://github.com/your-username/emergency-alert.git
git push -u origin main
```

### 2. ワークフローが有効になったか確認

GitHub のリポジトリページで **Actions** タブを開き、以下のワークフローが表示されていることを確認します：
- `Poll JMA Feed` — データポーリング用
- `Notify to Slack` — Slack通知用

### 3. 手動で 1回実行してテスト

**ステップ1: ポーリングを実行**
```
Actions → Poll JMA Feed → Run workflow → Run workflow
```

**ステップ2: Slack通知を実行（オプション）**
```
Actions → Notify to Slack → Run workflow → Run workflow
```

実行完了後、`api/latest.json` が作成され、Slack に通知が送信されれば成功です。

実行完了後、`api/latest.json` が作成されていれば成功です。

---

## 動作確認

### ワークフローのログを確認

**ポーリング:**
```
Actions → Poll JMA Feed → 最新の実行 → poll
```

成功時のログ：
```
🚀 Starting JMA feed poll...
📡 Polling extra...
   ✅ X new entries
📡 Polling eqvol...
   ✅ X new entries
✅ Saved to api/latest.json
✅ Poll completed successfully
```

**Slack通知:**
```
Actions → Notify to Slack → 最新の実行 → notify
```

成功時のログ：
```
🚀 Fetching JMA alert data...
✅ Fetched data with X new entries
📤 Sending to Slack...
✅ Slack notification sent successfully
```

### API エンドポイントで JSON を取得

```bash
curl https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json | jq .
```

レスポンス例：
```json
{
  "timestamp": "2026-07-29T10:00:00Z",
  "feeds": [ 
    { "feed": "extra", "count": 12, "entries": [...] },
    { "feed": "eqvol", "count": 5, "entries": [...] }
  ],
  "summary": {
    "totalFeeds": 4,
    "totalNewEntries": 45
  }
}
```

---

## スケジュール設定

### 現在の設定

- **Poll JMA Feed** (`.github/workflows/poll-jma.yml`): `*/5 * * * *` (0, 5, 10, 15分...)
- **Notify to Slack** (`.github/workflows/notify-slack.yml`): 2分遅延 (2, 7, 12, 17分...)

### ポーリング間隔を変更する場合

`.github/workflows/poll-jma.yml` の以下を修正：

```yaml
on:
  schedule:
    - cron: '*/5 * * * *'  # ← この部分を変更
```

### Slack通知の遅延を変更する場合

`.github/workflows/notify-slack.yml` の cron を修正。ポーリングから **N分遅延**させる場合：

```yaml
on:
  schedule:
    # ポーリングが */5 で実行される場合、通知は N, N+5, N+10, ... で実行
    - cron: 'N,N+5,N+10,N+15,N+20,N+25,N+30,N+35,N+40,N+45,N+50,N+55 * * * *'
```

### 例

| ポーリング | 遅延 | 通知のcron |
|-------|------|---------|
| `*/5` | 2分 | `2,7,12,17,22,27,32,37,42,47,52,57 * * * *` |
| `*/5` | 1分 | `1,6,11,16,21,26,31,36,41,46,51,56 * * * *` |
| `*/10` | 3分 | `3,13,23,33,43,53 * * * *` |

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

ワークフローのログで git push エラーを確認してください。一般的な原因：
- リポジトリのブランチ保護設定
- write 権限がない

### ポーリングが失敗する

気象庁サーバーへのアクセス問題の可能性：
1. ネットワーク接続を確認
2. 気象庁サーバーが停止していないか確認
3. フィード URL が正しいか確認（`scripts/github-poll.js` の FEEDS 配列）

### Slack 通知が届かない

1. **SLACK_WEBHOOK_URL Secret が設定されているか確認**
   ```
   Settings → Secrets and variables → Actions → SLACK_WEBHOOK_URL
   ```

2. **Webhook URL が有効か確認**
   - Slack App → Incoming Webhooks で URL を確認
   - 対象チャンネルが削除されていないか確認

3. **ワークフロー log で通知試行を確認**
   ```
   Actions → Poll JMA Feed & Notify → Notify to Slack ステップ
   ```
   - Secret が設定されていない場合は `⚠️ SLACK_WEBHOOK_URL not set` と表示

---

## API 仕様

詳しくは [api/README.md](../api/README.md) を参照。

### エンドポイント

```
https://raw.githubusercontent.com/your-username/emergency-alert/main/api/latest.json
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
    }
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

---

## 費用

GitHub Actions は **月 2,000 分まで無料** です。

このワークフローの実行時間：通常 **30～60秒**

月間実行: 15分ごと = 4回/時間 × 24時間 = 96回/日 ≈ **2,880回/月**

月間使用時間：
```
(60秒 / 3600) × 96回/日 × 30日 ≈ 48分/月
```

**完全に無料の範囲内です** ✅

---

**これで、Google Cloud なしで、このリポジトリだけで気象庁防災情報を REST API で公開できます！** 🚀
