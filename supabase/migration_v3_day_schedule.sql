-- ============================================================
-- Nahdat al-Malaika — Migration v3: تنظيم اليوم (Day Schedule)
-- Run AFTER schema.sql + migration_v2.sql in Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- day_tasks:       الوظائف (يديرها المدير العام فقط من الإعدادات)
-- day_assignments: تكليف خادم بوظيفة في يوم معيّن (المدير فقط يكتب)
-- Everyone approved can READ. Only admin can WRITE.
-- ============================================================

-- 1) الوظائف
create table if not exists public.day_tasks (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  icon text not null default '🛠️',
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 2) التكليفات: خادم ↔ وظيفة ↔ يوم
create table if not exists public.day_assignments (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  task_id uuid not null references public.day_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (date, task_id, user_id)
);

create index if not exists day_assignments_date_idx on public.day_assignments (date);
create index if not exists day_assignments_task_idx on public.day_assignments (task_id);

-- 3) RLS
alter table public.day_tasks enable row level security;
alter table public.day_assignments enable row level security;

-- الجميع (المعتمدون) يقرأون
drop policy if exists "day_tasks_read" on public.day_tasks;
create policy "day_tasks_read" on public.day_tasks
  for select using (is_approved());

drop policy if exists "day_assignments_read" on public.day_assignments;
create policy "day_assignments_read" on public.day_assignments
  for select using (is_approved());

-- المدير العام فقط يكتب
drop policy if exists "day_tasks_admin_write" on public.day_tasks;
create policy "day_tasks_admin_write" on public.day_tasks
  for all using (is_admin()) with check (is_admin());

drop policy if exists "day_assignments_admin_write" on public.day_assignments;
create policy "day_assignments_admin_write" on public.day_assignments
  for all using (is_admin()) with check (is_admin());

-- 4) وظائف افتراضية (يمكن للمدير تعديلها/حذفها)
insert into public.day_tasks (name, icon, sort_order)
select * from (values
  ('الاستقبال', '🤝', 1),
  ('التسجيل والحضور', '📝', 2),
  ('الألعاب', '⚽', 3),
  ('الترانيم', '🎵', 4),
  ('الدرس', '📖', 5),
  ('التوزيعات', '🎁', 6),
  ('النظافة والترتيب', '🧹', 7)
) as t(name, icon, sort_order)
where not exists (select 1 from public.day_tasks);

-- 5) Realtime publication
do $$ begin
  alter publication supabase_realtime add table public.day_tasks;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.day_assignments;
exception when duplicate_object then null; end $$;
