# Health Tracker セットアップ

localStorage 版を Supabase 同期版にするための初回セットアップ手順です。

## 1. Supabase プロジェクト作成
1. https://supabase.com で無料アカウント＆新規プロジェクトを作成
2. 左メニュー **SQL Editor** → New query に、リポジトリの `supabase-schema.sql` の中身を貼り付けて **Run**
   - `body_records` / `exercise_records` / `tasks` の3テーブルと RLS ポリシーが作成される
3. **Authentication → Providers → Email** を有効化（Confirm email: ON のままでよい）
4. **Authentication → URL Configuration**
   - Site URL と Redirect URLs に、あとで決まる GitHub Pages の公開 URL を追加
     （例: `https://USERNAME.github.io/health-tracker/`）
5. **Project Settings → API** で次の2つを控える
   - Project URL（例: `https://xxxx.supabase.co`）
   - anon public key

## 2. アプリに接続情報を記入
`index.html` の先頭付近にある次の2行を、1-5 で控えた値に書き換える:
```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
```
> anon public key は公開しても安全な鍵です（RLS で本人の行だけに保護される）。

## 3. GitHub Pages で公開
1. GitHub に `health-tracker` リポジトリを作成し、このフォルダを push
   ```bash
   git remote add origin https://github.com/USERNAME/health-tracker.git
   git push -u origin main
   ```
2. リポジトリの **Settings → Pages** → Source: `main` / `/ (root)` を選んで保存
3. 数分後に発行される公開 URL（`https://USERNAME.github.io/health-tracker/`）を、
   手順 1-4 の Supabase Redirect URLs にも必ず登録する

## 4. スマホで使う
1. スマホのブラウザで公開 URL を開く
2. メールアドレスを入力 → 届いたリンクをタップしてログイン
3. ブラウザメニューから **ホーム画面に追加** → アイコンから起動できる

## 動作確認チェックリスト
- [ ] PC でログインして体重・運動・タスクを入力できる
- [ ] スマホで開くと同じデータが見える
- [ ] スマホで入力 → PC を再読込すると反映される
- [ ] 運動5種目（筋トレ / RUN / WALKING / BIKE / HIIT）のトグルが保存される
- [ ] 別ブラウザ（未ログイン）で公開 URL を開いてもデータが見えない（RLS 確認）

## ローカルでのロジックテスト
データ層のテストは `test-supabase-datamanager.html` をブラウザで開くと実行され、全件 pass を確認できる（Supabase 接続不要）。
