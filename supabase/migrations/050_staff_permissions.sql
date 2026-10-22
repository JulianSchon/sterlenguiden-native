-- Mitt företag: ägaren väljer vad var och en i personalen får göra. Kör i Supabase → SQL Editor
-- (efter 046–049). Går att köra flera gånger.
--
--   stories = lägga upp och ta bort stories      events = skapa, ändra och ta bort evenemang
--   offers  = skapa, ändra och avsluta erbjudanden  info = ändra sidan (öppettider, texter, bilder, kontakt …)
--
-- Ägare får alltid allt. Personal som redan finns (permissions = null) får också allt, tills ägaren
-- ändrar det. Ny personal får allt utom erbjudanden — de påverkar kassan, så det slår ägaren på själv.
-- Databasen kontrollerar det här i varje funktion, så det går inte att gå runt appen.

alter table public.place_members add column if not exists permissions text[];
alter table public.place_invites add column if not exists permissions text[];

create or replace function public.bp_default_permissions()
returns text[] language sql immutable as $$
  select array['stories', 'events', 'info']
$$;

create or replace function public.bp_can(p_place_id bigint, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.place_members
    where place_id = p_place_id and user_id = auth.uid()
      and (role = 'owner' or permissions is null or p_perm = any(permissions))
  )
$$;

create or replace function public.bp_require_permission(p_place_id bigint, p_perm text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.bp_can(p_place_id, p_perm) then
    raise exception 'no_permission:%', p_perm using errcode = 'P0001';
  end if;
end $$;

-- Ägaren ändrar vad någon i personalen får göra
create or replace function public.business_set_member_permissions(p_place_id bigint, p_user_id uuid, p_permissions text[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_role text;
begin
  perform public.bp_require_member(p_place_id, true);
  if p_permissions is null or not (p_permissions <@ array['stories', 'events', 'offers', 'info']) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select role into v_role from public.place_members where place_id = p_place_id and user_id = p_user_id;
  if v_role is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_role = 'owner' then return jsonb_build_object('ok', false, 'reason', 'owner'); end if;
  update public.place_members set permissions = (select coalesce(array_agg(distinct x), '{}') from unnest(p_permissions) x)
  where place_id = p_place_id and user_id = p_user_id;
  perform public.bp_log(p_place_id, 'team');
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.business_invite(bigint, text, text);

create or replace function public.business_update_place(p_place_id bigint, p_patch jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_role text := public.bp_require_member(p_place_id);
  v_cur record;
  v_key text;
  v_days text[] := array['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
  v_amen text[] := array['parking', 'wifi', 'pets', 'outdoor', 'accessible', 'family', 'vegetarian', 'ev', 'booking'];
  v_tastes_all text[] := array['fish', 'homestyle', 'pizza', 'burger', 'asian', 'meat', 'sweets', 'icecream', 'wine', 'beer', 'cheese', 'apples', 'chocolate'];
  v_name text; v_short text; v_desc text; v_phone text; v_email text; v_web text; v_book text; v_fb text; v_ig text; v_stop text;
  v_hours jsonb; v_exc jsonb; v_amenities jsonb; v_cats text; v_sub text; v_tastes text[]; v_images text; v_logo text;
  v_price int; v_hidden boolean;
  v_url text;
  v_list text[];
  v_history text[];
  v_groups text[] := '{}';
  v_out jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid:patch' using errcode = 'P0001'; end if;
  perform public.bp_require_permission(p_place_id, 'info');
  select * into v_cur from public.places where id = p_place_id for update;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(array['name', 'short_description', 'description', 'phone', 'email', 'website_url', 'book_url',
        'facebook_url', 'instagram_url', 'transit_stop_name', 'opening_hours', 'hours_exceptions', 'amenities',
        'categories', 'sub_category', 'tastes', 'image_url', 'logo_url', 'price_level', 'claim_link_hidden'])) then
      raise exception 'invalid:%', v_key using errcode = 'P0001';
    end if;
    v_groups := v_groups || case
      when v_key in ('opening_hours') then 'hours'
      when v_key in ('hours_exceptions') then 'exceptions'
      when v_key in ('name', 'short_description', 'description') then 'about'
      when v_key in ('phone', 'email', 'website_url', 'book_url', 'facebook_url', 'instagram_url', 'transit_stop_name') then 'contact'
      when v_key in ('image_url', 'logo_url') then 'photos'
      when v_key in ('categories', 'sub_category', 'tastes', 'price_level') then 'categories'
      when v_key = 'amenities' then 'amenities'
      else 'settings'
    end;
  end loop;

  if p_patch ? 'name' then
    v_name := btrim(coalesce(p_patch ->> 'name', ''));
    if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'invalid:name' using errcode = 'P0001'; end if;
  end if;
  v_short := public.bp_text(p_patch, 'short_description', 200);
  v_desc := public.bp_text(p_patch, 'description', 4000);
  v_phone := public.bp_text(p_patch, 'phone', 30);
  if v_phone is not null and not public.bp_is_phone(v_phone) then raise exception 'invalid:phone' using errcode = 'P0001'; end if;
  v_email := public.bp_text(p_patch, 'email', 200);
  if v_email is not null and not public.bp_is_email(v_email) then raise exception 'invalid:email' using errcode = 'P0001'; end if;
  v_web := public.bp_url(p_patch, 'website_url');
  v_book := public.bp_url(p_patch, 'book_url');
  v_fb := public.bp_url(p_patch, 'facebook_url');
  v_ig := public.bp_url(p_patch, 'instagram_url');
  v_stop := public.bp_text(p_patch, 'transit_stop_name', 80);

  if p_patch ? 'opening_hours' and jsonb_typeof(p_patch -> 'opening_hours') <> 'null' then
    if jsonb_typeof(p_patch -> 'opening_hours') <> 'object' then raise exception 'invalid:opening_hours' using errcode = 'P0001'; end if;
    if exists (
      select 1 from jsonb_each(p_patch -> 'opening_hours') e
      where not (e.key = any(v_days)) or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 60
    ) then
      raise exception 'invalid:opening_hours' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_object_agg(e.key, btrim(e.value)), '{}'::jsonb) into v_hours
    from jsonb_each_text(p_patch -> 'opening_hours') e where btrim(e.value) <> '';
    if v_hours = '{}'::jsonb then v_hours := null; end if;
  end if;

  if p_patch ? 'hours_exceptions' then v_exc := public.bp_clean_exceptions(p_patch -> 'hours_exceptions'); end if;

  if p_patch ? 'amenities' then
    if jsonb_typeof(p_patch -> 'amenities') <> 'object' or exists (
      select 1 from jsonb_each(p_patch -> 'amenities') e
      where not (e.key = any(v_amen)) or jsonb_typeof(e.value) <> 'boolean'
    ) then
      raise exception 'invalid:amenities' using errcode = 'P0001';
    end if;
    v_amenities := p_patch -> 'amenities';
  end if;

  v_cats := public.bp_text(p_patch, 'categories', 200);
  v_sub := public.bp_text(p_patch, 'sub_category', 300);

  if p_patch ? 'tastes' then
    if jsonb_typeof(p_patch -> 'tastes') <> 'array' then raise exception 'invalid:tastes' using errcode = 'P0001'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_tastes from jsonb_array_elements_text(p_patch -> 'tastes') x;
    if not (v_tastes <@ v_tastes_all) then raise exception 'invalid:tastes' using errcode = 'P0001'; end if;
  end if;

  if p_patch ? 'image_url' then
    if jsonb_typeof(p_patch -> 'image_url') <> 'array' then raise exception 'invalid:image_url' using errcode = 'P0001'; end if;
    select coalesce(array_agg(btrim(x) order by n), '{}') into v_list
    from jsonb_array_elements_text(p_patch -> 'image_url') with ordinality as t(x, n) where btrim(x) <> '';
    if cardinality(v_list) > 10 then raise exception 'too_many:image_url' using errcode = 'P0001'; end if;
    foreach v_url in array v_list loop
      if not public.bp_image_ok(p_place_id, v_url) then raise exception 'invalid:image_url' using errcode = 'P0001'; end if;
    end loop;
    v_images := nullif(array_to_string(v_list, ','), '');
  end if;

  -- Bilder som tas bort (och en utbytt logga) sparas i historiken, så Ångra kan lägga tillbaka dem
  v_history := coalesce(v_cur.image_history, '{}');
  if p_patch ? 'image_url' then
    v_history := v_history || array(select x from unnest(public.bp_images(v_cur.image_url)) x where not (x = any(v_list)));
  end if;
  if p_patch ? 'logo_url' and v_cur.logo_url is not null and v_cur.logo_url is distinct from v_logo then
    v_history := v_history || v_cur.logo_url;
  end if;
  if cardinality(v_history) > 40 then v_history := v_history[cardinality(v_history) - 39:]; end if;

  if p_patch ? 'logo_url' then
    v_logo := nullif(btrim(coalesce(p_patch ->> 'logo_url', '')), '');
    if v_logo is not null and not public.bp_image_ok(p_place_id, v_logo) then raise exception 'invalid:logo_url' using errcode = 'P0001'; end if;
  end if;

  if p_patch ? 'price_level' and jsonb_typeof(p_patch -> 'price_level') <> 'null' then
    v_price := (p_patch ->> 'price_level')::int;
    if v_price < 1 or v_price > 4 then raise exception 'invalid:price_level' using errcode = 'P0001'; end if;
  end if;

  if p_patch ? 'claim_link_hidden' then
    if v_role <> 'owner' then raise exception 'not_owner' using errcode = 'P0001'; end if;
    v_hidden := coalesce((p_patch ->> 'claim_link_hidden')::boolean, false);
  end if;

  update public.places set
    name              = case when p_patch ? 'name' then v_name else name end,
    short_description = case when p_patch ? 'short_description' then v_short else short_description end,
    description       = case when p_patch ? 'description' then v_desc else description end,
    phone             = case when p_patch ? 'phone' then v_phone else phone end,
    email             = case when p_patch ? 'email' then v_email else email end,
    website_url       = case when p_patch ? 'website_url' then v_web else website_url end,
    book_url          = case when p_patch ? 'book_url' then v_book else book_url end,
    facebook_url      = case when p_patch ? 'facebook_url' then v_fb else facebook_url end,
    instagram_url     = case when p_patch ? 'instagram_url' then v_ig else instagram_url end,
    transit_stop_name = case when p_patch ? 'transit_stop_name' then v_stop else transit_stop_name end,
    opening_hours     = case when p_patch ? 'opening_hours' then v_hours else opening_hours end,
    hours_exceptions  = case when p_patch ? 'hours_exceptions' then v_exc else hours_exceptions end,
    amenities         = case when p_patch ? 'amenities' then v_amenities else amenities end,
    categories        = case when p_patch ? 'categories' then v_cats else categories end,
    sub_category      = case when p_patch ? 'sub_category' then v_sub else sub_category end,
    tastes            = case when p_patch ? 'tastes' then v_tastes else tastes end,
    image_url         = case when p_patch ? 'image_url' then v_images else image_url end,
    logo_url          = case when p_patch ? 'logo_url' then v_logo else logo_url end,
    price_level       = case when p_patch ? 'price_level' then v_price else price_level end,
    claim_link_hidden = case when p_patch ? 'claim_link_hidden' then v_hidden else claim_link_hidden end,
    image_history     = v_history
  where id = p_place_id;

  select array_agg(distinct g) into v_groups from unnest(v_groups) g;
  if v_groups is not null then
    for v_key in select unnest(v_groups) loop perform public.bp_log(p_place_id, v_key); end loop;
  end if;

  select to_jsonb(x) into v_out from (
    select id, name, short_description, description, phone, email, website_url, book_url, facebook_url, instagram_url,
           transit_stop_name, opening_hours, hours_exceptions, amenities, categories, sub_category, tastes, image_url,
           logo_url, price_level, claim_link_hidden, info_updated_at
    from public.places where id = p_place_id
  ) x;
  return v_out;
end $$;

create or replace function public.business_save_offer(p_place_id bigint, p_offer jsonb, p_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_title text := btrim(coalesce(p_offer ->> 'title', ''));
  v_desc text := public.bp_text(p_offer, 'description', 400);
  v_label text := public.bp_text(p_offer, 'savings_label', 40);
  v_value int;
  v_cat text := nullif(btrim(coalesce(p_offer ->> 'category', '')), '');
  v_int text := coalesce(nullif(p_offer ->> 'redemption_interval', ''), 'once');
  v_limit int;
  v_exp timestamptz;
  v_img text := nullif(btrim(coalesce(p_offer ->> 'image_url', '')), '');
  v_o record;
  v_new uuid;
begin
  perform public.bp_require_member(p_place_id);
  perform public.bp_require_permission(p_place_id, 'offers');
  if char_length(v_title) < 2 or char_length(v_title) > 60 then raise exception 'invalid:title' using errcode = 'P0001'; end if;
  if p_offer ? 'savings_value' and jsonb_typeof(p_offer -> 'savings_value') <> 'null' then
    v_value := (p_offer ->> 'savings_value')::int;
    if v_value < 0 or v_value > 5000 then raise exception 'invalid:savings_value' using errcode = 'P0001'; end if;
  end if;
  if v_cat is not null and v_cat not in ('Mat & Dryck', 'Hotell & B&B', 'Natur & Upplevelser', 'Butiker') then
    raise exception 'invalid:category' using errcode = 'P0001';
  end if;
  if v_int not in ('once', 'daily', 'weekly', 'monthly', 'unlimited') then raise exception 'invalid:redemption_interval' using errcode = 'P0001'; end if;
  if v_int <> 'once' and p_offer ? 'redemption_limit' and jsonb_typeof(p_offer -> 'redemption_limit') <> 'null' then
    v_limit := (p_offer ->> 'redemption_limit')::int;
    if v_limit < 1 or v_limit > 999 then raise exception 'invalid:redemption_limit' using errcode = 'P0001'; end if;
  end if;
  if p_offer ? 'expires_at' and jsonb_typeof(p_offer -> 'expires_at') <> 'null' then
    v_exp := (p_offer ->> 'expires_at')::timestamptz;
    if v_exp > now() + interval '2 years' then raise exception 'invalid:expires_at' using errcode = 'P0001'; end if;
  end if;
  if v_img is not null and not public.bp_image_ok(p_place_id, v_img) then raise exception 'invalid:image_url' using errcode = 'P0001'; end if;

  if p_id is null then
    if v_exp is not null and v_exp < now() then raise exception 'invalid:expires_at' using errcode = 'P0001'; end if;
    if (select count(*) from public.offers
        where place_id = p_place_id and is_active and (expires_at is null or expires_at > now())) >= 10 then
      raise exception 'too_many:offers' using errcode = 'P0001';
    end if;
    insert into public.offers (place_id, user_id, title, description, image_url, savings_label, savings_value, category,
                               redemption_limit, redemption_interval, expires_at, is_active)
    values (p_place_id, auth.uid(), v_title, v_desc, v_img, v_label, v_value, v_cat, v_limit, v_int, v_exp, true)
    returning id into v_new;
    perform public.bp_log(p_place_id, 'offer');
    return v_new;
  end if;

  select * into v_o from public.offers where id = p_id and place_id = p_place_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.offer_redemptions where offer_id = p_id)
     and (v_o.title, v_o.description, v_o.savings_label, v_o.savings_value, v_o.category, v_o.redemption_interval, v_o.redemption_limit)
         is distinct from (v_title, v_desc, v_label, v_value, v_cat, v_int, v_limit) then
    raise exception 'locked' using errcode = 'P0001';
  end if;
  update public.offers set
    title = v_title, description = v_desc, image_url = v_img, savings_label = v_label, savings_value = v_value,
    category = v_cat, redemption_limit = v_limit, redemption_interval = v_int, expires_at = v_exp, updated_at = now()
  where id = p_id;
  perform public.bp_log(p_place_id, 'offer');
  return p_id;
end $$;

create or replace function public.business_offer_action(p_id uuid, p_action text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_o record;
begin
  select * into v_o from public.offers where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform public.bp_require_member(v_o.place_id);
  perform public.bp_require_permission(v_o.place_id, 'offers');
  if p_action = 'pause' then
    update public.offers set is_active = false, updated_at = now() where id = p_id;
  elsif p_action = 'resume' then
    if v_o.expires_at is not null and v_o.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
    update public.offers set is_active = true, updated_at = now() where id = p_id;
  elsif p_action = 'end' then
    update public.offers set expires_at = now(), updated_at = now() where id = p_id;
  elsif p_action = 'delete' then
    if exists (select 1 from public.offer_redemptions where offer_id = p_id) then
      update public.offers set expires_at = least(coalesce(expires_at, now()), now()), is_active = false, updated_at = now() where id = p_id;
      perform public.bp_log(v_o.place_id, 'offer');
      return jsonb_build_object('ok', true, 'ended', true);
    end if;
    delete from public.offers where id = p_id;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  perform public.bp_log(v_o.place_id, 'offer');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.business_save_event(
  p_place_id bigint, p_event jsonb, p_dates date[] default null, p_id bigint default null, p_scope text default 'one'
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
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
                                 has_parking, series_id, created_by)
      values (v_title, v_desc, v_d, case when v_span is null then null else v_d + v_span end, v_time, v_loc, v_img, v_cat, false,
              p_place_id, v_tickets, v_booking, v_ticket, v_indoor, v_food, v_parking, v_series, v_uid)
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
      end_date = case when v_span is null then null else date + v_span end
    where series_id = v_e.series_id and place_id = p_place_id and date >= least(v_e.date, v_today);
  else
    update public.events set
      title = v_title, description = v_desc, date = v_date, end_date = v_end, time = v_time, location = v_loc,
      image_url = v_img, main_category = v_cat, tickets_required = v_tickets, booking_required = v_booking,
      ticket_url = v_ticket, is_indoor = v_indoor, has_food_drink = v_food, has_parking = v_parking
    where id = p_id;
  end if;
  perform public.bp_log(p_place_id, 'event');
  return jsonb_build_object('ids', jsonb_build_array(p_id), 'series_id', v_e.series_id);
end $$;

create or replace function public.business_delete_event(p_id bigint, p_scope text default 'one')
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_e record;
  v_ids bigint[];
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
begin
  select * into v_e from public.events where id = p_id;
  if not found then return 0; end if;
  perform public.bp_require_member(v_e.place_id);
  perform public.bp_require_permission(v_e.place_id, 'events');
  if p_scope = 'series' and v_e.series_id is not null then
    select array_agg(id) into v_ids from public.events
    where series_id = v_e.series_id and place_id = v_e.place_id and date >= least(v_e.date, v_today);
  else
    v_ids := array[p_id];
  end if;
  delete from public.favorites where event_id = any(v_ids);
  delete from public.events where id = any(v_ids);
  perform public.bp_log(v_e.place_id, 'event');
  return cardinality(v_ids);
end $$;

create or replace function public.business_post_story(p_place_id bigint, p_image_url text, p_caption text default null, p_link jsonb default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_link jsonb;
  v_id uuid;
  v_kind text;
  v_ok boolean := false;
begin
  perform public.bp_require_member(p_place_id);
  perform public.bp_require_permission(p_place_id, 'stories');
  -- Berättelser är alltid nya bilder i platsens egen mapp
  if p_image_url is null or not starts_with(p_image_url, public.bp_media_prefix(p_place_id))
     or not public.bp_image_ok(p_place_id, p_image_url) then
    raise exception 'invalid:image_url' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_caption, '')) > 300 then raise exception 'too_long:caption' using errcode = 'P0001'; end if;
  if p_link is not null and jsonb_typeof(p_link) = 'object' then
    v_kind := p_link ->> 'kind';
    -- Jämförs som text: ett id i fel form ska ge "fel länk", inte ett tekniskt fel
    if v_kind = 'offer' then
      v_ok := exists (select 1 from public.offers where id::text = p_link ->> 'id' and place_id = p_place_id);
    elsif v_kind = 'event' then
      v_ok := exists (select 1 from public.events where id::text = p_link ->> 'id' and place_id = p_place_id);
    end if;
    if v_ok then
      v_link := jsonb_build_object(
        'kind', v_kind, 'id', p_link ->> 'id',
        'x', least(1, greatest(0, coalesce((p_link ->> 'x')::numeric, 0))),
        'y', least(1, greatest(0, coalesce((p_link ->> 'y')::numeric, 0))),
        'w', least(1, greatest(0, coalesce((p_link ->> 'w')::numeric, 0))),
        'h', least(1, greatest(0, coalesce((p_link ->> 'h')::numeric, 0))));
    else
      raise exception 'invalid:link' using errcode = 'P0001';
    end if;
  end if;
  if (select count(*) from public.business_stories where place_id = p_place_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'too_many:stories' using errcode = 'P0001';
  end if;
  insert into public.business_stories (user_id, place_id, image_url, caption, filter, is_premium, expires_at, link)
  values (auth.uid(), p_place_id, p_image_url, v_caption, 'none', false, now() + interval '24 hours', v_link)
  returning id into v_id;
  perform public.bp_log(p_place_id, 'story');
  return v_id;
end $$;

create or replace function public.business_delete_story(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_place bigint;
begin
  select place_id into v_place from public.business_stories where id = p_id;
  if v_place is null then return; end if;
  perform public.bp_require_member(v_place);
  perform public.bp_require_permission(v_place, 'stories');
  delete from public.business_stories where id = p_id;
end $$;

create or replace function public.business_invite(p_place_id bigint, p_email text, p_role text default 'staff', p_permissions text[] default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_place text;
  v_from text;
  v_sent boolean;
begin
  perform public.bp_require_member(p_place_id, true);
  if not public.bp_is_email(v_email) then return jsonb_build_object('ok', false, 'reason', 'invalid_email'); end if;
  if p_role not in ('owner', 'staff') then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if p_permissions is not null and not (p_permissions <@ array['stories', 'events', 'offers', 'info']) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if exists (
    select 1 from public.place_members m join auth.users u on u.id = m.user_id
    where m.place_id = p_place_id and lower(u.email) = v_email
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_member');
  end if;
  if (select count(*) from public.place_invites
      where place_id = p_place_id and accepted_at is null and declined_at is null and expires_at > now()) >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  delete from public.place_invites where place_id = p_place_id and lower(email) = v_email and accepted_at is null;
  insert into public.place_invites (place_id, email, role, invited_by, permissions)
  values (p_place_id, v_email, p_role, auth.uid(), case when p_role = 'staff' then coalesce(p_permissions, public.bp_default_permissions()) end);

  select name into v_place from public.places where id = p_place_id;
  v_from := public.bp_display_name(auth.uid());
  v_sent := public.send_app_email(
    v_email,
    v_from || ' har bjudit in dig till ' || v_place,
    'Du är inbjuden till ' || v_place,
    '<p><b>' || public.bp_html(v_from) || '</b> vill att du hjälper till med <b>' || public.bp_html(v_place)
      || '</b> i Österlenappen – öppettider, bilder, erbjudanden och evenemang.</p>'
      || '<p>Ladda ner Österlenappen och logga in med den här e-postadressen (' || public.bp_html(v_email)
      || '). Inbjudan väntar under Inställningar.</p>'
  );
  perform public.bp_log(p_place_id, 'team');
  return jsonb_build_object('ok', true, 'emailed', v_sent);
end $$;

create or replace function public.business_answer_invite(p_id uuid, p_accept boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_i record;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid;
  select * into v_i from public.place_invites
  where id = p_id and lower(email) = lower(coalesce(v_email, '')) and accepted_at is null and declined_at is null and expires_at > now()
  for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if p_accept then
    insert into public.place_members (place_id, user_id, role, invited_by, permissions)
    values (v_i.place_id, v_uid, v_i.role, v_i.invited_by, case when v_i.role = 'staff' then coalesce(v_i.permissions, public.bp_default_permissions()) end)
    on conflict (place_id, user_id) do update
      set role = case when excluded.role = 'owner' then 'owner' else public.place_members.role end;
    update public.place_invites set accepted_at = now(), accepted_by = v_uid where id = p_id;
    perform public.bp_log(v_i.place_id, 'joined');
  else
    update public.place_invites set declined_at = now() where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'place_id', v_i.place_id);
end $$;

create or replace function public.business_answer_join(p_id uuid, p_accept boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_c record;
  v_place text;
begin
  select * into v_c from public.place_claims where id = p_id and kind = 'join' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform public.bp_require_member(v_c.place_id, true);
  if v_c.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;
  update public.place_claims set status = case when p_accept then 'approved' else 'rejected' end,
    decided_at = now(), decided_by = auth.uid() where id = p_id;
  if p_accept then
    insert into public.place_members (place_id, user_id, role, invited_by, permissions)
    values (v_c.place_id, v_c.user_id, 'staff', auth.uid(), public.bp_default_permissions())
    on conflict (place_id, user_id) do nothing;
    select name into v_place from public.places where id = v_c.place_id;
    perform public.bp_email_user(v_c.user_id,
      'Du kan nu sköta ' || v_place || ' i Österlenappen',
      'Välkommen till ' || v_place || '!',
      '<p>Du har fått tillgång till <b>' || public.bp_html(v_place) || '</b> i Österlenappen.</p>'
        || '<p>Öppna appen och gå till Inställningar → Mitt företag.</p>');
    perform public.bp_log(v_c.place_id, 'team');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.business_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then return jsonb_build_object('places', '[]'::jsonb, 'invites', '[]'::jsonb, 'requests', '[]'::jsonb, 'admin', null); end if;
  select email into v_email from auth.users where id = v_uid;
  return jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'town', p.nearest_town, 'image_url', p.image_url, 'logo_url', p.logo_url,
        'categories', p.categories, 'role', m.role, 'terms_accepted_at', m.terms_accepted_at, 'joined_at', m.created_at,
        'permissions', case when m.role = 'owner' then null else m.permissions end,
        'requests', (select count(*) from public.place_claims c where c.place_id = p.id and c.kind = 'join' and c.status = 'pending')
      ) order by m.created_at)
      from public.place_members m join public.places p on p.id = m.place_id
      where m.user_id = v_uid
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'place_id', p.id, 'place_name', p.name, 'image_url', p.image_url, 'logo_url', p.logo_url,
        'role', i.role, 'invited_by', pr.display_name, 'created_at', i.created_at
      ) order by i.created_at desc)
      from public.place_invites i
      join public.places p on p.id = i.place_id
      left join public.profiles pr on pr.user_id = i.invited_by
      where v_email is not null and lower(i.email) = lower(v_email)
        and i.accepted_at is null and i.declined_at is null and i.expires_at > now()
        and not exists (select 1 from public.place_members m2 where m2.place_id = i.place_id and m2.user_id = v_uid)
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'status', c.status, 'place_id', c.place_id,
        'place_name', coalesce(p.name, c.new_place ->> 'name'), 'created_at', c.created_at
      ) order by c.created_at desc)
      from public.place_claims c left join public.places p on p.id = c.place_id
      where c.user_id = v_uid and (c.status = 'pending' or c.decided_at > now() - interval '14 days')
    ), '[]'::jsonb),
    'admin', case when public.is_app_admin()
      then (select count(*) from public.place_claims where status = 'pending' and kind in ('claim', 'new_place'))
         + (select count(*) from public.place_suggestions where handled_at is null)
      else null end
  );
end $$;

create or replace function public.business_team(p_place_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.bp_require_member(p_place_id);
  return jsonb_build_object(
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', pr.display_name, 'username', pr.username, 'color', pr.circle_color,
        'role', m.role, 'since', m.created_at, 'me', m.user_id = auth.uid(),
        'permissions', case when m.role = 'owner' then null else m.permissions end
      ) order by (m.role = 'owner') desc, m.created_at), '[]'::jsonb)
      from public.place_members m left join public.profiles pr on pr.user_id = m.user_id
      where m.place_id = p_place_id
    ),
    'invites', (
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at)
        order by i.created_at desc), '[]'::jsonb)
      from public.place_invites i
      where i.place_id = p_place_id and i.accepted_at is null and i.declined_at is null and i.expires_at > now()
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.user_id, 'name', pr.display_name, 'username', pr.username,
        'role_title', c.role_title, 'message', c.message, 'created_at', c.created_at
      ) order by c.created_at), '[]'::jsonb)
      from public.place_claims c left join public.profiles pr on pr.user_id = c.user_id
      where c.place_id = p_place_id and c.kind = 'join' and c.status = 'pending'
    ),
    'changes', (
      select coalesce(jsonb_agg(jsonb_build_object('what', q.what, 'at', q.created_at, 'name', q.display_name)
        order by q.created_at desc), '[]'::jsonb)
      from (
        select ch.what, ch.created_at, pr.display_name
        from public.place_changes ch left join public.profiles pr on pr.user_id = ch.user_id
        where ch.place_id = p_place_id
        order by ch.created_at desc limit 15
      ) q
    )
  );
end $$;

revoke execute on function public.bp_default_permissions() from public, anon, authenticated;
revoke execute on function public.bp_can(bigint, text) from public, anon, authenticated;
revoke execute on function public.bp_require_permission(bigint, text) from public, anon, authenticated;
revoke execute on function public.business_set_member_permissions(bigint, uuid, text[]) from public, anon;
grant execute on function public.business_set_member_permissions(bigint, uuid, text[]) to authenticated;
revoke execute on function public.business_invite(bigint, text, text, text[]) from public, anon;
grant execute on function public.business_invite(bigint, text, text, text[]) to authenticated;
