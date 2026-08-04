-- ============================================================
-- Nahdat al-Malaika — Migration v4: رقم التليفون الإجباري + حذف الخادم نهائياً
-- Run AFTER schema.sql + migration_v2.sql (+ v3) in Supabase SQL Editor.
-- Safe to re-run (idempotent).
-- ============================================================

-- 1) رقم التليفون فريد (لا يسمح بتسجيل خادمين بنفس الرقم)
--    ملحوظة: لو عندك أرقام مكررة قديمة، عدّلها أولاً ثم أعد التنفيذ.
create unique index if not exists profiles_phone_key
  on public.profiles (phone) where phone is not null and phone <> '';

-- 2) RPC عام: هل الرقم مستخدم بالفعل؟ (يُستدعى قبل التسجيل — متاح لغير المسجلين)
create or replace function public.phone_exists(p_phone text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where phone = p_phone);
$$;

grant execute on function public.phone_exists(text) to anon, authenticated;

-- 3) RPC للمدير فقط: حذف مستخدم نهائياً (auth.users + profiles بالتتابع cascade)
create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if target_id = auth.uid() then
    raise exception 'cannot delete yourself';
  end if;
  -- حذف من auth.users يحذف profiles و user_permissions و day_assignments تلقائياً (cascade)
  delete from auth.users where id = target_id;
end $$;

revoke execute on function public.admin_delete_user(uuid) from anon, public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
