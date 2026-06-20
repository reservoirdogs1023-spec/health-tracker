# Health Tracker — Obsidian→Supabase 同期 & Web再公開 設計

作成日: 2026-06-20

## 目的

Obsidian（Markdown）で記録している健康データ（体組成・トレーニング）を、
Supabase 同期版 Health Tracker（Web）に**一方向で自動反映**し、スマホから閲覧できるようにする。
Web版は GitHub Pages で再公開する。

## 前提・制約

- **利用者**: 本人のみ（個人利用・完全無料枠）
- **Source of Truth**: Obsidian の Markdown（体組成.md / トレーニング.md）
- **同期方向**: 一方向（Obsidian → Supabase）。**Web版は閲覧専用**（入力UIは非表示）
- **同期タイミング**: 「常に自動」＝ Claude Code が健康記録するワークフローに同期を組み込む
- **データ**: トレーニングは8種目＋詳細を**一切捨てずに**保持
- 既存の Supabase 同期版（`feat/supabase-sync` ブランチ）をベースにする

## データ元（Obsidian Markdown）

- 体組成: `Health/体組成.md`
  - `| 日付 | 体重(kg) | 体脂肪率(%) | メモ |` のテーブル
- トレーニング: `Health/トレーニング.md`
  - `| 日付 | 種目 | 詳細 | メモ |` のテーブル（1日複数行可）
  - 種目: 腕立て / アブローラー / スクワット / 斜め懸垂 / RUN / WALKING / BIKE / HIIT

## スキーマ変更

`exercise_records` に `detail` カラムを追加し、type は8種目をそのまま格納する。

```sql
-- 既存テーブルへの追加（supabase-schema.sql を更新）
alter table exercise_records add column if not exists detail text;
-- type は8種目をそのまま格納（制約変更なし。text のまま）
-- unique (user_id, date, type) は維持
```

`body_records` は変更なし（date / weight / body_fat）。

| Obsidian | Supabase: body_records |
|----------|------------------------|
| 体重(kg) | weight |
| 体脂肪率(%) | body_fat |
| 日付 | date |

| Obsidian | Supabase: exercise_records |
|----------|----------------------------|
| 種目（8種目） | type（そのまま格納） |
| 詳細 | detail |
| 日付 | date |

## 同期スクリプト

- ファイル: `sync-to-supabase.mjs`（Node, ESM）
- 依存: `@supabase/supabase-js` のみ
- 設定: `.env`（`.gitignore` 済み）
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`（RLS をバイパスする管理者キー。ローカル実行専用・非公開）
  - `USER_ID`（書き込み対象のユーザーUUID）

### 処理フロー
1. `体組成.md` / `トレーニング.md` を読み、Markdownテーブルをパース
2. body_records へ全件 UPSERT（onConflict: `user_id,date`）
3. exercise_records へ全件 UPSERT（onConflict: `user_id,date,type`）
4. 各 UPSERT に `user_id = USER_ID` を明示付与

### 設計上の判断
- **認証**: service_role key + 明示 user_id（anon key だと auth.uid() が null で RLS に弾かれるため）
- **冪等性**: unique 制約に対する UPSERT。毎回全件投入で安全（数十行規模・高速）。失敗時は再実行で復旧
- **Markdown が常に正**: Web側の値とズレても、次回同期で Markdown の内容に揃う

## Web版の表示改修（閲覧専用・最小改修）

現行 index.html は5種目前提（`EX_ICON`、達成率チャート＝筋トレ/RUN/HIIT、ストリーク、入力トグル）。
データは8種目＋詳細で保存しつつ、表示は最小改修にとどめる。

| 要素 | 方針 |
|------|------|
| カレンダー絵文字 | 8種目に拡張。Obsidianダッシュボードと絵文字を統一（💪腕立て 🛞アブローラー 🦵スクワット 🧗斜め懸垂 🏃RUN 🚶WALKING 🚲BIKE 🔥HIIT） |
| 日付タップ | その日の「種目＋詳細」を一覧表示（詳細はここで閲覧） |
| 達成率チャート | 現状維持（筋トレ系は集約してカウント）。8種目個別チャート化はしない（YAGNI） |
| 入力トグル | 非表示（閲覧専用のため） |

## デプロイ（GitHub Pages 再公開）

役割分担:

| # | 作業 | 担当 |
|---|------|------|
| 1 | Supabaseプロジェクト作成・`supabase-schema.sql`（detail追加版）実行・key取得 | 本人 |
| 2 | index.html に SUPABASE_URL / ANON_KEY 記入 | Claude |
| 3 | GitHubリポジトリ作成 → push → Pages 有効化（gh CLI） | Claude |
| 4 | Supabase Auth の Site URL / Redirect URLs に公開URLを登録 | 本人（値はClaudeが提示） |
| 5 | 同期スクリプト作成・初回全件移行 | Claude |
| 6 | USER_ID 取得（本人がログイン後、auth.users から取得） | 本人＋Claude |

- index.html に書く anon key は公開可（RLS で保護）。service_role key は `.env` のみ・非公開。

## ワークフロー組み込み（自動同期）

`~/.claude/CLAUDE.md` の「健康記録」セクションに1行追記する（**本人の許可済み**）:

> 体組成・トレーニングを記録しダッシュボードを再生成した後、`apps/health-tracker/sync-to-supabase.mjs` を実行して Supabase に反映する。

これにより「記録 → Markdown更新 → ダッシュボード再生成 → Supabase同期」が一連で自動実行される。

## テスト

- パース関数の単体テスト（Markdownテーブル → レコード配列が正しいか）
  - 体組成: 通常行・空セル・同日重複なしを検証
  - トレーニング: 8種目すべて・1日複数行・詳細あり/なしを検証
- 同期はローカルで初回実行し、Supabase 上で件数とサンプル行を目視確認

## 却下した案

- **双方向同期** → Web→Markdown 書き戻しと競合解決が必要で複雑。Web版は閲覧用途のため不要（YAGNI）
- **トレーニング5種目集約（詳細破棄）** → 情報が失われるため本人が拒否。8種目＋detail で完全保持に変更
- **達成率チャートの8種目個別化** → 表示の作り込みが増える。既存5系統を流用（YAGNI）
- **常駐プロセス/ファイル監視で同期** → 記録は基本 Claude Code 経由のため、記録ワークフロー組み込みで十分
