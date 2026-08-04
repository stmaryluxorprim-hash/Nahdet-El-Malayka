-- ============================================================
-- Nahdat al-Malaika — Migration v2
-- Run AFTER schema.sql in the Supabase SQL Editor.
-- Adds: username login, per-user permissions, child portal RPC,
--       realtime publication for live updates.
-- Safe to re-run (idempotent).
-- ============================================================

-- 1) username column on profiles
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_key
  on public.profiles (lower(username)) where username is not null;

-- keep handle_new_user in sync: store username from signup metadata
-- (same behaviour as schema.sql: first user = approved admin)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  user_count int;
  admin_role int;
begin
  select count(*) into user_count from profiles;
  select id into admin_role from roles where key = 'admin';
  if user_count = 0 then
    insert into profiles (id, full_name, username, phone, role_id, status)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''),
            lower(nullif(new.raw_user_meta_data->>'username','')),
            new.raw_user_meta_data->>'phone', admin_role, 'approved');
  else
    insert into profiles (id, full_name, username, phone, status)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''),
            lower(nullif(new.raw_user_meta_data->>'username','')),
            new.raw_user_meta_data->>'phone', 'pending');
  end if;
  return new;
end $$;

-- 2) per-user extra permissions
create table if not exists public.user_permissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id int not null references public.permissions(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, permission_id)
);

alter table public.user_permissions enable row level security;

drop policy if exists "user_permissions read own or admin" on public.user_permissions;
create policy "user_permissions read own or admin" on public.user_permissions
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists "user_permissions admin write" on public.user_permissions;
create policy "user_permissions admin write" on public.user_permissions
  for all using (is_admin()) with check (is_admin());

-- 3) has_permission (same signature as schema.sql — used by all RLS policies):
--    now true if the permission comes from the ROLE or from USER-SPECIFIC grants.
--    Admin always passes.
create or replace function has_permission(perm text) returns boolean
language sql security definer stable as $$
  select is_admin()
  or exists (
    select 1 from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    join permissions pe on pe.id = rp.permission_id
    where p.id = auth.uid() and p.status = 'approved' and pe.key = perm
  )
  or exists (
    select 1 from user_permissions up
    join permissions pe on pe.id = up.permission_id
    join profiles p on p.id = up.user_id
    where up.user_id = auth.uid() and p.status = 'approved' and pe.key = perm
  );
$$;

-- 4) child portal RPC — public (anon) access by card code
create or replace function public.get_child_portal(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_rank int;
  v_att_count int;
  v_result jsonb;
begin
  select * into v_child
  from public.children
  where upper(code) = upper(trim(p_code)) and is_active = true;

  if not found then
    return null;
  end if;

  select count(*) + 1 into v_rank
  from public.children
  where is_active = true and total_points > v_child.total_points;

  select count(*) into v_att_count
  from public.attendance
  where child_id = v_child.id and status <> 'absent';

  select jsonb_build_object(
    'name', v_child.name,
    'code', v_child.code,
    'gender', v_child.gender,
    'photo_url', v_child.photo_url,
    'birthday', v_child.birthday,
    'total_points', v_child.total_points,
    'class_name', (select name from public.classes where id = v_child.class_id),
    'rank', v_rank,
    'attendance_count', v_att_count,
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('date', a.date, 'status', a.status) order by a.date desc)
      from (select date, status from public.attendance
            where child_id = v_child.id and status <> 'absent'
            order by date desc limit 60) a
    ), '[]'::jsonb),
    'points', coalesce((
      select jsonb_agg(jsonb_build_object(
        'points', t.points, 'reason', t.reason, 'category', t.category,
        'date', t.date, 'created_at', t.created_at) order by t.created_at desc)
      from (select points, reason, category, date, created_at
            from public.point_transactions
            where child_id = v_child.id
            order by created_at desc limit 100) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_child_portal(text) to anon, authenticated;

-- 5) realtime publication (live updates on every screen)
do $$
declare t text;
begin
  foreach t in array array['children','attendance','point_transactions','profiles','classes','user_permissions','app_settings']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- replica identity so realtime DELETE/UPDATE events carry data
alter table public.children replica identity full;
alter table public.attendance replica identity full;
alter table public.point_transactions replica identity full;
alter table public.profiles replica identity full;
alter table public.classes replica identity full;
alter table public.user_permissions replica identity full;
