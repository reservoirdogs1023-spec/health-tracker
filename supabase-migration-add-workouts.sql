-- Apple Health ワークアウトテーブルの追加（2026-08-07）
-- Supabase ダッシュボード > SQL Editor に貼り付けて1回だけ実行する。
-- 1行1ワークアウト。同日複数回を保持し、Cycling の距離は NULL のまま保存する。

-- 固定ユーザーID（sync の .env の USER_ID と同一）
-- 97759ae1-227e-4846-8586-105d269944c6

create table if not exists workout_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '97759ae1-227e-4846-8586-105d269944c6',
  record_key text not null,
  date date not null,
  time time not null,
  species text not null check (species in ('Walking', 'Running', 'Cycling')),
  duration_minutes numeric,
  distance_km numeric,
  calories_kcal numeric,
  unique (user_id, record_key)
);

-- 2026-08-07: 「自転車なら距離は必ず空」の制約は将来 GPS で距離が入ると保存を弾くため撤去。
-- 制約付きで作成済みの環境向けに解除する（未作成なら no-op）。
alter table workout_records drop constraint if exists workout_records_check;

grant select, insert, update, delete on workout_records to anon, authenticated;

alter table workout_records enable row level security;

drop policy if exists "own rows" on workout_records;
drop policy if exists "single user open" on workout_records;

create policy "single user open" on workout_records
  for all to anon, authenticated
  using (user_id = '97759ae1-227e-4846-8586-105d269944c6')
  with check (user_id = '97759ae1-227e-4846-8586-105d269944c6');
