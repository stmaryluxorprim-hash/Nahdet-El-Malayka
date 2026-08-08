-- ============================================================
-- Nahdat al-Malaika — Migration v12:
--   1) ⏱️ مؤقّت الخريطة بتوقيت السيرفر 100% (RPCs)
--      كل عمليات المؤقّت (بدء/إيقاف/استكمال/جولة تالية/ضبط وقت)
--      تتم بدوال على السيرفر تستخدم now() الخاصة بقاعدة البيانات —
--      فلا يمكن لساعة هاتف المدير (حتى لو خاطئة) أن تُفسد المؤقّت
--      على باقي الأجهزة.
--   2) 🔔 نظام الإشعارات + رنين جماعي
--      جدول notifications: المدير يرسل إشعاراً (عنوان + نص) مع
--      خيار «رنين على كل الأجهزة» لجذب انتباه الخدام بنغمة مختلفة.
-- Run AFTER migration_v11_server_time.sql in Supabase SQL Editor.
-- Safe to re-run (idempotent).
-- ============================================================

-- ============================================================
-- PART 1 — Server-side carnival timer RPCs
-- ============================================================

-- بدء الجولة: started_at = ساعة السيرفر (وليس ساعة الجهاز)
create or replace function carnival_start_timer()
returns void
language plpgsql security definer as $$
begin
  if not has_permission('map.manage') then
    raise exception 'not allowed';
  end if;
  update public.carnival_state
     set started_at = now(), paused_remaining = null, updated_at = now()
   where id = 1;
end;
$$;

-- إيقاف مؤقت: يحسب المتبقي على السيرفر نفسه
create or replace function carnival_pause_timer()
returns void
language plpgsql security definer as $$
declare
  st public.carnival_state%rowtype;
  rem int;
begin
  if not has_permission('map.manage') then
    raise exception 'not allowed';
  end if;
  select * into st from public.carnival_state where id = 1;
  if st.started_at is null or st.paused_remaining is not null then
    return; -- ليس جارياً
  end if;
  rem := greatest(0, st.round_seconds - floor(extract(epoch from (now() - st.started_at)))::int);
  update public.carnival_state
     set paused_remaining = rem, updated_at = now()
   where id = 1;
end;
$$;

-- استكمال: يعيد ضبط started_at بحيث المتبقي = paused_remaining (بساعة السيرفر)
create or replace function carnival_resume_timer()
returns void
language plpgsql security definer as $$
declare
  st public.carnival_state%rowtype;
begin
  if not has_permission('map.manage') then
    raise exception 'not allowed';
  end if;
  select * into st from public.carnival_state where id = 1;
  if st.paused_remaining is null then
    return;
  end if;
  update public.carnival_state
     set started_at = now() - make_interval(secs => (st.round_seconds - st.paused_remaining)),
         paused_remaining = null,
         updated_at = now()
   where id = 1;
end;
$$;

-- إعادة (إيقاف كامل)
create or replace function carnival_reset_timer()
returns void
language plpgsql security definer as $$
begin
  if not has_permission('map.manage') then
    raise exception 'not allowed';
  end if;
  update public.carnival_state
     set started_at = null, paused_remaining = null, updated_at = now()
   where id = 1;
end;
$$;

-- الانتقال لجولة معينة (مع بدء فوري اختياري) — كله بساعة السيرفر
create or replace function carnival_go_round(p_round int, p_auto_start boolean default false)
returns void
language plpgsql security definer as $$
declare
  st public.carnival_state%rowtype;
  target int;
begin
  if not has_permission('map.manage') then
    raise exception 'not allowed';
  end if;
  select * into st from public.carnival_state where id = 1;
  target := least(greatest(1, p_round), st.total_rounds);
  update public.carnival_state
     set current_round = target,
         started_at = case when p_auto_start then now() else null end,
         paused_remaining = null,
         updated_at = now()
   where id = 1;
end;
$$;

-- إضافة / خصم وقت أثناء الجولة (بالثواني، موجب أو سالب)
create or replace function carnival_adjust_time(p_delta int)
returns void
language plpgsql security definer as $$
declare
  st public.carnival_state%rowtype;
begin
  if not has_permission('map.manage') then
    raise exception 'not allowed';
  end if;
  select * into st from public.carnival_state where id = 1;
  if st.paused_remaining is not null then
    update public.carnival_state
       set paused_remaining = greatest(0, st.paused_remaining + p_delta), updated_at = now()
     where id = 1;
  elsif st.started_at is not null then
    update public.carnival_state
       set started_at = st.started_at + make_interval(secs => p_delta), updated_at = now()
     where id = 1;
  end if;
end;
$$;

grant execute on function carnival_start_timer() to authenticated;
grant execute on function carnival_pause_timer() to authenticated;
grant execute on function carnival_resume_timer() to authenticated;
grant execute on function carnival_reset_timer() to authenticated;
grant execute on function carnival_go_round(int, boolean) to authenticated;
grant execute on function carnival_adjust_time(int) to authenticated;

-- ============================================================
-- PART 2 — 🔔 Notifications
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text,
  ring boolean not null default false,        -- 🔔 رنين على كل الأجهزة
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

-- صلاحية إرسال الإشعارات
insert into permissions (key, name_ar) values
  ('notifications.send', 'إرسال الإشعارات والرنين الجماعي')
on conflict (key) do nothing;

-- منحها للمدير والمشرف
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where p.key = 'notifications.send' and r.key in ('admin', 'supervisor')
on conflict do nothing;

-- RLS
alter table public.notifications enable row level security;

drop policy if exists "notifications_read" on public.notifications;
create policy "notifications_read" on public.notifications
  for select using (is_approved());

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert with check (has_permission('notifications.send') and created_by = auth.uid());

drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications
  for delete using (has_permission('notifications.send'));

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

alter table public.notifications replica identity full;
