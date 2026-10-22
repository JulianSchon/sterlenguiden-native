-- Säkerhetsgenomgången inför 1.0. Kör i Supabase → SQL Editor (efter 051). Går att köra flera gånger.
--
-- 1. Inget fusk med besök: en incheckning sparas bara via check_in(), som räknar avståndet till
--    platsen på servern och sätter tiden själv. Topplistor, ringar och kort räknas ur besöken.
-- 2. Inget fusk med streaken: en dag som sparas blir alltid dagens datum.
-- 3. Inget fusk med troféer: databasen räknar själv efter att en trofé verkligen är klar.
-- 4. Koder (gåvokort, listor) kan inte gissas: högst 10 fel försök per timme.
-- 5. Utloggade (anon) kommer inte åt någonting. Interna funktioner går inte att anropa utifrån.
-- 6. Rester från den gamla webbversionen flyttas till schemat arkiv (syns inte i appen eller API:t).
-- 7. Snabbare regler (auth.uid() räknas en gång per fråga), inga dubbla regler eller index.

-- ── 1. Incheckning ──────────────────────────────────────────────────────────────

-- Hur långt bort man får stå: appen släpper knappen inom 100 m, och lite till för GPS:ens osäkerhet
create or replace function public.check_in(p_place_id bigint, p_lat double precision, p_lng double precision)
returns public.visits language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p public.places;
  v public.visits;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into p from public.places where id = p_place_id;
  if p.id is null or p.lat is null or p.lng is null or p.checkin_enabled is false then
    raise exception 'checkin_unavailable';
  end if;
  if p_lat is null or p_lng is null or 2 * 6371000 * asin(sqrt(
       power(sin(radians(p_lat - p.lat) / 2), 2) +
       cos(radians(p.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - p.lng) / 2), 2))) > 150 then
    raise exception 'too_far';
  end if;
  -- Två tryck samtidigt ska inte bli två besök (spärren i visits_cooldown ser inte varandra)
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':visit:' || p.id, 0));
  insert into public.visits (user_id, place_id, visited_at, method)
  values (v_uid, p.id, now(), 'gps')
  returning * into v;
  return v;
end $$;

drop policy if exists "Users can insert their own visits" on public.visits;
revoke insert, update on public.visits from anon, authenticated;

-- ── 2. Streaken ─────────────────────────────────────────────────────────────────

create or replace function public.app_days_today()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Bara när en användare sparar (i SQL Editor går det att rätta för hand)
  if auth.uid() is not null then
    new.day := (now() at time zone 'Europe/Stockholm')::date;
  end if;
  return new;
end $$;

drop trigger if exists app_days_today on public.app_days;
create trigger app_days_today before insert or update on public.app_days
  for each row execute function public.app_days_today();

-- ── 3. Troféerna ────────────────────────────────────────────────────────────────

-- Allt en trofé eller ring räknas ur, med samma regler som appen (src/lib/achievements.ts)
create or replace function public.user_trophy_stats(p_user uuid)
returns table (n_visits int, n_favorites int, n_redemptions int, n_swipes int, n_lists int, n_memories int, n_categories int, n_treasures int)
language sql stable security definer set search_path = public as $$
  select
    (select count(distinct place_id)::int from visits where user_id = p_user),
    (select count(*)::int from favorites where user_id = p_user),
    (select count(distinct offer_id)::int from offer_redemptions where user_id = p_user),
    (select count(*)::int from (
      select place_id from discovery_dismissals where user_id = p_user
      union
      select place_id from discovery_likes where user_id = p_user
    ) s),
    (select count(*)::int from lists where owner_id = p_user),
    (select count(*)::int from memories where user_id = p_user),
    -- Kategorierna: en del av platsens kategorier är lika med, innehåller eller ingår i ett av
    -- kategorins databasvärden
    (select count(*)::int from (values
        (1, array['mat', 'mat & dryck']),
        (2, array['café & bageri', 'cafe & bageri']),
        (3, array['hotell & b&b', 'boende']),
        (4, array['butiker', 'gårdsbutik']),
        (5, array['natur', 'natur & upplevelser']),
        (6, array['aktiviteter']),
        (7, array['sevärdheter', 'konst']),
        (8, array['hantverk & service', 'hantverk'])
      ) as g(id, db_values)
      where exists (
        select 1
        from visits v
        join places pl on pl.id = v.place_id
        cross join lateral unnest(string_to_array(lower(coalesce(pl.categories, '')), ',')) as part(raw)
        cross join lateral unnest(g.db_values) as dv(val)
        where v.user_id = p_user
          and trim(part.raw) <> ''
          and (trim(part.raw) = dv.val or trim(part.raw) like '%' || dv.val || '%' or dv.val like '%' || trim(part.raw) || '%')
      )),
    (select count(*)::int from user_collectibles where user_id = p_user)
$$;

create or replace function public.achievement_met(p_user uuid, p_type text, p_level text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  i int := array_position(array['bronze', 'silver', 'gold'], p_level);
begin
  if i is null then return false; end if;
  select * into s from public.user_trophy_stats(p_user);
  return case p_type
    when 'kom-igang' then (array[s.n_visits >= 1, s.n_lists >= 1, s.n_memories >= 1])[i]
    when 'utforskaren' then s.n_visits >= (array[5, 20, 50])[i]
    when 'samlaren' then s.n_favorites >= (array[5, 15, 30])[i]
    when 'formansjagaren' then s.n_redemptions >= (array[1, 3, 6])[i]
    when 'mangsidig' then s.n_categories >= (array[3, 5, 8])[i]
    when 'bladdraren' then s.n_swipes >= (array[15, 60, 150])[i]
    when 'osterlenlegend' then s.n_visits >= (array[1, 10, 30])[i]
      and s.n_favorites >= (array[1, 5, 15])[i] and s.n_redemptions >= (array[1, 2, 5])[i]
    else false
  end;
end $$;

create or replace function public.achievements_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Bara när en användare sparar (i SQL Editor går det att rätta för hand)
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' or not public.achievement_met(new.user_id, new.achievement_type, new.level) then
    raise exception 'achievement_locked';
  end if;
  new.category := null;
  new.unlocked_at := now();
  new.created_at := now();
  return new;
end $$;

drop trigger if exists achievements_guard on public.achievements;
create trigger achievements_guard before insert or update on public.achievements
  for each row execute function public.achievements_guard();

-- Ringarna räknas ur samma siffror
create or replace function public.ring_requirement_met(p_user uuid, p_ring text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  s record;
begin
  if p_ring is null or p_ring = 'none' then return true; end if;
  select * into s from public.user_trophy_stats(p_user);
  return case p_ring
    when 'gris' then s.n_treasures >= 6
    when 'far' then s.n_treasures >= 12
    when 'ko' then s.n_treasures >= 18
    when 'kronhjort' then s.n_visits >= 50 and s.n_favorites >= 30 and s.n_redemptions >= 6
      and s.n_categories >= 8 and s.n_swipes >= 150 and s.n_lists >= 1 and s.n_memories >= 1
    else false
  end;
end $$;

-- Ring och kortfärg kontrolleras också när profilen skapas, inte bara när den ändras
create or replace function public.profiles_check_avatar_ring()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.ring_requirement_met(new.user_id, new.avatar_ring) then
      raise exception 'ring_locked' using errcode = 'P0001';
    end if;
  elsif new.avatar_ring is distinct from old.avatar_ring
     and not public.ring_requirement_met(new.user_id, new.avatar_ring) then
    raise exception 'ring_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.profiles_check_card_color()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changed boolean;
begin
  if tg_op = 'INSERT' then v_changed := true; else v_changed := new.card_color is distinct from old.card_color; end if;
  if v_changed
     and new.card_color is not null
     and new.card_color not in ('forest', 'rapeseed', 'ocean', 'grapes', 'obsidian', 'copper', 'sand')
     and not exists (select 1 from public.user_cards where user_id = new.user_id and card_id = new.card_color) then
    raise exception 'card_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists profiles_check_avatar_ring on public.profiles;
create trigger profiles_check_avatar_ring before insert or update on public.profiles
  for each row execute function public.profiles_check_avatar_ring();
drop trigger if exists profiles_check_card_color on public.profiles;
create trigger profiles_check_card_color before insert or update on public.profiles
  for each row execute function public.profiles_check_card_color();

-- ── 4. Koder som inte går att gissa ─────────────────────────────────────────────

create table if not exists public.code_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists code_attempts_user_idx on public.code_attempts (user_id, kind, at desc);
alter table public.code_attempts enable row level security;
revoke all on public.code_attempts from anon, authenticated;

create or replace function public.code_attempts_left(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 10 from public.code_attempts
  where user_id = auth.uid() and kind = p_kind and at > now() - interval '1 hour'
$$;

-- Fel kod ger null (i stället för ett fel), så att försöket hinner sparas
create or replace function public.join_list(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.code_attempts_left('list') then raise exception 'too_many_attempts'; end if;
  select id into l from lists where invite_code = upper(trim(code));
  if l is null then
    insert into public.code_attempts (user_id, kind) values (auth.uid(), 'list');
    return null;
  end if;
  insert into list_members (list_id, user_id) values (l, auth.uid()) on conflict do nothing;
  return l;
end $$;

create or replace function public.redeem_pass_code(_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));
  v_gift public.pass_gifts%rowtype;
  v_profile public.profiles%rowtype;
  v_days integer;
  v_eff_until timestamptz;
  v_live boolean;
  v_start timestamptz;
  v_until timestamptz;
  v_from text;
begin
  if v_user is null then
    raise exception 'Du måste vara inloggad.';
  end if;
  if not public.code_attempts_left('gift') then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  select * into v_gift from public.pass_gifts where upper(claim_code) = v_code for update;
  if not found then
    insert into public.code_attempts (user_id, kind) values (v_user, 'gift');
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v_gift.claimed_by is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  select days into v_days from public.pass_products where id = v_gift.period;
  v_days := coalesce(v_days, case v_gift.period
    when 'week' then 7 when 'month' then 30 when 'quarter' then 90 when 'year' then 365 else 30 end);

  select * into v_profile from public.profiles where user_id = v_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  -- Sista dagen med åtkomst: inte förnyande pass räknar in sparade dagar
  v_eff_until := case
    when v_profile.member_until is null then null
    when v_profile.member_auto_renew then v_profile.member_until
    else v_profile.member_until + make_interval(days => v_profile.member_bonus_days)
  end;
  v_live := coalesce(v_profile.is_member, false) and (v_eff_until is null or v_eff_until >= now());

  if v_live and v_eff_until is null then
    return jsonb_build_object('ok', false, 'reason', 'unlimited');
  end if;

  if v_live and v_profile.member_auto_renew then
    -- Förnyande pass: gåvan väntar tills passet slutar förnyas
    update public.profiles
      set member_bonus_days = member_bonus_days + v_days, updated_at = now()
      where user_id = v_user;
    v_until := null;
  elsif v_live then
    -- Pass som inte förnyas: tiden läggs på
    v_until := v_eff_until + make_interval(days => v_days);
    update public.profiles
      set member_until = v_until, member_bonus_days = 0, member_period = v_gift.period, updated_at = now()
      where user_id = v_user;
  else
    -- Inget pass: startar nu (eller på gåvans aktiveringsdatum)
    v_start := greatest(now(), coalesce(v_gift.activation_date::timestamptz, now()));
    v_until := v_start + make_interval(days => v_days);
    update public.profiles
      set is_member = true, member_period = v_gift.period, member_started_at = v_start,
          member_until = v_until, member_auto_renew = false, member_bonus_days = 0, updated_at = now()
      where user_id = v_user;
  end if;

  update public.pass_gifts
    set claimed_by = v_user, claimed_at = now(), status = 'claimed'
    where id = v_gift.id;

  -- Vem gåvan är från (bara när någon annan köpt den)
  if v_gift.buyer_id is distinct from v_user then
    select nullif(trim(display_name), '') into v_from from public.profiles where user_id = v_gift.buyer_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'period', v_gift.period, 'days', v_days,
    'member_until', v_until, 'saved', v_live and v_profile.member_auto_renew,
    'from_name', v_from, 'message', nullif(trim(coalesce(v_gift.message, '')), '')
  );
end $$;

-- Sökningen på användarnamn: bara inloggade, och % eller _ i sökningen betyder bara sig själva
-- (annars gick det att lista alla användare med "%%")
create or replace function public.rpc_search_users(q text)
returns table (user_id uuid, username text, display_name text, city text, circle_color text, avatar_ring text,
  is_member boolean, card_color text, member_since timestamp with time zone, friendship_id uuid, status text, direction text)
language sql stable security definer set search_path = public as $$
  select
    p.user_id,
    p.username,
    p.display_name,
    p.city,
    p.circle_color,
    p.avatar_ring,
    coalesce(p.is_member, false),
    p.card_color,
    p.created_at,
    f.id,
    f.status,
    case
      when f.id is null then null
      when f.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end
  from public.profiles p
  left join public.friendships f
    on (f.requester_id = auth.uid() and f.addressee_id = p.user_id)
    or (f.addressee_id = auth.uid() and f.requester_id = p.user_id)
  where auth.uid() is not null
    and p.username is not null
    and length(coalesce(q, '')) >= 2
    and p.username ilike replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    and p.user_id <> auth.uid()
  order by p.username
  limit 20;
$$;

-- ── 5. Vem kommer åt vad ────────────────────────────────────────────────────────

-- Appen kräver inloggning: utloggade (anon) behöver inga tabeller och inga funktioner
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Funktioner som bara databasen själv använder (triggers och interna hjälpare) går inte att anropa
revoke execute on function
  public.add_owner_as_member(), public.enforce_visit_cooldown(), public.grant_treasure_card(),
  public.revoke_treasure_card(), public.handle_new_user(), public.limit_place_suggestions(),
  public.offer_redemptions_check_rules(), public.offer_redemptions_set_time(), public.place_reports_limit(),
  public.places_touch_info_updated_at(), public.profiles_card_photo_guard(), public.profiles_check_avatar_ring(),
  public.profiles_check_card_color(), public.profiles_guard(), public.profiles_insert_guard(),
  public.profiles_membership_guard(), public.recheck_avatar_ring(), public.reset_card_color(),
  public.update_updated_at_column(), public.ring_requirement_met(uuid, text), public.app_days_today(),
  public.achievements_guard(), public.user_trophy_stats(uuid), public.achievement_met(uuid, text, text),
  public.code_attempts_left(text), public.has_all_treasures(uuid)
from authenticated;

grant execute on function public.check_in(bigint, double precision, double precision) to authenticated;
grant execute on function public.join_list(text) to authenticated;
grant execute on function public.redeem_pass_code(text) to authenticated;
grant execute on function public.rpc_search_users(text) to authenticated;

-- Funktioner utan fast sökväg (search_path) kan luras att använda någon annans tabell med samma namn
alter function public.bp_is_phone(text) set search_path = public;
alter function public.bp_html(text) set search_path = public;
alter function public.bp_images(text) set search_path = public;
alter function public.bp_media_prefix(bigint) set search_path = public;
alter function public.bp_clean_exceptions(jsonb) set search_path = public;
alter function public.bp_default_permissions() set search_path = public;
alter function public.bp_text(jsonb, text, integer) set search_path = public;
alter function public.bp_url(jsonb, text) set search_path = public;
alter function public.bp_is_email(text) set search_path = public;
alter function public.limit_place_suggestions() set search_path = public;
alter function public.enforce_visit_cooldown() set search_path = public;
alter function public.profiles_membership_guard() set search_path = public;
alter function public.offer_redemptions_set_time() set search_path = public;
alter function public.profiles_guard() set search_path = public;
alter function public.places_touch_info_updated_at() set search_path = public;
alter function public.profiles_insert_guard() set search_path = public;
alter function public.profiles_card_photo_guard() set search_path = public;

-- Nyheter: administratören kollas med is_app_admin() (has_role tog emot vem som helst som argument)
drop policy if exists "Admins can read all news" on public.news;
drop policy if exists "Public can read published news" on public.news;
drop policy if exists "Läsa nyheter" on public.news;
create policy "Läsa nyheter" on public.news for select to authenticated using (is_published or public.is_app_admin());
drop policy if exists "Admins can insert news" on public.news;
create policy "Admins can insert news" on public.news for insert to authenticated with check (public.is_app_admin());
drop policy if exists "Admins can update news" on public.news;
create policy "Admins can update news" on public.news for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists "Admins can delete news" on public.news;
create policy "Admins can delete news" on public.news for delete to authenticated using (public.is_app_admin());

-- Dubbla regler blir en
drop policy if exists "Alla kan läsa berättelser" on public.business_stories;
drop policy if exists "Anyone can read all stories" on public.business_stories;
drop policy if exists "Business users can read their own stories" on public.business_stories;
drop policy if exists "Inloggade kan läsa stories" on public.business_stories;
create policy "Inloggade kan läsa stories" on public.business_stories for select to authenticated using (true);
drop policy if exists "Alla kan läsa evenemang" on public.events;
drop policy if exists "Enable read access for all users" on public.events;
drop policy if exists "Inloggade kan läsa evenemang" on public.events;
create policy "Inloggade kan läsa evenemang" on public.events for select to authenticated using (true);
drop policy if exists "Enable read access for all users" on public.places;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can insert their own story views" on public.story_views;
drop policy if exists "Users can view their own story views" on public.story_views;

-- Bildmapparna: bara listans ägare lägger ett omslag i listans mapp. Den gamla webbversionens mappar
-- (business-stories, moodboards) går inte längre att ladda upp i; bilderna som finns ligger kvar.
drop policy if exists "Authenticated upload list covers" on storage.objects;
create policy "Authenticated upload list covers" on storage.objects for insert to authenticated
  with check (bucket_id = 'list-covers' and exists (
    select 1 from public.lists l
    where l.id::text = split_part(storage.objects.name, '/', 1) and l.owner_id = (select auth.uid())
  ));
drop policy if exists "Business users can upload story images" on storage.objects;
drop policy if exists "Business users can delete their own story images" on storage.objects;
drop policy if exists "Anyone can view story images" on storage.objects;
drop policy if exists "Authenticated upload moodboard covers" on storage.objects;
drop policy if exists "Users delete own moodboard covers" on storage.objects;
drop policy if exists "Users update own moodboard covers" on storage.objects;
drop policy if exists "moodboards: läsa egna" on storage.objects;

-- Gamla demostories från webbversionen, med bilder som inte finns i appen
delete from public.business_stories where image_url like '/\_\_l5e/%';

-- ── 6. Rester från den gamla webbversionen ──────────────────────────────────────
-- Används inte av appen. Flyttas till schemat arkiv i stället för att tas bort, så inget försvinner;
-- arkiv syns inte i API:t. Kan tas bort helt efter lanseringen: drop schema arkiv cascade;

create schema if not exists arkiv;
revoke all on schema arkiv from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'resor', 'resor_feed', 'resor_feed_votes', 'resor_members', 'resor_places', 'resor_plan_items',
    'resor_plan_slots', 'resor_polls', 'resor_polls_options', 'resor_polls_votes',
    'trip_lists', 'trip_list_members', 'trip_list_places', 'guide_stories', 'daily_questions',
    'user_daily_answers', 'list_cover_options', 'content_translations', 'user_app_opens', 'user_streaks'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema arkiv', t);
    end if;
  end loop;
end $$;

drop function if exists public.handle_new_moodboard() cascade;
drop function if exists public.log_plan_addition_to_feed() cascade;
drop function if exists public.is_moodboard_member(uuid, uuid) cascade;
drop function if exists public.is_moodboard_owner(uuid, uuid) cascade;
drop function if exists public.is_trip_list_member(uuid, uuid) cascade;
drop function if exists public.is_trip_list_owner(uuid, uuid) cascade;
drop function if exists public.can_edit_list(uuid, uuid) cascade;
drop function if exists public.can_view_list(uuid, uuid) cascade;
drop function if exists public.submit_daily_answer(uuid, smallint);
drop function if exists public.get_open_days(date, date);
drop function if exists public.get_streak_days(integer);
drop function if exists public.record_app_open();
drop function if exists public.get_place_audience_stats(bigint);
drop function if exists public.get_place_favorites_count(bigint);
drop function if exists public.get_story_visibility();
drop function if exists public.get_my_story_engagement();

-- has_role användes bara av den gamla webbversionens regler (och tog emot vem som helst)
revoke execute on function public.has_role(uuid, public.app_role) from authenticated;

-- ── 7. Snabbare regler och index ────────────────────────────────────────────────

alter policy "Users can insert their own achievements" on public.achievements with check (((select auth.uid()) = user_id));
alter policy "Users can view their own achievements" on public.achievements using (((select auth.uid()) = user_id));
alter policy "egna dagar: skriva" on public.app_days with check (((select auth.uid()) = user_id));
alter policy "egna dagar: läsa" on public.app_days using (((select auth.uid()) = user_id));
alter policy "Users can delete their own dismissals" on public.discovery_dismissals using (((select auth.uid()) = user_id));
alter policy "Users can insert their own dismissals" on public.discovery_dismissals with check (((select auth.uid()) = user_id));
alter policy "Users can view their own dismissals" on public.discovery_dismissals using (((select auth.uid()) = user_id));
alter policy "Egna högersvep kan sparas" on public.discovery_likes with check (((select auth.uid()) = user_id));
alter policy "Egna högersvep kan läsas" on public.discovery_likes using (((select auth.uid()) = user_id));
alter policy "Users can delete their own favorites" on public.favorites using (((select auth.uid()) = user_id));
alter policy "Users can create their own favorites" on public.favorites with check (((select auth.uid()) = user_id));
alter policy "Users can view their own favorites" on public.favorites using (((select auth.uid()) = user_id));
alter policy "Ta bort egen vänrelation" on public.friendships using ((((select auth.uid()) = requester_id) OR ((select auth.uid()) = addressee_id)));
alter policy "Skicka vänförfrågan" on public.friendships with check ((((select auth.uid()) = requester_id) AND (status = 'pending'::text)));
alter policy "Se egna vänrelationer" on public.friendships using ((((select auth.uid()) = requester_id) OR ((select auth.uid()) = addressee_id)));
alter policy "Acceptera vänförfrågan" on public.friendships using ((((select auth.uid()) = addressee_id) AND (status = 'pending'::text))) with check ((((select auth.uid()) = addressee_id) AND (status = 'accepted'::text)));
alter policy "medlemmar: lämna eller ägaren tar bort" on public.list_members using (((role = 'member'::text) AND ((user_id = (select auth.uid())) OR is_list_owner(list_id))));
alter policy "Sätt egen öppning" on public.list_opens with check ((user_id = (select auth.uid())));
alter policy "Se egna öppningar" on public.list_opens using ((user_id = (select auth.uid())));
alter policy "Uppdatera egen öppning" on public.list_opens using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "platser: lägga till" on public.list_places with check ((is_list_member(list_id) AND (added_by = (select auth.uid()))));
alter policy "lists: ägaren tar bort" on public.lists using ((owner_id = (select auth.uid())));
alter policy "lists: skapa" on public.lists with check ((owner_id = (select auth.uid())));
alter policy "lists: se egna" on public.lists using (((owner_id = (select auth.uid())) OR is_list_member(id)));
alter policy "lists: ägaren ändrar" on public.lists using ((owner_id = (select auth.uid())));
alter policy "Users manage own memories" on public.memories using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "Own preferences: insert" on public.notification_preferences with check ((user_id = (select auth.uid())));
alter policy "Own preferences: select" on public.notification_preferences using ((user_id = (select auth.uid())));
alter policy "Own preferences: update" on public.notification_preferences using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "Egna inlösen kan skapas" on public.offer_redemptions with check (((select auth.uid()) = user_id));
alter policy "Egna inlösen kan läsas" on public.offer_redemptions using (((select auth.uid()) = user_id));
alter policy "Buyer and recipient read gift" on public.pass_gifts using (((buyer_id = (select auth.uid())) OR (claimed_by = (select auth.uid()))));
alter policy "Users read own purchases" on public.pass_purchases using ((user_id = (select auth.uid())));
alter policy "Users can report places" on public.place_reports with check ((user_id = (select auth.uid())));
alter policy "Insert own suggestions" on public.place_suggestions with check ((user_id = (select auth.uid())));
alter policy "Read own suggestions" on public.place_suggestions using ((user_id = (select auth.uid())));
alter policy "Users create own profile" on public.profiles with check ((user_id = (select auth.uid())));
alter policy "Users can view their own profile" on public.profiles using (((select auth.uid()) = user_id));
alter policy "Users can update their own profile" on public.profiles using (((select auth.uid()) = user_id));
alter policy "Users can delete their own story views" on public.story_views using (((select auth.uid()) = user_id));
alter policy "Users add own story views" on public.story_views with check ((user_id = (select auth.uid())));
alter policy "Users read own story views" on public.story_views using ((user_id = (select auth.uid())));
alter policy "Users update own story views" on public.story_views using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "user_cards_read_own" on public.user_cards using (((select auth.uid()) = user_id));
alter policy "samlarobjekt: se egna" on public.user_collectibles using ((user_id = (select auth.uid())));
alter policy "Users can view their own roles" on public.user_roles using (((select auth.uid()) = user_id));
alter policy "Users can delete their own visits" on public.visits using (((select auth.uid()) = user_id));
alter policy "Users can view their own visits" on public.visits using (((select auth.uid()) = user_id));
alter policy "Owner can delete own list covers" on storage.objects using (((bucket_id = 'list-covers'::text) AND (owner = (select auth.uid()))));
alter policy "minnesfoton: ta bort egna" on storage.objects using (((bucket_id = 'memories'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy "Users can upload their own profile image" on storage.objects with check (((bucket_id = 'profile-images'::text) AND (((select auth.uid()))::text = (storage.foldername(name))[1])));
alter policy "minnesfoton: ladda upp egna" on storage.objects with check (((bucket_id = 'memories'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy "List members can view list covers" on storage.objects using (((bucket_id = 'list-covers'::text) AND (EXISTS ( SELECT 1
   FROM lists l
  WHERE (((l.id)::text = split_part(objects.name, '/'::text, 1)) AND ((l.owner_id = (select auth.uid())) OR (EXISTS ( SELECT 1
           FROM list_members lm
          WHERE ((lm.list_id = l.id) AND (lm.user_id = (select auth.uid())) AND (lm.status = 'accepted'::text))))))))));
alter policy "minnesfoton: läsa egna" on storage.objects using (((bucket_id = 'memories'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy "Users can update their own profile image" on storage.objects using (((bucket_id = 'profile-images'::text) AND (((select auth.uid()))::text = (storage.foldername(name))[1]))) with check (((bucket_id = 'profile-images'::text) AND (((select auth.uid()))::text = (storage.foldername(name))[1])));

-- Samma index två gånger
drop index if exists public.idx_favorites_user_id;
drop index if exists public.memories_user_idx;
drop index if exists public.profiles_user_id_unique_idx;
alter table public.story_views drop constraint if exists story_views_user_story_unique;

-- Index för kopplingar som frågas ofta
create index if not exists visits_place_idx on public.visits (place_id);
create index if not exists visits_user_idx on public.visits (user_id, visited_at desc);
create index if not exists user_collectibles_collectible_idx on public.user_collectibles (collectible_id);
create index if not exists user_cards_card_idx on public.user_cards (card_id);
create index if not exists offer_redemptions_offer_idx on public.offer_redemptions (offer_id);
create index if not exists list_places_place_idx on public.list_places (place_id);
create index if not exists list_places_added_by_idx on public.list_places (added_by);
create index if not exists list_opens_list_idx on public.list_opens (list_id);
create index if not exists discovery_likes_place_idx on public.discovery_likes (place_id);
create index if not exists discovery_dismissals_place_idx on public.discovery_dismissals (place_id);
create index if not exists business_stories_place_idx on public.business_stories (place_id);
create index if not exists collectibles_place_idx on public.collectibles (place_id);
create index if not exists favorites_service_point_idx on public.favorites (service_point_id);
create index if not exists news_place_idx on public.news (place_id);
create index if not exists place_reports_user_idx on public.place_reports (user_id);
create index if not exists place_suggestions_user_idx on public.place_suggestions (user_id);
create index if not exists pass_gifts_claimed_by_idx on public.pass_gifts (claimed_by);
