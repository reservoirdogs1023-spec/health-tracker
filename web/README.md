# Health Tracker Web

GitHub Pages + Supabase Free用の本人専用Health Tracker。Sites version 34のからだ・ラン画面、VO₂max、グラフを引き継ぐ。

## 開発

Node 22.18以降。`npm ci --ignore-scripts`、`npm test`、`npm run build`。
`.env.example`を参考にローカルだけの`.env.local`へURLとpublishable keyを設定する。service role key、秘密キー、パスワードは使わない。
`npm run dev`でログイン画面。`VITE_LOCAL_PREVIEW=1 npm run dev`は架空データの画面確認専用で保存不可。確認用データとログイン省略は本番ビルドへ含めない。

## 認証とデータ

Supabase Authの既存の本人アカウントでメール・パスワードログイン。本人以外には新DBの読み書きを許可しない。画面の非表示だけでなく、DBのRLSと所有者設定で制限する。
`health_web_owner`は管理側だけが設定し、本人を1件だけ登録。`health_web_records`は本人ID・カテゴリ・安定キーの組で保持。全関数はSECURITY INVOKERで実行する。

データAPIを有効化する前に、旧5テーブルの匿名・一般ユーザー向け権限と`single user open`ポリシーを撤去する。旧DBのData APIを以前の権限のまま有効化しない。

`supabase/schema.sql`は新規テーブルと関数の検証済みセットアップSQL。既存環境への繰り返し実行用ではない。本番にはSupabaseの履歴付き移行として適用する。

## バックアップと取り込み

ログイン後の「データ管理」で、6カテゴリ（body/sleep/exercise/workout/pending/vo2）をJSONに保存できる。バックアップは健康情報を含むため、公開リポジトリに入れない。
取り込みは同じ形式のJSON、またはbody/sleep/exercise/workoutの変換済みJSONを受け付ける。原本ZIPやApple Healthの全量原文はアップロードしない。VO₂maxだけの取り込みは`{"vo2":[...]}`を使う。
100件ずつ追加し、同一記録はスキップ。異なる値の競合ではその単位全体を取り消す。先行する単位が保存済みの場合があるため、途中失敗ではバックアップで状態を確認してから再実行する。完了時は全対象キーと値を読み戻して照合する。
手入力はpendingとして保存し、表示に重ねる。ローカル正本や旧Sitesへ自動反映する機能は今回含めない。

## 公開

GitHub Actionsの手動実行で`web/`をビルドし、`web/dist`だけをPagesへ配信する。リポジトリ変数`VITE_SUPABASE_URL`と`VITE_SUPABASE_PUBLISHABLE_KEY`が必要。これらはブラウザへ公開される前提の情報で、保護はRLSと本人ログインが担う。
旧ルートのHTMLは移行元として残すが、新しい公開対象は`web/dist`。以前のmain/root配信を再開しない。

## 無料運用

Supabase Freeは500MB。低活動状態が約7日続くと一時停止する場合がある。停止通知を確認し、必要時にStudioで再開する。停止回避のための架空アクセスは設定しない。
定期的にデータ管理からバックアップを取得する。利用終了時の削除は、バックアップを確認した上で管理者が新テーブルの本人行のみを削除する。削除は通常の画面・取り込みでは行えない。

## 確認範囲

PostgreSQL（PGlite）で本人・別人・未認証のアクセス、所有者変更の拒否、重複・競合の原子的な扱い、不正入力、全カテゴリの保全を検証。表示モデルの既存テストも継続する。本番ログインとスマホの実画面は、切替時に本人の操作で確認する。
