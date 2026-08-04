-- ============================================================
-- Nahdat al-Malaika — Migration v5: إصلاح حذف الخادم/المستخدم
-- Run AFTER schema.sql + migration_v2 (+ v3 + v4) in Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- المشكلة: حذف مستخدم كان يفشل (من التطبيق ومن لوحة Supabase) بسبب
-- قيود Foreign Key بدون ON DELETE على أعمدة تشير إلى profiles:
--   children.created_by / attendance.recorded_by /
--   point_transactions.created_by / activity_log.user_id
-- بمجرد أن يضيف الخادم طفلاً أو يسجّل حضوراً أو نقاطاً، يستحيل حذفه.
--
-- الحل:
--   1) تحويل هذه القيود إلى ON DELETE SET NULL
--      (تُحفظ البيانات التاريخية، ويُفرَّغ فقط مرجع "من قام بالعملية")
--   2) تحديث admin_delete_user لفصل كل المراجع (بما فيها ملكية Storage)
--      قبل الحذف — حماية إضافية
-- ============================================================

-- ------------------------------------------------------------
-- 1) إسقاط أي قيود FK قديمة (بأي اسم) على الأعمدة المسببة للمشكلة
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select distinct tc.constraint_name, tc.table_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema  = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and (tc.table_name, kcu.column_name) in (
        ('children',           'created_by'),
        ('attendance',         'recorded_by'),
        ('point_transactions', 'created_by'),
        ('activity_log',       'user_id')
      )
  loop
    execute format('alter table public.%I drop constraint %I', r.table_name, r.constraint_name);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2) إعادة إنشاء القيود مع ON DELETE SET NULL
-- ------------------------------------------------------------
alter table public.children
  add constraint children_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.attendance
  add constraint attendance_recorded_by_fkey
  foreign key (recorded_by) references public.profiles(id) on delete set null;

alter table public.point_transactions
  add constraint point_transactions_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.activity_log
  add constraint activity_log_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- ------------------------------------------------------------
-- 3) admin_delete_user — نسخة محسّنة:
--    تفصل كل المراجع أولاً (حماية إضافية حتى لو ظهرت قيود جديدة)
--    ثم تحذف من auth.users (فيُحذف profile و user_permissions
--    و day_assignments و user_classes تلقائياً cascade)
-- ------------------------------------------------------------
create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql security definer set search_path = public, auth, storage as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if target_id = auth.uid() then
    raise exception 'cannot delete yourself';
  end if;

  -- فصل مرجع "من قام بالعملية" مع الاحتفاظ بالبيانات التاريخية
  update public.children           set created_by  = null where created_by  = target_id;
  update public.attendance         set recorded_by = null where recorded_by = target_id;
  update public.point_transactions set created_by  = null where created_by  = target_id;
  update public.activity_log       set user_id     = null where user_id     = target_id;

  -- ملكية ملفات Storage (قد تمنع حذف auth.users في بعض إصدارات Supabase)
  begin
    update storage.objects set owner = null where owner = target_id;
  exception when undefined_column or undefined_table or insufficient_privilege then null;
  end;
  begin
    update storage.objects set owner_id = null where owner_id = target_id::text;
  exception when undefined_column or undefined_table or insufficient_privilege then null;
  end;

  -- الحذف النهائي (cascade → profiles, user_permissions, day_assignments, user_classes)
  delete from auth.users where id = target_id;
end $$;

revoke execute on function public.admin_delete_user(uuid) from anon, public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ============================================================
-- DONE ✅
-- بعد تنفيذ هذا الملف:
--  * حذف الخادم من التطبيق (الإعدادات → المستخدمون → 🗑️) يعمل نهائياً
--  * حذف المستخدم من لوحة Supabase (Authentication → Users) يعمل أيضاً
--  * سجلات الأطفال/الحضور/النقاط القديمة تبقى كما هي (يُفرَّغ فقط
--    مرجع من قام بالعملية)
-- ============================================================
