-- ============================================================
-- Nahdat al-Malaika — Migration v9: الخريطة التفاعلية (Carnival Map)
-- Run AFTER schema.sql + migration_v2..v8 in Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- carnival_state:       صف واحد — إعدادات الكرنفال (زمن الجولة، الجولة الحالية، المؤقّت)
-- carnival_teams:       الفرق (اسم + قائد + لون)
-- carnival_rooms:       الغرف
-- carnival_assignments: توزيع الفرق على الغرف لكل جولة
-- Everyone approved can READ. Only 'map.manage' can WRITE.
-- ============================================================

-- 1) حالة الكرنفال (صف واحد ثابت id=1)
create table if not exists public.carnival_state (
  id int primary key default 1 check (id = 1),
  title text not null default 'الخريطة التفاعلية',
  round_seconds int not null default 600,          -- زمن الجولة بالثواني
  total_rounds int not null default 3,             -- عدد الجولات
  current_round int not null default 1,            -- الجولة الحالية
  started_at timestamptz,                          -- بداية العدّ (null = متوقف)
  paused_remaining int,                            -- الثواني المتبقية عند الإيقاف المؤقت (null = ليس موقوفاً مؤقتاً)
  updated_at timestamptz not null default now()
);

insert into public.carnival_state (id) values (1) on conflict (id) do nothing;

-- 2) الفرق
create table if not exists public.carnival_teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  leader text,                                     -- اسم قائد الفريق
  color text not null default '#7c3aed',           -- لون الفريق
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 3) الغرف
create table if not exists public.carnival_rooms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  icon text not null default '🎪',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 4) التوزيعات: جولة ↔ فريق ↔ غرفة
create table if not exists public.carnival_assignments (
  id uuid primary key default uuid_generate_v4(),
  round int not null,
  team_id uuid not null references public.carnival_teams(id) on delete cascade,
  room_id uuid not null references public.carnival_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round, team_id)
);

create index if not exists carnival_assignments_round_idx on public.carnival_assignments (round);

-- 5) صلاحية جديدة: إدارة الخريطة التفاعلية
insert into permissions (key, name_ar) values
  ('map.manage', 'إدارة الخريطة التفاعلية')
on conflict (key) do nothing;

-- منحها للمدير والمشرف فقط (المسؤولون)
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where p.key = 'map.manage' and r.key in ('admin', 'supervisor')
on conflict do nothing;

-- 6) RLS
alter table public.carnival_state enable row level security;
alter table public.carnival_teams enable row level security;
alter table public.carnival_rooms enable row level security;
alter table public.carnival_assignments enable row level security;

-- الجميع (المعتمدون) يقرأون
drop policy if exists "carnival_state_read" on public.carnival_state;
create policy "carnival_state_read" on public.carnival_state
  for select using (is_approved());

drop policy if exists "carnival_teams_read" on public.carnival_teams;
create policy "carnival_teams_read" on public.carnival_teams
  for select using (is_approved());

drop policy if exists "carnival_rooms_read" on public.carnival_rooms;
create policy "carnival_rooms_read" on public.carnival_rooms
  for select using (is_approved());

drop policy if exists "carnival_assignments_read" on public.carnival_assignments;
create policy "carnival_assignments_read" on public.carnival_assignments
  for select using (is_approved());

-- أصحاب صلاحية map.manage فقط يكتبون
drop policy if exists "carnival_state_write" on public.carnival_state;
create policy "carnival_state_write" on public.carnival_state
  for all using (has_permission('map.manage')) with check (has_permission('map.manage'));

drop policy if exists "carnival_teams_write" on public.carnival_teams;
create policy "carnival_teams_write" on public.carnival_teams
  for all using (has_permission('map.manage')) with check (has_permission('map.manage'));

drop policy if exists "carnival_rooms_write" on public.carnival_rooms;
create policy "carnival_rooms_write" on public.carnival_rooms
  for all using (has_permission('map.manage')) with check (has_permission('map.manage'));

drop policy if exists "carnival_assignments_write" on public.carnival_assignments;
create policy "carnival_assignments_write" on public.carnival_assignments
  for all using (has_permission('map.manage')) with check (has_permission('map.manage'));

-- 7) Realtime publication
do $$ begin
  alter publication supabase_realtime add table public.carnival_state;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.carnival_teams;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.carnival_rooms;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.carnival_assignments;
exception when duplicate_object then null; end $$;

alter table public.carnival_state replica identity full;
alter table public.carnival_teams replica identity full;
alter table public.carnival_rooms replica identity full;
alter table public.carnival_assignments replica identity full;
