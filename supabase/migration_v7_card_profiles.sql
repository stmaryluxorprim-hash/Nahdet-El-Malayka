-- ============================================================
-- Nahdat al-Malaika — Migration v7: Card Print Profiles
-- Run AFTER previous migrations in the Supabase SQL Editor.
-- Adds:
--   * card_profiles        — بروفايلات إعدادات طباعة الكروت (كل بروفايل مرتبط بـ prefix)
--   * card_print_counters  — آخر رقم كارت تمت طباعته لكل prefix
--   * record_cards_printed — RPC لتسجيل «تمت الطباعة حتى رقم …» (يأخذ الأكبر دائماً)
-- Safe to re-run (idempotent).
-- ============================================================

-- 1) بروفايلات طباعة الكروت
create table if not exists public.card_profiles (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  prefix text not null,
  settings jsonb not null default '{}'::jsonb,   -- كل إعدادات التصميم (ألوان، تدرجات، حواف، أيقونة…)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.card_profiles enable row level security;

drop policy if exists "card_profiles_read" on public.card_profiles;
create policy "card_profiles_read" on public.card_profiles
  for select using (is_approved());

drop policy if exists "card_profiles_write" on public.card_profiles;
create policy "card_profiles_write" on public.card_profiles
  for all using (is_approved()) with check (is_approved());

-- 2) عدّاد الطباعة لكل بادئة (prefix)
create table if not exists public.card_print_counters (
  prefix text primary key,
  last_printed_no int not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.card_print_counters enable row level security;

drop policy if exists "card_counters_read" on public.card_print_counters;
create policy "card_counters_read" on public.card_print_counters
  for select using (is_approved());

drop policy if exists "card_counters_write" on public.card_print_counters;
create policy "card_counters_write" on public.card_print_counters
  for all using (is_approved()) with check (is_approved());

-- 3) RPC: تسجيل أن الكروت طُبعت حتى رقم معيّن لبادئة معيّنة
--    يحتفظ دائماً بالأكبر (لا يمكن الرجوع للخلف بالخطأ)
create or replace function public.record_cards_printed(p_prefix text, p_last_no int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_result int;
begin
  if not is_approved() then
    raise exception 'not allowed';
  end if;
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    raise exception 'prefix is required';
  end if;

  insert into card_print_counters (prefix, last_printed_no, updated_by, updated_at)
  values (trim(p_prefix), greatest(p_last_no, 0), auth.uid(), now())
  on conflict (prefix) do update
    set last_printed_no = greatest(card_print_counters.last_printed_no, excluded.last_printed_no),
        updated_by = auth.uid(),
        updated_at = now()
  returning last_printed_no into v_result;

  return v_result;
end $$;

grant execute on function public.record_cards_printed(text, int) to authenticated;

-- 4) Realtime لتحديث العدّادات والبروفايلات لحظياً
do $$ begin
  alter publication supabase_realtime add table public.card_profiles;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.card_print_counters;
exception when duplicate_object then null; end $$;
