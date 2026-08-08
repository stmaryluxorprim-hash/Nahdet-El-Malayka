-- ============================================================
-- Migration v11 — ⏱️ مزامنة توقيت السيرفر (للخريطة التفاعلية)
-- دالة server_now(): تُرجع توقيت السيرفر الحالي حتى تتزامن
-- مؤقّتات كل الأجهزة معاً حتى لو ساعة الجهاز غير مضبوطة.
-- ============================================================

create or replace function server_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

-- متاحة لكل المستخدمين المسجّلين (وحتى anon — لا تكشف أي بيانات)
grant execute on function server_now() to anon, authenticated;
