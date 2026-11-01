-- 065: Åldersgräns på erbjudanden (18 eller 20 år)
--
-- Ett erbjudande på t.ex. vinprovning eller öl ska inte kunna lösas in av ett barn med pass.
-- Företaget väljer åldersgräns i Mitt företag (ingen, 18 eller 20 år). Inlösen kollar åldern mot
-- födelsedagen på profilen, som låses när den sparats (043), så den går inte att fuska bort. Saknas
-- födelsedag kan man inte lösa in erbjudanden med åldersgräns.
--
-- business_save_offer är samma som tidigare (050) med min_age tillagd; åldersgränsen får ändras
-- även efter att erbjudandet lösts in (den gör villkoren strängare, aldrig lösare för den som redan
-- använt det).

alter table public.offers add column if not exists min_age smallint
  check (min_age is null or min_age in (18, 20));

comment on column public.offers.min_age is 'Åldersgräns för att lösa in: null = ingen, 18 eller 20 år';

CREATE OR REPLACE FUNCTION public.business_save_offer(p_place_id bigint, p_offer jsonb, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_age smallint;
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
  if p_offer ? 'min_age' and jsonb_typeof(p_offer -> 'min_age') <> 'null' then
    v_age := (p_offer ->> 'min_age')::smallint;
    if v_age not in (18, 20) then raise exception 'invalid:min_age' using errcode = 'P0001'; end if;
  end if;

  if p_id is null then
    if v_exp is not null and v_exp < now() then raise exception 'invalid:expires_at' using errcode = 'P0001'; end if;
    if (select count(*) from public.offers
        where place_id = p_place_id and is_active and (expires_at is null or expires_at > now())) >= 10 then
      raise exception 'too_many:offers' using errcode = 'P0001';
    end if;
    insert into public.offers (place_id, user_id, title, description, image_url, savings_label, savings_value, category,
                               redemption_limit, redemption_interval, expires_at, is_active, min_age)
    values (p_place_id, auth.uid(), v_title, v_desc, v_img, v_label, v_value, v_cat, v_limit, v_int, v_exp, true, v_age)
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
    category = v_cat, redemption_limit = v_limit, redemption_interval = v_int, expires_at = v_exp, min_age = v_age, updated_at = now()
  where id = p_id;
  perform public.bp_log(p_place_id, 'offer');
  return p_id;
end $function$;

-- Inlösen: samma regler som förut, plus åldern
create or replace function public.offer_redemptions_check_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  o record;
  used_count int;
  last_at timestamptz;
  max_uses int;
  win interval;
  v_birth date;
begin
  -- Två aktiveringar av samma erbjudande samtidigt (dubbeltryck, två telefoner) får inte båda
  -- slinka igenom: den ena väntar tills den andra är klar
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.offer_id::text, 0));

  select place_id, is_active, expires_at, redemption_limit, redemption_interval, min_age
    into o
  from public.offers
  where id = new.offer_id;

  if not found or not o.is_active or (o.expires_at is not null and o.expires_at < now()) then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;

  if not public.is_active_member(new.user_id) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.place_members m where m.place_id = o.place_id and m.user_id = new.user_id) then
    raise exception 'own_offer' using errcode = 'P0001';
  end if;

  -- Åldersgränsen, räknad på svensk kalenderdag
  if o.min_age is not null then
    select birth_date into v_birth from public.profiles where user_id = new.user_id;
    if v_birth is null
       or v_birth > ((now() at time zone 'Europe/Stockholm')::date - make_interval(years => o.min_age))::date then
      raise exception 'too_young' using errcode = 'P0001';
    end if;
  end if;

  select count(*), max(r.activated_at)
    into used_count, last_at
  from public.offer_redemptions r
  where r.user_id = new.user_id and r.offer_id = new.offer_id;

  -- Samma regler som offerEligibility() i src/lib/offers.ts
  max_uses := coalesce(o.redemption_limit, case when o.redemption_interval = 'once' then 1 end);
  if max_uses is not null and used_count >= max_uses then
    raise exception 'offer_already_used' using errcode = 'P0001';
  end if;

  win := case o.redemption_interval
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'monthly' then interval '30 days'
  end;
  if win is not null and last_at is not null and last_at + win > now() then
    raise exception 'offer_not_yet_available' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
