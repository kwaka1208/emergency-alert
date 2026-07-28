# 実装ハンドオフ

## このドキュメントの位置づけ

`CLAUDE.md` が常時参照する規約、本書が一度きりの実装計画。
プロジェクトの制約・アーキテクチャ・落とし穴は `CLAUDE.md` を読むこと。
ここには何をどの順で作るかだけを書く。

## 対象範囲

**日本国内全域。** 地域による絞り込みは行わない。
そのぶん通知量の制御が本システムの中心的な課題になる（`CLAUDE.md` 冒頭を参照）。

## 現状

プロトタイプ相当の単一ファイル実装（`index.js`）とデプロイ手順（`DEPLOY.md`）がある。
**これは特定地域向けの叩き台であり、全国運用の要件を満たさない。**
設計の意図を読み取る参考資料として使い、Phase 1 以降で作り直す。

満たしていない点:

- 単一関数で電文本体まで直列取得しており、全国の流量ではタイムアウトする
- 状態差分がなく、変化のない再送まで通知してしまう
- EventID による続報の束ねがない
- 深刻度による通知経路の分岐がない
- 地域フィルタが電文XML全文への文字列一致（全国運用では不要なので削除する）
- テストが一切ない

## Phase 0 — 流量の実測

**これを最初にやる。** ここで得た数字が以降すべての閾値設計の根拠になる。

**やること**

- 長期フィード `extra_l.xml` / `eqvol_l.xml` / `other_l.xml` / `regular_l.xml` を
  **各1回だけ**取得し、`test/fixtures/` に保存する
- 保存したデータから以下を集計してレポートする:
  - フィード別・情報名（entry の title）別の件数
  - 1時間あたりの entry 数の分布（最大・中央値）
  - 出現する情報名の**全一覧**
- 代表的な電文をいくつか取得してフィクスチャに追加する
  （`CLAUDE.md` のテスト方針に挙げた種類）

**ここで必ず一度止まり、集計結果と情報名の一覧を共有すること。**
2026年5月の体系変更により、モデルの記憶にある情報名は旧体系である可能性が高い。
実物の一覧を確認してから、深刻度の分類（未決事項2）を決める。

**受け入れ基準** — 集計レポートが出ており、フィクスチャが揃っている。
以降のフェーズで実サーバーへアクセスしない。

## Phase 1 — 足場

- リポジトリ初期化、`package.json`、`.gitignore`、`.env.example`
- ディレクトリ構成の目安:
  ```
  src/
    poller/index.js      フィード取得 → Pub/Sub publish
    processor/index.js   電文取得 → 差分判定 → 通知/バッファ
    digest/index.js      集約通知
    lib/
      feed.js            条件付きGET
      atom.js            Atomパース（純粋）
      report.js          電文取得・パース
      severity.js        深刻度判定（純粋）
      diff.js            状態差分（純粋）
      store.js           Firestore
      notifiers/
        index.js  console.js  slack.js
    config/
      severity.json      情報名 → 深刻度の対応表（Phase 0 の結果から作る）
  test/fixtures/
  ```
- `npm test` が `node --test` で走る

**受け入れ基準** — テストが1件通り、poller がローカル起動して 200 を返す。

## Phase 2 — poller

**やること**

- 4フィードの条件付きGET。ETag / Last-Modified を Firestore に保存し次回付与
- 304 のとき即座に return。以降の処理を一切行わない
- Atom パース。entry 0件・1件・複数件をすべて配列として扱う
- entry を `updated` の昇順に整列（UTC / JST 混在に注意、Date に正規化）
- 重複排除: `entry.id` の SHA-1 をドキュメントIDに Firestore の `create()`。
  ALREADY_EXISTS（gRPC code 6）を「処理済み」として扱う。`expireAt` に48時間後
- 新着のみ Pub/Sub トピック `jma-entries` へ publish
- **poller は電文本体を取得しない**
- ETag の保存は全 publish 完了後

**受け入れ基準**

- 304 応答時に publish が発生しない
- 同じフィードを2回処理しても publish が2回発生しない（エミュレータ）
- 処理中に例外を投げるテストで、ETag が保存されていない
- 全国相当の entry 数（Phase 0 の最大値）を含むフィクスチャで 55秒以内に完了する

## Phase 3 — 電文パースと状態差分

**やること**

- processor: Pub/Sub 購読 → 電文取得（同時接続5に制限）
- `Head` から取得: `Title` / `InfoType` / `InfoKind` / `ReportDateTime` /
  `TargetDateTime` / `EventID` / `Serial` / `Headline/Text`
- 対象地域は `Area` の `Name` と `Code` を構造として取り出す。**全文文字列一致は使わない**
- **状態差分**: 府県予報区コードをキーに、発表中の警報・注意報の集合を Firestore に保持。
  新しい電文の集合と比較し、新規 / 格上げ / 格下げ / 解除 を算出する。
  `InfoType === '取消'` は全解除として扱う
- 差分算出は純粋関数（`diff.js`）として実装し、Firestore に依存させない
- 古い電文が遅れて届いたときに新しい状態を上書きしないよう、`ReportDateTime` で判定する

**受け入れ基準**

- 同一府県の連続する2電文のフィクスチャで、差分が期待どおり算出される
- 変化のない再送で差分が空になる
- 取消電文で全解除になる
- 順序が逆転した電文で状態が巻き戻らない
- `diff.js` に Firestore 依存がない

## Phase 4 — 深刻度判定と通知

**やること**

- `config/severity.json` に情報名 → 深刻度（immediate / digest / record）の対応表を作る。
  **Phase 0 で確認した実際の情報名を根拠にする**
- 深刻度判定を純粋関数として実装
- immediate: 個別に即時通知
- digest: Firestore のバッファに積む
- record: 記録のみ
- `EventID` による束ね。同一 EventID の通知は新規メッセージを作らず更新する
  （Slack の場合 `chat.update` 用に `ts` を保持）
- digest 関数: バッファを読み、府県ごとにまとめた1通を送信、バッファをクリア
- 通知アダプタ: `console` と `slack`。インタフェースを揃える

**受け入れ基準**

- `NOTIFIER=console` で Phase 0 のフィクスチャ全件を流し、
  **1時間ぶんの入電に対する即時通知が現実的な件数に収まる**ことを確認して報告する
- 同一 EventID の地震続報が1通知にまとまる
- 深刻度判定と差分ロジックが純粋関数として単体テストされている

## Phase 5 — デプロイと運用

- Pub/Sub トピック・サブスクリプション、Scheduler ジョブ2本（毎分 / 5分）
- サービスアカウント権限を最小に（`datastore.user`、`run.invoker`、`pubsub.publisher`）
- Secret Manager に Webhook URL
- Firestore の TTL ポリシー（`expireAt`）
- poller: タイムアウト55秒 / attempt-deadline 60秒 / max-instances 3
- processor: max-instances を絞り、気象庁への同時接続を制御
- 構造化ログ: 304率、entry数、publish数、通知数、深刻度別内訳
- 連続失敗時のアラート（ログベースメトリクス + アラートポリシー）

**受け入れ基準**

- 24時間連続稼働し、304が大半を占めることがログで確認できる
- 通知件数が想定内に収まっている
- 荒天時・地震発生時の挙動を実データで確認できている

## Phase 6 — 取りこぼしの回収（任意）

長期フィードを1時間おきに走査し、高頻度フィードで取りこぼした entry を拾う。
重複排除の仕組みがそのまま効くので実装量は小さい。
必要性は Phase 5 の運用実績を見てから判断する。

## 進め方

- 各 Phase の終わりでコミットし、受け入れ基準を満たしたことを報告してから次へ進む
- **Phase 0 の集計結果と情報名一覧は必ず共有し、確認を待つこと**
- **Phase 4 の通知件数の見積もりも必ず報告すること**。ここが想定を超えるなら
  閾値の設計をやり直す
- 未決事項に突き当たったら、推測で進めずに確認を求める
