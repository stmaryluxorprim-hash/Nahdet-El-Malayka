-- ============================================================
-- Nahdat al-Malaika — Migration v6: المشرف يدير تكليفات اليوم
-- Run AFTER schema.sql + migrations v2..v5 in Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- المطلوب: المدير + المشرف فقط يعدّلون تكليفات الوظائف
-- (day_assignments) — الخادم يشاهد فقط.
-- الوظائف نفسها (day_tasks) تبقى للمدير فقط من الإعدادات.
-- ============================================================

-- 1) دالة مساعدة: هل المستخدم مدير أو مشرف معتمد؟
create or replace function public.is_supervisor_or_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles p join roles r on p.role_id = r.id
    where p.id = auth.uid()
      and p.status = 'approved'
      and r.key in ('admin', 'supervisor')
  );
$$;

-- 2) سياسة الكتابة على day_assignments: مدير أو مشرف
drop policy if exists "day_assignments_admin_write" on public.day_assignments;
drop policy if exists "day_assignments_manage_write" on public.day_assignments;
create policy "day_assignments_manage_write" on public.day_assignments
  for all using (is_supervisor_or_admin()) with check (is_supervisor_or_admin());

-- 3) القراءة تبقى كما هي: كل المعتمدين يشاهدون (سياسة day_assignments_read)
-- 4) day_tasks تبقى كما هي: كتابة للمدير فقط (سياسة day_tasks_admin_write)

-- ============================================================
-- DONE ✅
--  * المدير والمشرف: إضافة/إزالة خدام من وظائف اليوم
--  * الخادم: مشاهدة تقسيمة اليوم فقط
-- ============================================================
