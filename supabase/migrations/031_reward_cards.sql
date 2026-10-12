-- Belöningskort: kortdesigner man inte kan välja fritt utan måste vinna. Kör efter 030.
--
-- Utöver de vanliga designerna (src/lib/cardVariants.ts, fria att välja) finns:
--   skattjagare    Skattjägare — när man hittat alla skatter. Delas ut automatiskt.
--   besok-ÅÅÅÅ-MM  Flest besök en månad (hela appen) — ett eget kort för varje månad
--   besok-ÅÅÅÅ     Flest besök ett år (hela appen) — ett eget kort för varje år
--
-- Topplistekorten delas ut för hand när perioden är slut och vinnaren kontrollerats (flera konton,
-- falska incheckningar) — se award_visits_card längst ner. Delad förstaplats: alla som delar den
-- får kortet. Bara de som syns i topplistan (show_in_leaderboard) kan vinna, som i appen.
--
-- Kortens bilder ligger i den öppna lagringsmappen "cards", så ett nytt kort kräver ingen ny
-- version av appen. Nytt topplistekort:
--   1. Ladda upp bilden till lagringsmappen cards (1200 × 756 px, jpg)
--   2. insert into reward_cards (id, name, kind, period, image_path, bg, bg2, light)
--      values ('besok-2026-10', 'Oktober 2026', 'visits_month', '2026-10', 'besok-2026-10.jpg',
--              '#2A3F29', '#1B3120', false);
--      bg/bg2 = bildens ungefärliga färg upptill/nertill (syns medan bilden laddas),
--      light = true om kortet är ljust (då blir texten mörk)
--   3. När perioden är slut: select * from leaderboard_card_winners('besok-2026-10');  -- kolla
--      select * from award_visits_card('besok-2026-10');                               -- dela ut
--
-- Kortet syns för vinnaren som en present nästa gång appen öppnas (user_cards.seen_at är tom
-- tills presenten öppnats).

-- ─── Korten ──────────────────────────────────────────────────────────────────
create table if not exists public.reward_cards (
  id          text primary key,
  name        text not null,
  kind        text not null check (kind in ('treasures', 'visits_month', 'visits_year')),
  -- 'ÅÅÅÅ-MM' för månadskort, 'ÅÅÅÅ' för årskort, tom för Skattjägare
  period      text check (
    (kind = 'treasures' and period is null)
    or (kind = 'visits_month' and period ~ '^\d{4}-(0[1-9]|1[0-2])$')
    or (kind = 'visits_year' and period ~ '^\d{4}$')
  ),
  -- Filen i lagringsmappen cards; tom = kortet ritas i bg/bg2 tills bilden finns
  image_path  text,
  bg          text not null default '#191918',
  bg2         text not null default '#111111',
  light       boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.reward_cards enable row level security;
drop policy if exists "reward_cards_read" on public.reward_cards;
create policy "reward_cards_read" on public.reward_cards for select using (true);

insert into public.reward_cards (id, name, kind)
values ('skattjagare', 'Skattjägare', 'treasures')
on conflict (id) do nothing;

-- ─── Vem som äger vilket kort ────────────────────────────────────────────────
create table if not exists public.user_cards (
  user_id     uuid not null references auth.users(id) on delete cascade,
  card_id     text not null references public.reward_cards(id) on delete cascade,
  awarded_at  timestamptz not null default now(),
  -- När presenten öppnades i appen; tom = presenten väntar
  seen_at     timestamptz,
  primary key (user_id, card_id)
);

-- Man ser bara sina egna kort och kan inte ge sig själv några (inga insert/update/delete-regler)
alter table public.user_cards enable row level security;
drop policy if exists "user_cards_read_own" on public.user_cards;
create policy "user_cards_read_own" on public.user_cards for select using (auth.uid() = user_id);

-- Presenten har öppnats
create or replace function public.mark_card_seen(p_card_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update user_cards set seen_at = now()
  where user_id = auth.uid() and card_id = p_card_id and seen_at is null;
$$;

grant execute on function public.mark_card_seen(text) to authenticated;

-- ─── Bilderna ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('cards', 'cards', true)
on conflict (id) do nothing;

-- ─── Skattjägare: delas ut när sista skatten hittas, tas bort om en skatt raderas ──
create or replace function public.has_all_treasures(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) > 0 and count(*) = count(uc.collectible_id)
  from collectibles c
  left join user_collectibles uc on uc.collectible_id = c.id and uc.user_id = p_user
  where c.published;
$$;

create or replace function public.grant_treasure_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_all_treasures(new.user_id) then
    insert into user_cards (user_id, card_id) values (new.user_id, 'skattjagare')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists grant_treasure_card on public.user_collectibles;
create trigger grant_treasure_card after insert on public.user_collectibles
  for each row execute function public.grant_treasure_card();

-- Raderas en av ens skatter har man inte längre alla. (Publiceras en NY skatt behåller den som
-- redan är Skattjägare sitt kort — det var förtjänat.)
create or replace function public.revoke_treasure_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_all_treasures(old.user_id) then
    delete from user_cards where user_id = old.user_id and card_id = 'skattjagare';
  end if;
  return old;
end;
$$;

drop trigger if exists revoke_treasure_card on public.user_collectibles;
create trigger revoke_treasure_card after delete on public.user_collectibles
  for each row execute function public.revoke_treasure_card();

-- De som redan har alla skatter får kortet (och presenten) nu
insert into public.user_cards (user_id, card_id)
select distinct uc.user_id, 'skattjagare'
from public.user_collectibles uc
where public.has_all_treasures(uc.user_id)
on conflict do nothing;

-- ─── Fuskskydd: bara egna belöningskort går att välja ────────────────────────
-- Hittills kunde card_color sättas till vad som helst. De vanliga designerna är fria (samma lista
-- som src/lib/cardVariants.ts — lägg till här när en ny vanlig design läggs till); allt annat
-- måste finnas bland ens kort.
create or replace function public.profiles_check_card_color()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.card_color is distinct from old.card_color
     and new.card_color is not null
     and new.card_color not in ('forest', 'rapeseed', 'ocean', 'grapes', 'obsidian', 'copper', 'sand')
     and not exists (select 1 from user_cards where user_id = new.user_id and card_id = new.card_color) then
    raise exception 'card_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_check_card_color on public.profiles;
create trigger profiles_check_card_color
  before update of card_color on public.profiles
  for each row execute function public.profiles_check_card_color();

-- Tas ett kort ifrån någon som har det valt går kortet tillbaka till standarddesignen
create or replace function public.reset_card_color()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set card_color = null where user_id = old.user_id and card_color = old.card_id;
  return old;
end;
$$;

drop trigger if exists reset_card_color on public.user_cards;
create trigger reset_card_color after delete on public.user_cards
  for each row execute function public.reset_card_color();

-- ─── Topplistekorten: vinnarna, och utdelningen ──────────────────────────────
-- Flest unika besökta platser under kortets period (svensk tid), bland dem som syns i topplistan.
-- Samma regel som topplistan i appen (rpc_leaderboard, 027).
create or replace function public.leaderboard_card_winners(p_card_id text)
returns table (user_id uuid, display_name text, username text, visit_count int)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  card reward_cards;
  period_start date;
  period_end date;
begin
  select * into card from reward_cards where id = p_card_id;
  if not found or card.kind not in ('visits_month', 'visits_year') then
    raise exception 'Inget topplistekort med id %', p_card_id;
  end if;
  if card.kind = 'visits_month' then
    period_start := to_date(card.period || '-01', 'YYYY-MM-DD');
    period_end := (period_start + interval '1 month')::date;
  else
    period_start := to_date(card.period || '-01-01', 'YYYY-MM-DD');
    period_end := (period_start + interval '1 year')::date;
  end if;

  return query
  with counts as (
    select p.user_id as uid, p.display_name as dname, p.username as uname,
           count(distinct v.place_id)::int as n
    from profiles p
    join public.visits v on v.user_id = p.user_id
    where p.show_in_leaderboard is true
      and (v.visited_at at time zone 'Europe/Stockholm')::date >= period_start
      and (v.visited_at at time zone 'Europe/Stockholm')::date < period_end
    group by p.user_id, p.display_name, p.username
  )
  select uid, dname, uname, n from counts
  where n = (select max(n) from counts)
  order by dname;
end;
$$;

-- Delar ut kortet till vinnarna (alla som delar förstaplatsen) och visar vilka som fick det.
-- Går att köra igen utan att någon får kortet två gånger.
create or replace function public.award_visits_card(p_card_id text)
returns table (user_id uuid, display_name text, username text, visit_count int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  insert into user_cards (user_id, card_id)
  select w.user_id, p_card_id from public.leaderboard_card_winners(p_card_id) w
  on conflict do nothing;
  return query select * from public.leaderboard_card_winners(p_card_id);
end;
$$;

-- Bara för SQL-redigeraren — appen (och användarna) kan inte dela ut eller titta på vinnare
revoke execute on function public.leaderboard_card_winners(text) from public, anon, authenticated;
revoke execute on function public.award_visits_card(text) from public, anon, authenticated;
revoke execute on function public.has_all_treasures(uuid) from public, anon, authenticated;
