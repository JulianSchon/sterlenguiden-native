-- ============================================================
-- Erbjudanden flyttas till en EGEN tabell.
--
-- Tidigare låg de i business_stories med is_premium = true, vilket
-- blandade ihop två helt olika saker: en story är ett tillfälligt inlägg,
-- ett erbjudande är en förmån med regler för inlösen.
--
-- Kör avsnitt 1-4 i ordning. Avsnitt 5 är valfri städning.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tabellen offers
-- ------------------------------------------------------------

create table if not exists public.offers (
  id                  uuid primary key default gen_random_uuid(),

  -- Vem erbjudandet gäller hos, och vem som äger det
  place_id            integer not null references public.places (id) on delete cascade,
  user_id             uuid    not null references auth.users (id)    on delete cascade,

  -- Innehåll
  title               text not null,   -- "2 för 1 på lunch"
  description         text,            -- längre beskrivning
  image_url           text,

  -- Värde
  savings_label       text,            -- "Spara 150 kr" (fri text, visas som guldpill)
  savings_value       integer,         -- kronor, används i passets totala värde

  -- Kategori: Mat & Dryck | Hotell & B&B | Natur & Upplevelser | Butiker
  category            text,

  -- Regler för inlösen
  redemption_limit    integer,         -- max antal gånger per användare, null = obegränsat
  redemption_interval text not null default 'once',

  -- Giltighet
  expires_at          timestamptz,     -- null = tills vidare
  is_active           boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.offers
  drop constraint if exists offers_redemption_interval_check;

alter table public.offers
  add constraint offers_redemption_interval_check
  check (redemption_interval in ('once', 'daily', 'weekly', 'monthly', 'unlimited'));

-- Appen hämtar alltid "aktiva erbjudanden", ofta filtrerat på plats
create index if not exists offers_active_idx   on public.offers (is_active, expires_at);
create index if not exists offers_place_id_idx on public.offers (place_id);


-- ------------------------------------------------------------
-- 2. offer_redemptions byggs om att peka på offers
--    (tabellen skapades nyss och är tom — inget går förlorat)
-- ------------------------------------------------------------

drop table if exists public.offer_redemptions;

create table public.offer_redemptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id)     on delete cascade,
  offer_id     uuid not null references public.offers (id)  on delete cascade,
  activated_at timestamptz not null default now()
);

-- Medvetet INGEN unique(user_id, offer_id): ett erbjudande med
-- daily/weekly/unlimited måste kunna lösas in flera gånger. Regelmotorn
-- i appen räknar raderna och avgör om en ny aktivering är tillåten.
create index if not exists offer_redemptions_user_offer_idx
  on public.offer_redemptions (user_id, offer_id, activated_at desc);


-- ------------------------------------------------------------
-- 3. Row Level Security
-- ------------------------------------------------------------

alter table public.offers enable row level security;

drop policy if exists "Alla inloggade kan läsa erbjudanden" on public.offers;
drop policy if exists "Ägaren kan skapa egna erbjudanden"   on public.offers;
drop policy if exists "Ägaren kan ändra egna erbjudanden"   on public.offers;
drop policy if exists "Ägaren kan radera egna erbjudanden"  on public.offers;

create policy "Alla inloggade kan läsa erbjudanden"
  on public.offers for select
  to authenticated
  using (true);

create policy "Ägaren kan skapa egna erbjudanden"
  on public.offers for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Ägaren kan ändra egna erbjudanden"
  on public.offers for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Ägaren kan radera egna erbjudanden"
  on public.offers for delete
  to authenticated
  using (auth.uid() = user_id);


alter table public.offer_redemptions enable row level security;

drop policy if exists "Egna inlösen kan läsas"  on public.offer_redemptions;
drop policy if exists "Egna inlösen kan skapas" on public.offer_redemptions;

create policy "Egna inlösen kan läsas"
  on public.offer_redemptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Egna inlösen kan skapas"
  on public.offer_redemptions for insert
  to authenticated
  with check (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 4. Flytta över befintliga erbjudanden från business_stories
--    Körs bara om offers är tom, så den kan köras om utan dubbletter.
--    OBS: tar med även utgångna — de syns inte i appen men finns kvar
--    så du kan förlänga dem istället för att skriva om dem.
-- ------------------------------------------------------------

insert into public.offers
  (place_id, user_id, title, description, image_url, expires_at, created_at)
select
  place_id,
  user_id,
  coalesce(nullif(trim(deal_text), ''), nullif(trim(caption), ''), 'Erbjudande'),
  caption,
  image_url,
  expires_at,
  created_at
from public.business_stories
where is_premium = true
  and not exists (select 1 from public.offers);


-- ------------------------------------------------------------
-- 5. VALFRITT — städa business_stories
--
--    Kolumnerna nedan la jag till i migration 001 innan vi bestämde
--    att erbjudanden skulle bo i en egen tabell. De hör inte hemma
--    på en story. Avkommentera för att ta bort dem.
--
--    Raderna med is_premium = true lämnas kvar med flit: verifiera
--    först att de kopierats till offers innan du rör dem.
-- ------------------------------------------------------------

-- alter table public.business_stories
--   drop column if exists savings_label,
--   drop column if exists savings_value,
--   drop column if exists offer_category,
--   drop column if exists redemption_limit,
--   drop column if exists redemption_interval;
