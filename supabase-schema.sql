-- Health Tracker schema. Run in Supabase SQL Editor.

create table if not exists body_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  weight numeric,
  body_fat numeric,
  unique (user_id, date)
);

create table if not exists exercise_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  type text not null,
  detail text,
  unique (user_id, date, type)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  status text not null,
  date date
);

-- 既存環境向け: detail 列を後付け（新規 create では既に存在するため no-op）
alter table exercise_records add column if not exists detail text;

alter table body_records enable row level security;
alter table exercise_records enable row level security;
alter table tasks enable row level security;

-- One policy per table: owner can do everything on their own rows.
create policy "own rows" on body_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on exercise_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
