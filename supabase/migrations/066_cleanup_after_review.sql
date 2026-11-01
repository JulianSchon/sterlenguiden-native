-- 066: Städningen efter genomgången av alla tabeller (november 2026)
--
-- Inget i appen ändras av det här: allt nedan antingen tar bort sådant som inte används,
-- stramar åt det som var friare än appen behöver, eller rättar kantfall. Varje del förklaras där
-- den står.

begin;

-- ─── 1. Onödiga standardrättigheter ─────────────────────────────────────────────────────────────
-- Supabase ger inloggade TRUNCATE, TRIGGER och REFERENCES på alla tabeller. API:t kan inte använda
-- dem, men de behövs inte heller. Gäller även tabeller som skapas framöver.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- ─── 2. Rader kvar efter konton som tagits bort direkt i Supabase ──────────────────────────────
-- Tabellerna saknade koppling till kontot, så raderna blev kvar (testkonton). Nu rensas de, och
-- kopplingen läggs till så att allt följer med automatiskt om ett konto tas bort.
delete from public.favorites            t where not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.profiles             t where not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.story_views          t where not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.memories             t where not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.trophies             t where not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.visits               t where not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.discovery_dismissals t where not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.stories              t where not exists (select 1 from auth.users u where u.id = t.user_id);

alter table public.favorites            add constraint favorites_user_id_fkey            foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.profiles             add constraint profiles_user_id_fkey             foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.story_views          add constraint story_views_user_id_fkey          foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.memories             add constraint memories_user_id_fkey             foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.trophies             add constraint trophies_user_id_fkey             foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.visits               add constraint visits_user_id_fkey               foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.discovery_dismissals add constraint discovery_dismissals_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.stories              add constraint stories_user_id_fkey              foreign key (user_id) references auth.users(id) on delete cascade;

-- ─── 3. Konto tas bort: köp, statistik och ändringslogg sparas utan person ──────────────────────
-- Köp måste sparas i 7 år (bokföringslagen); företagens siffror ska inte sjunka i efterhand.
alter table public.pass_purchases alter column user_id drop not null;
CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  r record;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  -- Egna listor tas bort helt (medlemmar och platser följer med)
  delete from public.lists where owner_id = v_user;

  -- Rader i alla tabeller som har en user_id-kolumn
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'user_id'
  loop
    if r.table_name = 'pass_purchases' then
      -- Köp sparas i 7 år (bokföringslagen) men utan koppling till personen
      update public.pass_purchases set user_id = null, card_brand = null, card_last4 = null, note = null
      where user_id = v_user;
    elsif r.table_name in ('place_analytics', 'place_changes') then
      -- Företagens statistik och ändringslogg finns kvar, men inte vem
      execute format('update public.%I set user_id = null where user_id = $1', r.table_name) using v_user;
    else
      execute format('delete from public.%I where user_id = $1', r.table_name) using v_user;
    end if;
  end loop;

  delete from auth.users where id = v_user;
end $function$;

-- ─── 4. Platser som tas bort ──────────────────────────────────────────────────────────────────
-- Bortsvepta platser följer med platsen. Evenemang sparas men tappar kopplingen (Viktors val).
-- (events_place_id_fkey behåller sitt namn — appen hämtar evenemangens plats via det.)
alter table public.discovery_dismissals drop constraint discovery_dismissals_place_id_fkey;
alter table public.discovery_dismissals add constraint discovery_dismissals_place_id_fkey
  foreign key (place_id) references public.places(id) on delete cascade;
alter table public.events drop constraint events_place_id_fkey;
alter table public.events alter column place_id type bigint;
alter table public.events add constraint events_place_id_fkey
  foreign key (place_id) references public.places(id) on delete set null;

-- Samma storlek som platsernas id överallt (var integer)
alter table public.discovery_likes alter column place_id type bigint;
alter table public.offers alter column place_id type bigint;

-- ─── 5. Storyvisningar ─────────────────────────────────────────────────────────────────────────
-- Visningar av stories som tagits bort blev kvar (116 st). Nu följer de med storyn. Att ta bort
-- sina egna visningar behövs inte (appen gör det aldrig).
delete from public.story_views v where not exists (select 1 from public.stories s where s.id = v.story_id);
alter table public.story_views add constraint story_views_story_id_fkey
  foreign key (story_id) references public.stories(id) on delete cascade;
drop policy if exists "Users can delete their own story views" on public.story_views;

-- ─── 6. Stories: 24 timmar betyder 24 timmar ──────────────────────────────────────────────────
-- Utgångna stories gick att läsa direkt ur databasen. Företaget ser sina egna gamla via
-- business_stories_overview. (caption står kvar: storyns texter sparas där när företaget publicerar.)
drop policy if exists "Inloggade kan läsa stories" on public.stories;
create policy "Inloggade kan läsa aktiva stories" on public.stories
  for select to authenticated
  using (expires_at is null or expires_at > now());

-- ─── 7. Bara de kolumner appen faktiskt skriver ────────────────────────────────────────────────
-- Listor: namn, beskrivning, omslag, synlighet.
revoke update on public.lists from authenticated;
grant update (name, description, cover_image_url, visible_to_friends) on public.lists to authenticated;
-- Tips och förslag: datum, status och "hanterat" sätter databasen själv. Förut gick det att sätta
-- datumet bakåt (förbi spärren på 10 per dygn) eller markera sitt tips som redan hanterat.
revoke insert on public.place_reports from authenticated;
grant insert (place_id, user_id, kind, message) on public.place_reports to authenticated;
revoke insert on public.place_suggestions from authenticated;
grant insert (user_id, name, category, location, description, link, is_owner, language) on public.place_suggestions to authenticated;

-- ─── 8. Rimliga gränser ────────────────────────────────────────────────────────────────────────
alter table public.memories add constraint memories_title_length check (char_length(title) <= 100);
alter table public.memories add constraint memories_story_length check (story is null or char_length(story) <= 5000);
alter table public.pass_products add constraint pass_products_price_positive check (price_sek > 0);
alter table public.pass_products add constraint pass_products_days_positive check (days > 0);
alter table public.pass_gifts add constraint pass_gifts_status_check check (status in ('pending', 'claimed'));

-- Födelsedagen: minst 13 år och ett rimligt datum (kollades bara i appen)
create or replace function public.profiles_birth_date_check()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.birth_date is not null
     and (tg_op = 'INSERT' or new.birth_date is distinct from old.birth_date)
     and (new.birth_date > ((now() at time zone 'Europe/Stockholm')::date - interval '13 years')::date
          or new.birth_date < date '1900-01-01') then
    raise exception 'invalid_birth_date';
  end if;
  return new;
end $function$;
drop trigger if exists profiles_birth_date_check on public.profiles;
create trigger profiles_birth_date_check before insert or update on public.profiles
  for each row execute function public.profiles_birth_date_check();

-- ─── 9. Servicepunkter: bara de typer kartan visar ─────────────────────────────────────────────
-- Transport, jour, husdjur, leder och tjänster syntes aldrig (Viktors val: ta bort).
delete from public.service_points where type not in ('Toalett', 'Laddning', 'AutoMat', 'Vård', 'Lekplats');
alter table public.service_points add constraint service_points_type_check
  check (type in ('Toalett', 'Laddning', 'AutoMat', 'Vård', 'Lekplats'));

-- ─── 10. Kodförsök: gamla rader rensas ─────────────────────────────────────────────────────────
-- Bara senaste timmen räknas; det äldre var skräp som bara växte.
create or replace function public.code_attempts_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.code_attempts where user_id = new.user_id and at < now() - interval '1 day';
  return null;
end $function$;
drop trigger if exists code_attempts_cleanup on public.code_attempts;
create trigger code_attempts_cleanup after insert on public.code_attempts
  for each row execute function public.code_attempts_cleanup();

-- ─── 11. Företag utan ägare ────────────────────────────────────────────────────────────────────
-- Tar den sista ägaren bort sitt konto syns "Är det här ditt företag?" igen, även om personal finns kvar.
CREATE OR REPLACE FUNCTION public.place_members_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Ingen ägare kvar (även om personal finns kvar): "Är det här ditt företag?" syns igen
  if not exists (select 1 from public.place_members where place_id = old.place_id and role = 'owner') then
    update public.places set claim_link_hidden = false where id = old.place_id;
  end if;
  return null;
end $function$;

-- En ansökan om att ta över blir personal om platsen hunnit få en ägare
CREATE OR REPLACE FUNCTION public.admin_decide_request(p_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c record;
  v_place bigint;
  v_name text;
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  select * into v_c from public.place_requests where id = p_id for update;
  if not found or v_c.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;

  if not p_approve then
    update public.place_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_id;
    perform public.bp_email_user(v_c.user_id,
      'Om din förfrågan i Österlenappen',
      'Vi kunde inte godkänna förfrågan',
      '<p>Vi kunde tyvärr inte godkänna din förfrågan om att sköta ett företag i Österlenappen just nu.</p>'
        || '<p>Har vi missförstått något? Svara på det här mejlet så hjälper vi dig.</p>');
    return jsonb_build_object('ok', true);
  end if;

  if v_c.kind = 'new_place' then
    insert into public.places (name, categories, nearest_town, phone, website_url, claim_link_hidden)
    values (v_c.new_place ->> 'name', nullif(v_c.new_place ->> 'category', ''), nullif(v_c.new_place ->> 'town', ''),
            v_c.phone, nullif(v_c.new_place ->> 'website', ''), true)
    returning id into v_place;
  else
    v_place := v_c.place_id;
  end if;

  -- Har platsen hunnit få en ägare (t.ex. via e-postkoden) medan ansökan väntade blir den som
  -- ansökte personal i stället, så platsen aldrig får två ägare av misstag
  insert into public.place_members (place_id, user_id, role)
  values (v_place, v_c.user_id,
          case when v_c.kind = 'join'
                 or exists (select 1 from public.place_members m
                            where m.place_id = v_place and m.role = 'owner' and m.user_id <> v_c.user_id)
               then 'staff' else 'owner' end)
  on conflict (place_id, user_id) do update set role = excluded.role;
  update public.places set claim_link_hidden = true where id = v_place;
  update public.place_requests set status = 'approved', decided_at = now(), decided_by = auth.uid(), place_id = v_place where id = p_id;

  select name into v_name from public.places where id = v_place;
  perform public.bp_email_user(v_c.user_id,
    'Nu kan du sköta ' || v_name || ' i Österlenappen',
    'Välkommen, ' || v_name || '!',
    '<p>Nu kan du sköta <b>' || public.bp_html(v_name) || '</b> i Österlenappen: öppettider, bilder, erbjudanden, '
      || 'evenemang och berättelser.</p><p>Öppna appen och gå till Inställningar → Mitt företag.</p>');
  return jsonb_build_object('ok', true, 'place_id', v_place);
end $function$;

-- ─── 12. Ansökningsöversikten visar allt som behövs för att besluta ────────────────────────────
create or replace view public.place_requests_overview with (security_invoker = true) as
 SELECT c.created_at AS "Skickad",
        CASE c.kind
            WHEN 'claim'::text THEN 'Ta hand om'::text
            WHEN 'join'::text THEN 'Gå med'::text
            ELSE 'Nytt företag'::text
        END AS "Vad",
    COALESCE(p.name, c.new_place ->> 'name'::text) AS "Plats",
    COALESCE(pr.display_name, pr.username) AS "Vem",
    u.email AS "E-post",
        CASE c.status
            WHEN 'pending'::text THEN 'Väntar'::text
            WHEN 'approved'::text THEN 'Godkänd'::text
            WHEN 'rejected'::text THEN 'Nekad'::text
            ELSE 'Återtagen'::text
        END AS "Status",
    c.decided_at AS "Avgjord",
    c.message AS "Meddelande",
    c.id,
    c.role_title AS "Roll",
    c.phone AS "Telefon",
    c.new_place ->> 'category'::text AS "Kategori",
    c.new_place ->> 'town'::text AS "Ort",
    c.new_place ->> 'website'::text AS "Hemsida"
   FROM place_requests c
     LEFT JOIN places p ON p.id = c.place_id
     LEFT JOIN profiles pr ON pr.user_id = c.user_id
     LEFT JOIN auth.users u ON u.id = c.user_id
  ORDER BY c.created_at DESC;
revoke all on public.place_requests_overview from anon, authenticated;

commit;
