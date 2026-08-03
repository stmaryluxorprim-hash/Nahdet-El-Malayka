-- ============================================================
-- نهضة الملائكة (Nahdat al-Malaika) - Supabase Database Schema
-- Run this entire file in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "uuid-ossp";

-- ---------- ENUMS ----------
do $$ begin
  create type user_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gender_type as enum ('male', 'female');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present', 'absent', 'late');
exception when duplicate_object then null; end $$;

-- ---------- RBAC: ROLES & PERMISSIONS ----------
create table if not exists roles (
  id serial primary key,
  key text unique not null,          -- admin | supervisor | servant
  name_ar text not null,
  created_at timestamptz default now()
);

create table if not exists permissions (
  id serial primary key,
  key text unique not null,
  name_ar text not null
);

create table if not exists role_permissions (
  role_id int references roles(id) on delete cascade,
  permission_id int references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

insert into roles (key, name_ar) values
  ('admin', 'مدير'),
  ('supervisor', 'مشرف'),
  ('servant', 'خادم')
on conflict (key) do nothing;

insert into permissions (key, name_ar) values
  ('children.create',   'إضافة طفل'),
  ('children.edit',     'تعديل بيانات طفل'),
  ('children.delete',   'حذف طفل'),
  ('children.view',     'عرض الأطفال'),
  ('attendance.record', 'تسجيل الحضور'),
  ('points.add',        'إضافة نقاط'),
  ('points.subtract',   'خصم نقاط'),
  ('classes.manage',    'إدارة الفصول'),
  ('users.manage',      'إدارة المستخدمين'),
  ('settings.manage',   'إدارة الإعدادات'),
  ('statistics.view',   'عرض الإحصائيات')
on conflict (key) do nothing;

-- admin: all permissions
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.key = 'admin'
on conflict do nothing;

-- supervisor: everything except users/settings management
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('children.create','children.edit','children.delete','children.view',
               'attendance.record','points.add','points.subtract','classes.manage','statistics.view')
where r.key = 'supervisor'
on conflict do nothing;

-- servant: day-to-day operations
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('children.create','children.edit','children.view',
               'attendance.record','points.add','points.subtract','statistics.view')
where r.key = 'servant'
on conflict do nothing;

-- ---------- PROFILES ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role_id int references roles(id) default null,
  status user_status not null default 'pending',
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- CLASSES ----------
create table if not exists classes (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  sort_order int default 0,
  created_at timestamptz default now()
);

insert into classes (name, sort_order) values
  ('حضانة', 1), ('أولى ابتدائي', 2), ('ثانية ابتدائي', 3),
  ('ثالثة ابتدائي', 4), ('رابعة ابتدائي', 5), ('خامسة ابتدائي', 6),
  ('سادسة ابتدائي', 7)
on conflict do nothing;

-- servants assigned to classes (optional scoping)
create table if not exists user_classes (
  user_id uuid references profiles(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  primary key (user_id, class_id)
);

-- ---------- CHILDREN ----------
create table if not exists children (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,                    -- QR code value
  name text not null,
  phone text not null check (phone ~ '^\+20[0-9]{10}$'),
  gender gender_type not null,
  class_id uuid references classes(id) on delete set null,
  photo_url text,
  birthday date,
  notes text,
  total_points int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_children_class on children(class_id);
create index if not exists idx_children_code on children(code);

-- ---------- ATTENDANCE ----------
create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  child_id uuid not null references children(id) on delete cascade,
  date date not null,
  status attendance_status not null default 'present',
  recorded_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (child_id, date)
);
create index if not exists idx_attendance_date on attendance(date);
create index if not exists idx_attendance_child on attendance(child_id);

-- ---------- POINTS LEDGER ----------
create table if not exists point_transactions (
  id uuid primary key default uuid_generate_v4(),
  child_id uuid not null references children(id) on delete cascade,
  points int not null,                          -- positive = add, negative = subtract
  reason text,
  category text default 'general',              -- attendance | behavior | memorization | general ...
  date date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_points_child on point_transactions(child_id);
create index if not exists idx_points_date on point_transactions(date);

-- keep children.total_points in sync
create or replace function sync_child_points() returns trigger
language plpgsql security definer as $$
begin
  if (tg_op = 'INSERT') then
    update children set total_points = total_points + new.points, updated_at = now() where id = new.child_id;
  elsif (tg_op = 'DELETE') then
    update children set total_points = total_points - old.points, updated_at = now() where id = old.child_id;
  elsif (tg_op = 'UPDATE') then
    update children set total_points = total_points - old.points + new.points, updated_at = now() where id = new.child_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_sync_points on point_transactions;
create trigger trg_sync_points
after insert or update or delete on point_transactions
for each row execute function sync_child_points();

-- ---------- APP SETTINGS ----------
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

insert into app_settings (key, value) values
  ('attendance_points', '{"present": 10, "late": 5, "absent": 0}'),
  ('quick_points', '[5, 10, 20]'),
  ('app_name', '"نهضة الملائكة"')
on conflict (key) do nothing;

-- ---------- ACTIVITY LOG ----------
create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz default now()
);

-- ---------- AUTO-CREATE PROFILE ON SIGNUP ----------
-- The FIRST registered user becomes an approved admin automatically.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  user_count int;
  admin_role int;
begin
  select count(*) into user_count from profiles;
  select id into admin_role from roles where key = 'admin';
  if user_count = 0 then
    insert into profiles (id, full_name, phone, role_id, status)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''),
            new.raw_user_meta_data->>'phone', admin_role, 'approved');
  else
    insert into profiles (id, full_name, phone, status)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''),
            new.raw_user_meta_data->>'phone', 'pending');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ---------- HELPER FUNCTIONS (for RLS) ----------
create or replace function is_approved() returns boolean
language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from profiles p join roles r on p.role_id = r.id
    where p.id = auth.uid() and p.status = 'approved' and r.key = 'admin'
  );
$$;

create or replace function has_permission(perm text) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    join permissions pe on pe.id = rp.permission_id
    where p.id = auth.uid() and p.status = 'approved' and pe.key = perm
  );
$$;

-- ---------- ROW LEVEL SECURITY ----------
alter table profiles enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table classes enable row level security;
alter table user_classes enable row level security;
alter table children enable row level security;
alter table attendance enable row level security;
alter table point_transactions enable row level security;
alter table app_settings enable row level security;
alter table activity_log enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select using (id = auth.uid() or is_approved());
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (id = auth.uid()) with check (id = auth.uid() and status = (select status from profiles where id = auth.uid()) and role_id is not distinct from (select role_id from profiles where id = auth.uid()));
drop policy if exists "profiles_admin_all" on profiles;
create policy "profiles_admin_all" on profiles for all using (is_admin());

-- roles / permissions: readable by all authenticated
drop policy if exists "roles_read" on roles;
create policy "roles_read" on roles for select using (auth.uid() is not null);
drop policy if exists "permissions_read" on permissions;
create policy "permissions_read" on permissions for select using (auth.uid() is not null);
drop policy if exists "role_permissions_read" on role_permissions;
create policy "role_permissions_read" on role_permissions for select using (auth.uid() is not null);
drop policy if exists "role_permissions_admin" on role_permissions;
create policy "role_permissions_admin" on role_permissions for all using (is_admin());

-- classes
drop policy if exists "classes_read" on classes;
create policy "classes_read" on classes for select using (auth.uid() is not null);
drop policy if exists "classes_manage" on classes;
create policy "classes_manage" on classes for all using (has_permission('classes.manage'));

-- user_classes
drop policy if exists "user_classes_read" on user_classes;
create policy "user_classes_read" on user_classes for select using (is_approved());
drop policy if exists "user_classes_admin" on user_classes;
create policy "user_classes_admin" on user_classes for all using (is_admin());

-- children
drop policy if exists "children_select" on children;
create policy "children_select" on children for select using (has_permission('children.view'));
drop policy if exists "children_insert" on children;
create policy "children_insert" on children for insert with check (has_permission('children.create'));
drop policy if exists "children_update" on children;
create policy "children_update" on children for update using (has_permission('children.edit'));
drop policy if exists "children_delete" on children;
create policy "children_delete" on children for delete using (has_permission('children.delete'));

-- attendance
drop policy if exists "attendance_select" on attendance;
create policy "attendance_select" on attendance for select using (is_approved());
drop policy if exists "attendance_write" on attendance;
create policy "attendance_write" on attendance for insert with check (has_permission('attendance.record'));
drop policy if exists "attendance_update" on attendance;
create policy "attendance_update" on attendance for update using (has_permission('attendance.record'));
drop policy if exists "attendance_delete" on attendance;
create policy "attendance_delete" on attendance for delete using (has_permission('attendance.record'));

-- point_transactions
drop policy if exists "points_select" on point_transactions;
create policy "points_select" on point_transactions for select using (is_approved());
drop policy if exists "points_insert" on point_transactions;
create policy "points_insert" on point_transactions for insert
  with check ((points >= 0 and has_permission('points.add')) or (points < 0 and has_permission('points.subtract')));
drop policy if exists "points_delete_admin" on point_transactions;
create policy "points_delete_admin" on point_transactions for delete using (is_admin());

-- app_settings
drop policy if exists "settings_read" on app_settings;
create policy "settings_read" on app_settings for select using (is_approved());
drop policy if exists "settings_manage" on app_settings;
create policy "settings_manage" on app_settings for all using (has_permission('settings.manage'));

-- activity_log
drop policy if exists "log_insert" on activity_log;
create policy "log_insert" on activity_log for insert with check (is_approved());
drop policy if exists "log_read_admin" on activity_log;
create policy "log_read_admin" on activity_log for select using (is_admin());

-- ---------- STORAGE: children photos bucket ----------
insert into storage.buckets (id, name, public)
values ('children-photos', 'children-photos', true)
on conflict (id) do nothing;

drop policy if exists "photos_public_read" on storage.objects;
create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'children-photos');

drop policy if exists "photos_upload" on storage.objects;
create policy "photos_upload" on storage.objects
  for insert with check (bucket_id = 'children-photos' and has_permission('children.create'));

drop policy if exists "photos_update" on storage.objects;
create policy "photos_update" on storage.objects
  for update using (bucket_id = 'children-photos' and has_permission('children.edit'));

drop policy if exists "photos_delete" on storage.objects;
create policy "photos_delete" on storage.objects
  for delete using (bucket_id = 'children-photos' and has_permission('children.edit'));

-- ============================================================
-- DONE ✅
-- Notes:
--  * The FIRST account that registers becomes the approved Admin.
--  * Later accounts stay "pending" until an admin approves them
--    from Settings > Users inside the app.
-- ============================================================
