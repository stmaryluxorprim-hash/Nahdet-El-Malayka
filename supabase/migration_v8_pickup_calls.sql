-- ============================================================
-- Nahdat al-Malaika — Migration v8: استدعاء الأطفال (Pickup Calls)
-- Run AFTER schema.sql + migration_v2..v7 in Supabase SQL Editor.
-- Safe to re-run (idempotent).
-- ============================================================

-- 1) جدول الاستدعاءات
create table if not exists public.pickup_calls (
  id uuid primary key default uuid_generate_v4(),
  child_id uuid not null references public.children(id) on delete cascade,
  date date not null default current_date,
  position double precision not null default 0,   -- الترتيب في القائمة (الأصغر = الأول)
  status text not null default 'waiting',          -- waiting | delivered
  called_by uuid references public.profiles(id) on delete set null,
  delivered_by uuid references public.profiles(id) on delete set null,
  delivered_at timestamptz,
  created_at timestamptz default now()
);

-- طفل واحد لا يمكن أن يكون في قائمة الانتظار مرتين في نفس اليوم
create unique index if not exists pickup_calls_waiting_unique
  on public.pickup_calls (child_id, date) where status = 'waiting';

create index if not exists pickup_calls_date_status_idx
  on public.pickup_calls (date, status, position);

-- 2) صلاحية جديدة: استدعاء الأطفال
insert into permissions (key, name_ar) values
  ('pickup.manage', 'استدعاء الأطفال')
on conflict (key) do nothing;

-- منحها لكل الأدوار (مدير / مشرف / خادم)
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where p.key = 'pickup.manage' and r.key in ('admin', 'supervisor', 'servant')
on conflict do nothing;

-- 3) RLS
alter table public.pickup_calls enable row level security;

drop policy if exists "pickup_select" on public.pickup_calls;
create policy "pickup_select" on public.pickup_calls
  for select using (is_approved());

drop policy if exists "pickup_insert" on public.pickup_calls;
create policy "pickup_insert" on public.pickup_calls
  for insert with check (has_permission('pickup.manage'));

drop policy if exists "pickup_update" on public.pickup_calls;
create policy "pickup_update" on public.pickup_calls
  for update using (has_permission('pickup.manage'));

drop policy if exists "pickup_delete" on public.pickup_calls;
create policy "pickup_delete" on public.pickup_calls
  for delete using (has_permission('pickup.manage'));

-- 4) Realtime
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.pickup_calls';
  exception when duplicate_object then null;
  end;
end $$;

alter table public.pickup_calls replica identity full;
