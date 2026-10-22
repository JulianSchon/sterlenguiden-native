-- Det sista från Supabases kontroll (Advisors) efter 052. Kör i Supabase → SQL Editor (efter 052).
-- Går att köra flera gånger.
--
-- 1. Arkivet (den gamla webbversionens tabeller) blir rena förvaringslådor: inga regler, inga
--    kopplingar och inga index. Schemat är stängt för appen och API:t, så reglerna behövs inte.
-- 2. Tabeller som bara databasens egna funktioner använder får en regel som säger just det.
-- 3. Småsaker: primärnyckel för kodförsöken, pg_trgm ut ur public, index där kopplingar saknade
--    det, och tre index som aldrig kan användas (appen filtrerar de listorna själv).

-- ── 1. Arkivet ──────────────────────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'arkiv' loop
    execute format('drop policy %I on arkiv.%I', r.policyname, r.tablename);
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'arkiv' and c.relkind = 'r' and c.relrowsecurity loop
    execute format('alter table arkiv.%I disable row level security', r.relname);
  end loop;
  for r in select k.conname, c.relname from pg_constraint k join pg_class c on c.oid = k.conrelid
           join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'arkiv' and k.contype = 'f' loop
    execute format('alter table arkiv.%I drop constraint %I', r.relname, r.conname);
  end loop;
  for r in select ic.relname from pg_index i join pg_class ic on ic.oid = i.indexrelid
           join pg_namespace n on n.oid = ic.relnamespace
           where n.nspname = 'arkiv' and not i.indisprimary
             and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid) loop
    execute format('drop index arkiv.%I', r.relname);
  end loop;
end $$;

-- Minnen pekade på den gamla webbversionens resor (kolumnen trip_id används inte av appen)
alter table public.memories drop constraint if exists memories_trip_id_fkey;

-- ── 2. Tabeller som bara databasens funktioner når ──────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'business_analytics', 'code_attempts', 'place_changes', 'place_claim_codes',
    'place_claims', 'place_invites', 'place_members'
  ] loop
    execute format('drop policy if exists "Bara via databasens funktioner" on public.%I', t);
    execute format('create policy "Bara via databasens funktioner" on public.%I for all to authenticated using (false) with check (false)', t);
  end loop;
end $$;

-- is_place_member användes inte av någon regel eller funktion
drop function if exists public.is_place_member(bigint);

-- ── 3. Småsaker ─────────────────────────────────────────────────────────────────

alter table public.code_attempts add column if not exists id bigint generated always as identity;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.code_attempts'::regclass and contype = 'p') then
    alter table public.code_attempts add primary key (id);
  end if;
end $$;

-- Ingen funktion eller index använder pg_trgm, men den ska inte ligga i public
alter extension pg_trgm set schema extensions;

-- Index för kopplingar som saknade det
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists offers_user_idx on public.offers (user_id);
create index if not exists pass_purchases_gift_idx on public.pass_purchases (gift_id);
create index if not exists place_changes_user_idx on public.place_changes (user_id);
create index if not exists place_claims_decided_by_idx on public.place_claims (decided_by);
create index if not exists place_invites_accepted_by_idx on public.place_invites (accepted_by);
create index if not exists place_invites_invited_by_idx on public.place_invites (invited_by);
create index if not exists place_members_invited_by_idx on public.place_members (invited_by);

-- Appen hämtar alla platser, evenemang och erbjudanden och filtrerar dem själv, så de här
-- indexen används aldrig
drop index if exists public.places_moods_idx;
drop index if exists public.events_main_category_idx;
drop index if exists public.offers_active_idx;
