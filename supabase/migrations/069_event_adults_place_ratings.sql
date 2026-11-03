-- 069: 18+ på evenemang, och betyg på platser efter en incheckning (syns bara för företaget)

-- ─── 1. 18+ på evenemang ────────────────────────────────────────────────────────────────────
-- Bara en upplysning som står på evenemanget. Den stoppar ingen från att öppna eller spara det.
alter table public.events add column if not exists is_adults_only boolean not null default false;

CREATE OR REPLACE FUNCTION public.business_save_event(p_place_id bigint, p_event jsonb, p_dates date[] DEFAULT NULL::date[], p_id bigint DEFAULT NULL::bigint, p_scope text DEFAULT 'one'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_cats text[] := array['Musik', 'Matupplevelse', 'Konst & Kultur', 'Marknad', 'Familj', 'Natur', 'Guidning', 'Hälsa & Välmående', 'Övrigt'];
  v_title text := btrim(coalesce(p_event ->> 'title', ''));
  v_desc text := public.bp_text(p_event, 'description', 2000);
  v_time text := public.bp_text(p_event, 'time', 20);
  v_loc text := public.bp_text(p_event, 'location', 120);
  v_img text := nullif(btrim(coalesce(p_event ->> 'image_url', '')), '');
  v_cat text := nullif(btrim(coalesce(p_event ->> 'main_category', '')), '');
  v_tickets boolean := coalesce((p_event ->> 'tickets_required')::boolean, false);
  v_booking boolean := coalesce((p_event ->> 'booking_required')::boolean, false);
  v_indoor boolean := coalesce((p_event ->> 'is_indoor')::boolean, false);
  v_food boolean := coalesce((p_event ->> 'has_food_drink')::boolean, false);
  v_parking boolean := coalesce((p_event ->> 'has_parking')::boolean, false);
  v_child boolean := coalesce((p_event ->> 'is_child_friendly')::boolean, false);
  v_dog boolean := coalesce((p_event ->> 'is_dog_friendly')::boolean, false);
  v_access boolean := coalesce((p_event ->> 'is_accessible')::boolean, false);
  v_adults boolean := coalesce((p_event ->> 'is_adults_only')::boolean, false);
  v_ticket text := public.bp_url(p_event, 'ticket_url');
  v_date date := nullif(p_event ->> 'date', '')::date;
  v_end date := nullif(p_event ->> 'end_date', '')::date;
  v_span int;
  v_series uuid;
  v_dates date[];
  v_d date;
  v_id bigint;
  v_ids bigint[] := '{}';
  v_e record;
begin
  perform public.bp_require_member(p_place_id);
  perform public.bp_require_permission(p_place_id, 'events');
  if char_length(v_title) < 2 or char_length(v_title) > 70 then raise exception 'invalid:title' using errcode = 'P0001'; end if;
  if v_date is null then raise exception 'invalid:date' using errcode = 'P0001'; end if;
  if v_end is not null and (v_end < v_date or v_end - v_date > 30) then raise exception 'invalid:end_date' using errcode = 'P0001'; end if;
  if v_cat is not null and not (v_cat = any(v_cats)) then raise exception 'invalid:main_category' using errcode = 'P0001'; end if;
  if v_img is not null and not public.bp_image_ok(p_place_id, v_img) then raise exception 'invalid:image_url' using errcode = 'P0001'; end if;
  if not (v_tickets or v_booking) then v_ticket := null; end if;
  v_span := case when v_end is null then null else v_end - v_date end;
  -- Utan egen bild får evenemanget platsens första bild
  if v_img is null then
    select (public.bp_images(image_url))[1] into v_img from public.places where id = p_place_id;
  end if;

  if p_id is null then
    select array_agg(distinct x order by x) into v_dates from unnest(coalesce(p_dates, '{}'::date[]) || v_date) x;
    if cardinality(v_dates) > 52 then raise exception 'too_many:dates' using errcode = 'P0001'; end if;
    if exists (select 1 from unnest(v_dates) x where x < v_today - 1 or x > v_today + 730) then
      raise exception 'invalid:date' using errcode = 'P0001';
    end if;
    if (select count(*) from public.events where place_id = p_place_id and coalesce(end_date, date) >= v_today) + cardinality(v_dates) > 200 then
      raise exception 'too_many:events' using errcode = 'P0001';
    end if;
    v_series := case when cardinality(v_dates) > 1 then gen_random_uuid() end;
    foreach v_d in array v_dates loop
      insert into public.events (title, description, date, end_date, time, location, image_url, main_category, is_featured,
                                 place_id, tickets_required, booking_required, ticket_url, is_indoor, has_food_drink,
                                 has_parking, is_child_friendly, is_dog_friendly, is_accessible, is_adults_only, series_id, created_by)
      values (v_title, v_desc, v_d, case when v_span is null then null else v_d + v_span end, v_time, v_loc, v_img, v_cat, false,
              p_place_id, v_tickets, v_booking, v_ticket, v_indoor, v_food, v_parking, v_child, v_dog, v_access, v_adults, v_series, v_uid)
      returning id into v_id;
      v_ids := v_ids || v_id;
    end loop;
    perform public.bp_log(p_place_id, 'event');
    return jsonb_build_object('ids', to_jsonb(v_ids), 'series_id', v_series);
  end if;

  select * into v_e from public.events where id = p_id and place_id = p_place_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_scope = 'series' and v_e.series_id is not null then
    update public.events set
      title = v_title, description = v_desc, time = v_time, location = v_loc, image_url = v_img, main_category = v_cat,
      tickets_required = v_tickets, booking_required = v_booking, ticket_url = v_ticket, is_indoor = v_indoor,
      has_food_drink = v_food, has_parking = v_parking,
      is_child_friendly = v_child, is_dog_friendly = v_dog, is_accessible = v_access, is_adults_only = v_adults,
      end_date = case when v_span is null then null else date + v_span end
    where series_id = v_e.series_id and place_id = p_place_id and date >= least(v_e.date, v_today);
  else
    update public.events set
      title = v_title, description = v_desc, date = v_date, end_date = v_end, time = v_time, location = v_loc,
      image_url = v_img, main_category = v_cat, tickets_required = v_tickets, booking_required = v_booking,
      ticket_url = v_ticket, is_indoor = v_indoor, has_food_drink = v_food, has_parking = v_parking,
      is_child_friendly = v_child, is_dog_friendly = v_dog, is_accessible = v_access, is_adults_only = v_adults
    where id = p_id;
  end if;
  perform public.bp_log(p_place_id, 'event');
  return jsonb_build_object('ids', jsonb_build_array(p_id), 'series_id', v_e.series_id);
end $function$;

-- ─── 2. Betyg efter en incheckning ──────────────────────────────────────────────────────────
-- Ett betyg (1–5) per besök. Det syns aldrig för andra användare, bara som ett snitt för den som
-- sköter platsen, och först när minst 5 har betygsatt (så ingen kan räkna ut vem som gav vad).
create table if not exists public.place_ratings (
  visit_id uuid primary key references public.visits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id bigint not null references public.places(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists place_ratings_place_idx on public.place_ratings (place_id);
alter table public.place_ratings enable row level security;
-- Inga regler: ingen läser eller skriver tabellen direkt, bara genom funktionerna nedan
revoke all on public.place_ratings from public, anon, authenticated;

-- Sätter (eller ändrar) betyget för ett eget besök, högst ett dygn efteråt
create or replace function public.rate_visit(p_visit_id uuid, p_rating int)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_place bigint;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'invalid:rating' using errcode = 'P0001'; end if;
  select place_id into v_place from public.visits
  where id = p_visit_id and user_id = v_uid and visited_at > now() - interval '1 day';
  if v_place is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.place_ratings (visit_id, user_id, place_id, rating)
  values (p_visit_id, v_uid, v_place, p_rating)
  on conflict (visit_id) do update set rating = excluded.rating, created_at = now();
end $$;
revoke execute on function public.rate_visit(uuid, int) from public, anon;
grant execute on function public.rate_visit(uuid, int) to authenticated;

-- Betygen för en plats, för den som sköter den: antal, snitt och hur många av varje.
-- Under 5 betyg visas bara antalet.
create or replace function public.business_place_ratings(p_place_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count int;
  v_avg numeric;
  v_stars jsonb;
  v_recent int;
begin
  perform public.bp_require_member(p_place_id);
  select count(*), round(avg(rating)::numeric, 1) into v_count, v_avg from public.place_ratings where place_id = p_place_id;
  select count(*) into v_recent from public.place_ratings where place_id = p_place_id and created_at > now() - interval '30 days';
  if v_count < 5 then
    return jsonb_build_object('count', v_count, 'average', null, 'stars', null, 'recent', v_recent);
  end if;
  select jsonb_agg(coalesce(c, 0) order by s) into v_stars
  from generate_series(1, 5) s
  left join (select rating, count(*) c from public.place_ratings where place_id = p_place_id group by rating) r on r.rating = s;
  return jsonb_build_object('count', v_count, 'average', v_avg, 'stars', v_stars, 'recent', v_recent);
end $$;
revoke execute on function public.business_place_ratings(bigint) from public, anon;
grant execute on function public.business_place_ratings(bigint) to authenticated;
