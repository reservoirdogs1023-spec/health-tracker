-- ログイン廃止マイグレーション
-- 固定ユーザーのデータに anon（未ログイン）でも読み書き可にする。
-- Supabase ダッシュボード > SQL Editor に貼り付けて1回だけ実行。

-- 固定ユーザーID（sync の .env の USER_ID と同一）
-- 97759ae1-227e-4846-8586-105d269944c6

-- 1. user_id 列のデフォルトを固定UUIDに変更
--    （未ログインの INSERT でも user_id が自動で入る）
alter table body_records     alter column user_id set default '97759ae1-227e-4846-8586-105d269944c6';
alter table exercise_records alter column user_id set default '97759ae1-227e-4846-8586-105d269944c6';
alter table tasks            alter column user_id set default '97759ae1-227e-4846-8586-105d269944c6';

-- 2. anon / authenticated にテーブル操作権限を付与（RLS は別途下で制御）
grant select, insert, update, delete on body_records     to anon, authenticated;
grant select, insert, update, delete on exercise_records to anon, authenticated;
grant select, insert, update, delete on tasks            to anon, authenticated;

-- 3. 旧ポリシー（auth.uid() ベース）を削除
drop policy if exists "own rows" on body_records;
drop policy if exists "own rows" on exercise_records;
drop policy if exists "own rows" on tasks;

-- 4. 固定ユーザーの行に対し anon / authenticated が全操作できるポリシー
create policy "single user open" on body_records
  for all to anon, authenticated
  using (user_id = '97759ae1-227e-4846-8586-105d269944c6')
  with check (user_id = '97759ae1-227e-4846-8586-105d269944c6');

create policy "single user open" on exercise_records
  for all to anon, authenticated
  using (user_id = '97759ae1-227e-4846-8586-105d269944c6')
  with check (user_id = '97759ae1-227e-4846-8586-105d269944c6');

create policy "single user open" on tasks
  for all to anon, authenticated
  using (user_id = '97759ae1-227e-4846-8586-105d269944c6')
  with check (user_id = '97759ae1-227e-4846-8586-105d269944c6');
