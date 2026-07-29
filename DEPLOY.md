# デプロイガイド

気象庁防災情報APIシステムをGoogle Cloudにデプロイする手順です。

## 前提条件

- Google Cloud プロジェクトが作成済み
- `gcloud` CLI がインストール済み
- GitHub Personal Access Token がある（jma-alert-api へのpush用）
- 適切な IAM 権限がある

## ステップ1: 環境準備

### 1.1 プロジェクト設定

```bash
export PROJECT_ID="your-project-id"
export REGION="asia-northeast1"

gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION
```

### 1.2 必要な API の有効化

```bash
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

## ステップ2: Firestore セットアップ

### 2.1 Firestore データベース作成

```bash
gcloud firestore databases create --location=$REGION
```

### 2.2 TTL ポリシー設定（48時間で自動削除）

Firestore Console から TTL ポリシーを設定：
- Collection: `jmaSeenEntries`
- TTL フィールド: `expireAt`

## ステップ3: Secret Manager セットアップ

### 3.1 シークレット作成

```bash
# GitHub Token
echo -n "your-github-personal-access-token" | \
  gcloud secrets create github-token --data-file=-

# GitHub Owner
echo -n "your-github-username" | \
  gcloud secrets create github-owner --data-file=-

# GitHub Repo
echo -n "jma-alert-api" | \
  gcloud secrets create github-repo --data-file=-
```

### 3.2 サービスアカウント作成・権限付与

```bash
# サービスアカウント作成
gcloud iam service-accounts create jma-alert \
  --display-name="JMA Alert System"

SA_EMAIL="jma-alert@${PROJECT_ID}.iam.gserviceaccount.com"

# Secret Manager アクセス権限
for secret in github-token github-owner github-repo; do
  gcloud secrets add-iam-policy-binding $secret \
    --member=serviceAccount:$SA_EMAIL \
    --role=roles/secretmanager.secretAccessor
done

# Firestore アクセス権限
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$SA_EMAIL \
  --role=roles/datastore.user

# Cloud Logging
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$SA_EMAIL \
  --role=roles/logging.logWriter
```

## ステップ4: Cloud Functions デプロイ

```bash
SA_EMAIL="jma-alert@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud functions deploy pollJmaFeed \
  --gen2 \
  --runtime nodejs22 \
  --trigger-http \
  --entry-point pollJmaFeed \
  --source src/poller \
  --region $REGION \
  --memory 512MB \
  --timeout 55s \
  --max-instances 3 \
  --service-account $SA_EMAIL \
  --set-env-vars \
    "USER_AGENT=jma-alert-bot/1.0 (+https://example.com/contact)" \
    "PUSH_TO_GITHUB=true" \
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
```

**注:**
- `--timeout=55s`: 毎分起動と重ならないようにするため
- `--max-instances 3`: 気象庁への同時接続を制限

## ステップ5: Cloud Scheduler セットアップ

```bash
# Cloud Functions URL を取得
FUNCTION_URL=$(gcloud functions describe pollJmaFeed \
  --gen2 --region $REGION \
  --format='value(serviceConfig.uri)')

SA_EMAIL="jma-alert@${PROJECT_ID}.iam.gserviceaccount.com"

# Scheduler ジョブ作成（毎分実行）
gcloud scheduler jobs create http poll-jma-feed \
  --schedule="*/1 * * * *" \
  --time-zone="Asia/Tokyo" \
  --http-method=GET \
  --uri=$FUNCTION_URL \
  --oidc-service-account-email=$SA_EMAIL \
  --oidc-token-audience=$FUNCTION_URL \
  --location $REGION
```

## ステップ6: 動作確認

### 6.1 ジョブテスト実行

```bash
gcloud scheduler jobs run poll-jma-feed \
  --location $REGION
```

### 6.2 ログ確認

```bash
gcloud functions logs read pollJmaFeed \
  --gen2 \
  --limit 50
```

### 6.3 jma-alert-api リポジトリ確認

数分待って、GitHub リポジトリに `latest.json` が push されたか確認：

```bash
curl https://raw.githubusercontent.com/{owner}/jma-alert-api/main/latest.json | jq .
```

## 本番運用

### ログ監視

```bash
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=pollJmaFeed" \
  --limit 20 \
  --format json
```

### エラーアラート設定

Firestore の quota 超過や GitHub push エラーが発生した場合のアラート設定は、
Cloud Console の Monitoring セクションで行ってください。

---

詳細は [docs/SETUP_API_REPO.md](docs/SETUP_API_REPO.md) を参照。

## Firestore の TTL（重複排除レコードの自動削除）

```bash
gcloud firestore fields ttls update expireAt \
  --collection-group=jmaSeenEntries --enable-ttl
```

## ローカル実行

```bash
npm install
SLACK_WEBHOOK_URL= TARGET_AREAS=奈良県 npm start
curl localhost:8080
```

Webhook 未設定なら通知内容を stdout に出すだけなので、まずはこれで
「どの情報がどれくらいの頻度で流れてくるか」を眺めてから絞り込むとよい。

## 運用メモ

- **1日10GB制限**: 超えると IP 遮断。条件付きGET（304）と「同じ電文URLを二度取りに行かない」
  の2点さえ守れば、この規模で到達することはまずない。
- **フィードの保持は約10分**: 毎分ポーリングなら約10回ぶんの猶予がある。数分の障害は自然に回復する。
- **ETagの保存タイミング**: 全エントリの処理が終わってから保存する。先に保存すると、
  処理中の例外で次回304になり取りこぼす。
- **時刻の扱い**: フィード全体の `updated` は `+09:00`、各 entry の `updated` は `Z`（UTC）で
  混在している。素朴に文字列比較すると事故る。
- **訂正・取消**: 電文の `Head/InfoType` に 発表 / 訂正 / 取消 / 遅延 が入る。取消を無視すると
  「解除されたのに警報が出っぱなし」に見える。
- **同一事象のまとめ**: 地震は `Head/EventID`、続報は `Head/Serial` で紐づけられる。
- **2026-05-29 の体系変更**: 大雨・洪水・土砂災害・高潮の情報名が「レベル3大雨警報」
  「レベル4土砂災害危険警報」等に変わり、集約通報や気象防災速報が追加された。
  ネット上のサンプルコードの多くは旧体系のままなので、情報名のリテラルは要確認。
