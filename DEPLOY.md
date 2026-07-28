# デプロイ手順

```bash
PROJECT=your-project
REGION=asia-northeast1
SA=jma-alert@$PROJECT.iam.gserviceaccount.com

gcloud services enable \
  cloudfunctions.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com cloudscheduler.googleapis.com \
  firestore.googleapis.com

gcloud firestore databases create --location=$REGION

gcloud iam service-accounts create jma-alert
gcloud projects add-iam-policy-binding $PROJECT \
  --member=serviceAccount:$SA --role=roles/datastore.user
```

## 関数

```bash
gcloud functions deploy jma-feed-poller \
  --gen2 --runtime=nodejs22 --region=$REGION \
  --source=. --entry-point=pollJmaFeed \
  --trigger-http --no-allow-unauthenticated \
  --service-account=$SA \
  --memory=256Mi --timeout=55s --max-instances=3 \
  --set-env-vars=TARGET_AREAS=奈良県 \
  --set-secrets=SLACK_WEBHOOK_URL=slack-webhook:latest
```

`--timeout=55s` は毎分起動と重ならないようにするため。`--max-instances` を絞っておくと、
暴走時に気象庁側へ大量アクセスするのを防げる。

## Scheduler（毎分）

```bash
URL=$(gcloud functions describe jma-feed-poller --region=$REGION --gen2 --format='value(serviceConfig.uri)')

gcloud run services add-iam-policy-binding jma-feed-poller \
  --region=$REGION --member=serviceAccount:$SA --role=roles/run.invoker

gcloud scheduler jobs create http jma-feed-poll \
  --location=$REGION --schedule="* * * * *" --time-zone="Asia/Tokyo" \
  --uri=$URL --http-method=GET \
  --oidc-service-account-email=$SA \
  --attempt-deadline=60s
```

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
