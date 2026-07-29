#!/bin/bash
# Cloud Functions デプロイスクリプト
# 使用方法: ./deployment/deploy.sh <PROJECT_ID> <REGION>

set -e

PROJECT_ID="${1:-}"
REGION="${2:-asia-northeast1}"

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: $0 <PROJECT_ID> [REGION]"
  echo "Example: $0 my-project asia-northeast1"
  exit 1
fi

echo "=== JMA Alert System Deploy Script ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# 環境変数の設定
gcloud config set project $PROJECT_ID

SA_EMAIL="jma-alert@${PROJECT_ID}.iam.gserviceaccount.com"

# ステップ1: 必要なAPIを有効化
echo "[1/6] Enabling required APIs..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com

# ステップ2: Firestore データベース作成
echo "[2/6] Creating Firestore database..."
gcloud firestore databases create --location=$REGION 2>/dev/null || true

# ステップ3: サービスアカウント確認
echo "[3/6] Checking service account..."
gcloud iam service-accounts describe $SA_EMAIL 2>/dev/null || {
  echo "Creating service account $SA_EMAIL..."
  gcloud iam service-accounts create jma-alert \
    --display-name="JMA Alert System"
}

# ステップ4: IAM権限付与
echo "[4/6] Setting IAM permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$SA_EMAIL \
  --role=roles/datastore.user \
  --quiet 2>/dev/null || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$SA_EMAIL \
  --role=roles/logging.logWriter \
  --quiet 2>/dev/null || true

# ステップ5: Cloud Functions デプロイ
echo "[5/6] Deploying Cloud Function..."
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
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --allow-unauthenticated

# ステップ6: Cloud Scheduler ジョブ作成
echo "[6/6] Setting up Cloud Scheduler..."

FUNCTION_URL=$(gcloud functions describe pollJmaFeed \
  --gen2 --region $REGION \
  --format='value(serviceConfig.uri)')

echo "Function URL: $FUNCTION_URL"

# 既存ジョブを削除
gcloud scheduler jobs delete poll-jma-feed \
  --location $REGION \
  --quiet 2>/dev/null || true

# 新しいジョブを作成
gcloud scheduler jobs create http poll-jma-feed \
  --schedule="*/1 * * * *" \
  --time-zone="Asia/Tokyo" \
  --http-method=GET \
  --uri=$FUNCTION_URL \
  --oidc-service-account-email=$SA_EMAIL \
  --oidc-token-audience=$FUNCTION_URL \
  --location $REGION

echo ""
echo "=== Deploy Complete ==="
echo ""
echo "Cloud Function: $FUNCTION_URL"
echo ""
echo "Next steps:"
echo "1. Set up GitHub secrets:"
echo "   gcloud secrets create github-token --data-file=-"
echo "   gcloud secrets create github-owner --data-file=-"
echo "   gcloud secrets create github-repo --data-file=-"
echo ""
echo "2. Test the deployment:"
echo "   gcloud scheduler jobs run poll-jma-feed --location $REGION"
echo ""
echo "3. Check logs:"
echo "   gcloud functions logs read pollJmaFeed --gen2 --limit 50"
echo ""
echo "4. Verify jma-alert-api repository:"
echo "   curl https://raw.githubusercontent.com/{owner}/jma-alert-api/main/latest.json"
