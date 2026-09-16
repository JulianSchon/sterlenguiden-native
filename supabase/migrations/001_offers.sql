-- ============================================================
-- Erbjudanden (Förmåner) — schema
-- Kör hela filen i Supabase SQL Editor.
-- Säker att köra om: allt är IF NOT EXISTS / DROP+CREATE.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nya kolumner på business_stories
--    En rad med is_premium = true ÄR ett erbjudande.
-- ------------------------------------------------------------

alter table public.business_stories
  add column if not exists savings_label       text,
  add column if not exists savings_value       integer,
  add column if not exists offer_category      text,
  add column if not exists redemption_limit    integer,
  add column if not exists redemption_interval text;

comment on column public.business_stories.savings_label is
  'Fri text, t.ex. "Spara 150 kr". Visas som guldpill på erbjudandet.';
comment on column public.business_stories.savings_value is
  'Besparing i kronor. Används för att räkna ut passets totala värde.';
comment on column public.business_stories.offer_category is
  'Mat & Dryck | Hotell & B&B | Natur & Upplevelser | Butiker';
comment on column public.business_stories.redemption_limit is
  'Max antal användningar totalt per användare. NULL = obegränsat (styrs av intervallet).';
comment on column public.business_stories.redemption_interval is
  'once | daily | weekly | monthly | unlimited';

-- Skydda mot stavfel — dessa värden styr regelmotorn i appen
alter table public.business_stories
  drop constraint if exists business_stories_redemption_interval_check;

alter table public.business_stories
  add constraint business_stories_redemption_interval_check
  check (
    redemption_interval is null
    or redemption_interval in ('once', 'daily', 'weekly', 'monthly', 'unlimited')
  );

-- Snabb uppslagning av aktiva erbjudanden
create index if not exists business_stories_premium_idx
  on public.business_stories (is_premium, expires_at)
  where is_premium = true;


-- ------------------------------------------------------------
-- 2. offer_redemptions — logg över aktiveringar
--    OBS: medvetet INGEN unique(user_id, story_id).
--    Ett erbjudande med daily/weekly/unlimited måste kunna
--    lösas in flera gånger — regelmotorn i appen räknar raderna
--    och avgör om en ny aktivering är tillåten.
-- ------------------------------------------------------------

create table if not exists public.offer_redemptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  story_id     uuid not null references public.business_stories (id) on delete cascade,
  activated_at timestamptz not null default now()
);

-- Regelmotorn hämtar alltid "mina inlösen", sorterade på tid
create index if not exists offer_redemptions_user_story_idx
  on public.offer_redemptions (user_id, story_id, activated_at desc);


-- ------------------------------------------------------------
-- 3. Row Level Security
--    En användare får bara se och skapa sina EGNA inlösen.
--    Ingen update/delete: loggen ska vara oföränderlig.
-- ------------------------------------------------------------

alter table public.offer_redemptions enable row level security;

drop policy if exists "Users can view own redemptions"   on public.offer_redemptions;
drop policy if exists "Users can insert own redemptions" on public.offer_redemptions;

create policy "Users can view own redemptions"
  on public.offer_redemptions
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own redemptions"
  on public.offer_redemptions
  for insert
  with check (auth.uid() = user_id);
