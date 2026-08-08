-- ============================================================
-- Nahdat al-Malaika — Migration v10: الخريطة التفاعلية — تغيير الجولة التلقائي
-- Run AFTER migration_v9_carnival_map.sql in Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- auto_advance = true  → عند انتهاء الوقت تنتقل الخريطة تلقائياً للجولة
--                        التالية ويبدأ العدّ فوراً
-- auto_advance = false → (الافتراضي) يظل المؤقّت على «انتهت الجولة» حتى
--                        يضغط المسؤول «الجولة التالية» بنفسه
-- ============================================================

alter table public.carnival_state
  add column if not exists auto_advance boolean not null default false;
