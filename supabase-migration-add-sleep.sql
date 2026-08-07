-- 睡眠テーブルの追加（2026-08-07）
-- Supabase ダッシュボード > SQL Editor に貼り付けて1回だけ実行する。
--
-- 経緯: supabase-schema.sql には sleep_records の定義があるが、実際の Supabase には
-- 作られていなかった（アプリ・sync・pull は睡眠に対応済みなのに入れ物だけ無い状態）。
-- body_records / exercise_records と同じ「ログインなし・固定ユーザー」方式で作る
-- （= supabase-migration-remove-auth.sql と同じ形。auth.users への外部キーは張らない）。
--
-- 夜勤で睡眠が割れる生活のため、合計に加えて夜・昼の内訳を持つ:
--   hours       … 合計（内訳が無い日もここには入る。必ず埋まる）
--   night_hours … 夜の睡眠。内訳を記録していない日は NULL
--   nap_hours   … 昼寝・午睡。内訳を記録していない日は NULL
-- 内訳が両方入っている行では hours = night_hours + nap_hours になる（記録側で検算している）。
-- NULL は「昼寝ゼロ」ではなく「内訳が不明」を意味する。0 で埋めないこと。

-- 固定ユーザーID（sync の .env の USER_ID と同一）
-- 97759ae1-227e-4846-8586-105d269944c6

create table if not exists sleep_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '97759ae1-227e-4846-8586-105d269944c6',
  date date not null,
  hours numeric,
  night_hours numeric,
  nap_hours numeric,
  unique (user_id, date)
);

-- 既にテーブルがある環境向け（今回は新規作成なので no-op）
alter table sleep_records add column if not exists night_hours numeric;
alter table sleep_records add column if not exists nap_hours numeric;

-- anon（未ログイン）から読み書きできるようにする。行の制限は下の RLS ポリシーで行う。
grant select, insert, update, delete on sleep_records to anon, authenticated;

alter table sleep_records enable row level security;

drop policy if exists "own rows" on sleep_records;
drop policy if exists "single user open" on sleep_records;

create policy "single user open" on sleep_records
  for all to anon, authenticated
  using (user_id = '97759ae1-227e-4846-8586-105d269944c6')
  with check (user_id = '97759ae1-227e-4846-8586-105d269944c6');
