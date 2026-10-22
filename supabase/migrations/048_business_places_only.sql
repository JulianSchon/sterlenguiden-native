-- Företagsportalen: bara företag kan tas över, och hela historiken i Admin. Kör i Supabase → SQL
-- Editor (efter 046 och 047). Går att köra flera gånger.
--
-- 1. places.is_business: är platsen ett företag (restaurang, hotell, butik …) eller bara en plats
--    (strand, kyrka, utsiktsplats)? Bara företag visar "Är det här ditt företag?". Fylls i en gång
--    nedan efter kategori; ändra sedan själv i Table Editor (places → is_business) där det blivit fel.
-- 2. Admin visar alla förfrågningar, inte bara de senaste 30 dagarna (de 500 senaste).
-- 3. place_claims_overview: alla förfrågningar som en lättläst lista i Table Editor.

alter table public.places add column if not exists is_business boolean;

-- Första gången: företag om kategorin är en företagskategori, eller om platsen har egen e-post,
-- telefon eller hemsida. Natur och sevärdheter utan kontaktuppgifter räknas som platser.
update public.places set is_business = (
  coalesce(categories, '') ~* '(mat|dryck|hotell|b&b|boende|caf|bageri|butik|gårdsbutik|shopping|hantverk|design)'
  or nullif(btrim(coalesce(email, '')), '') is not null
  or nullif(btrim(coalesce(phone, '')), '') is not null
  or nullif(btrim(coalesce(website_url, '')), '') is not null
)
where is_business is null;

alter table public.places alter column is_business set default true;
update public.places set is_business = true where is_business is null;
alter table public.places alter column is_business set not null;

create or replace function public.business_claim_info(p_place_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pl record;
  v_role text;
  v_has_owner boolean;
  v_pending text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select id, name, nearest_town, image_url, logo_url, email, claim_link_hidden, is_business into v_pl from public.places where id = p_place_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select role into v_role from public.place_members where place_id = p_place_id and user_id = v_uid;
  v_has_owner := exists (select 1 from public.place_members where place_id = p_place_id and role = 'owner');
  select kind into v_pending from public.place_claims
  where place_id = p_place_id and user_id = v_uid and status = 'pending' order by created_at desc limit 1;
  return jsonb_build_object(
    'place', jsonb_build_object('id', v_pl.id, 'name', v_pl.name, 'town', v_pl.nearest_town, 'image_url', v_pl.image_url, 'logo_url', v_pl.logo_url),
    'role', v_role,
    'has_owner', v_has_owner,
    'link_hidden', v_pl.claim_link_hidden,
    'is_business', v_pl.is_business,
    'pending', v_pending,
    'email', case when public.app_email_ready() and public.bp_is_email(btrim(v_pl.email)) then btrim(v_pl.email) end,
    'adult', public.bp_adult(v_uid),
    'code_active', exists (
      select 1 from public.place_claim_codes c
      where c.place_id = p_place_id and c.user_id = v_uid and c.used_at is null and c.expires_at > now() and c.attempts < 5
    )
  );
end $$;

create or replace function public.business_claim_send_code(p_place_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pl record;
  v_email text;
  v_code text;
  v_last timestamptz;
  v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select id, name, email, is_business into v_pl from public.places where id = p_place_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not v_pl.is_business then return jsonb_build_object('ok', false, 'reason', 'not_business'); end if;
  if exists (select 1 from public.place_members where place_id = p_place_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'is_member');
  end if;
  if exists (select 1 from public.place_members where place_id = p_place_id and role = 'owner') then
    return jsonb_build_object('ok', false, 'reason', 'has_owner');
  end if;
  if not public.bp_adult(v_uid) then return jsonb_build_object('ok', false, 'reason', 'not_adult'); end if;
  v_email := btrim(v_pl.email);
  if not public.bp_is_email(v_email) then return jsonb_build_object('ok', false, 'reason', 'no_email'); end if;
  if not public.app_email_ready() then return jsonb_build_object('ok', false, 'reason', 'email_off'); end if;

  -- En i taget per plats, så gränserna håller även om två trycker samtidigt
  perform pg_advisory_xact_lock(hashtextextended('claim:' || p_place_id::text, 0));

  select max(created_at) into v_last from public.place_claim_codes where place_id = p_place_id and user_id = v_uid;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'wait',
      'seconds', greatest(1, ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::int));
  end if;
  if (select count(*) from public.place_claim_codes where place_id = p_place_id and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_place');
  end if;
  if (select count(*) from public.place_claim_codes where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_user');
  end if;

  -- Sex slumpade siffror (gen_random_uuid använder serverns säkra slump)
  v_code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))::bit(24)::int) % 1000000)::text, 6, '0');
  update public.place_claim_codes set expires_at = now()
  where place_id = p_place_id and user_id = v_uid and used_at is null and expires_at > now();
  insert into public.place_claim_codes (place_id, user_id, code_hash, sent_to, expires_at)
  values (p_place_id, v_uid,
          encode(sha256(convert_to(v_code || ':' || v_uid::text || ':' || p_place_id::text, 'UTF8')), 'hex'),
          v_email, now() + interval '15 minutes');

  v_name := public.bp_display_name(v_uid);
  perform public.send_app_email(
    v_email,
    'Er kod för ' || v_pl.name || ' i Österlenappen',
    'Er kod till Österlenappen',
    '<p><b>' || public.bp_html(v_name) || '</b> vill ta hand om <b>' || public.bp_html(v_pl.name)
      || '</b> i Österlenappen – öppettider, bilder, erbjudanden och evenemang. Det kostar ingenting.</p>'
      || '<p>Skriv in koden i appen. Den gäller i 15 minuter.</p>'
      || '<p style="color:#7A6F55">Var det inte ni som bad om koden? Då kan ni bortse från mejlet – inget händer.</p>',
    v_code
  );
  return jsonb_build_object('ok', true, 'email', v_email);
end $$;

create or replace function public.business_request_access(
  p_place_id bigint, p_role_title text default null, p_phone text default null, p_message text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pl record;
  v_has_owner boolean;
  v_kind text;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select id, name, claim_link_hidden, is_business into v_pl from public.places where id = p_place_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not v_pl.is_business then return jsonb_build_object('ok', false, 'reason', 'not_business'); end if;
  if exists (select 1 from public.place_members where place_id = p_place_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'is_member');
  end if;
  v_has_owner := exists (select 1 from public.place_members where place_id = p_place_id and role = 'owner');
  if v_has_owner and v_pl.claim_link_hidden then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  v_kind := case when v_has_owner then 'join' else 'claim' end;
  if v_kind = 'claim' and not public.bp_adult(v_uid) then return jsonb_build_object('ok', false, 'reason', 'not_adult'); end if;
  if char_length(coalesce(v_msg, '')) > 600 then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if exists (
    select 1 from public.place_claims
    where user_id = v_uid and place_id = p_place_id and kind = v_kind and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;
  if (select count(*) from public.place_claims where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  insert into public.place_claims (kind, place_id, user_id, message) values (v_kind, p_place_id, v_uid, v_msg);

  v_name := public.bp_display_name(v_uid);
  if v_kind = 'claim' then
    perform public.bp_email_admins(
      'Ny förfrågan: ' || v_pl.name,
      'Någon vill ta hand om ' || v_pl.name,
      '<p><b>' || public.bp_html(v_name) || '</b> vill sköta <b>' || public.bp_html(v_pl.name) || '</b> i Österlenappen.</p>'
        || coalesce('<p>”' || public.bp_html(v_msg) || '”</p>', '')
        || '<p>Vänta på ett mejl från företagets egen adress innan du godkänner. Godkänn i appen: Inställningar → Admin.</p>'
    );
  else
    perform public.bp_email_owners(
      p_place_id,
      v_name || ' vill gå med i ' || v_pl.name,
      v_name || ' vill hjälpa till med ' || v_pl.name,
      '<p><b>' || public.bp_html(v_name) || '</b> vill kunna sköta <b>' || public.bp_html(v_pl.name) || '</b> i Österlenappen.</p>'
        || coalesce('<p>”' || public.bp_html(v_msg) || '”</p>', '')
        || '<p>Godkänn eller neka i appen: Inställningar → Mitt företag → Personal.</p>'
    );
  end if;
  return jsonb_build_object('ok', true, 'kind', v_kind);
end $$;

create or replace function public.admin_requests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'status', c.status, 'created_at', c.created_at, 'decided_at', c.decided_at,
      'role_title', c.role_title, 'phone', c.phone, 'message', c.message, 'new_place', c.new_place,
      'place', case when pl.id is null then null else jsonb_build_object(
        'id', pl.id, 'name', pl.name, 'town', pl.nearest_town, 'email', pl.email, 'phone', pl.phone,
        'image_url', pl.image_url, 'logo_url', pl.logo_url) end,
      'owners', (select count(*) from public.place_members m where m.place_id = c.place_id and m.role = 'owner'),
      'user', jsonb_build_object('id', c.user_id, 'name', pr.display_name, 'username', pr.username, 'email', u.email, 'since', u.created_at)
    ) order by (c.status = 'pending') desc, c.created_at desc)
    from (
      select * from public.place_claims
      where kind in ('claim', 'new_place')
      order by created_at desc limit 500
    ) c
    left join public.places pl on pl.id = c.place_id
    left join public.profiles pr on pr.user_id = c.user_id
    left join auth.users u on u.id = c.user_id
  ), '[]'::jsonb);
end $$;

create or replace view public.place_claims_overview
with (security_invoker = true) as
select
  c.created_at                                  as "Skickad",
  case c.kind when 'claim' then 'Ta hand om' when 'join' then 'Gå med' else 'Nytt företag' end as "Vad",
  coalesce(p.name, c.new_place ->> 'name')      as "Plats",
  coalesce(pr.display_name, pr.username)        as "Vem",
  u.email                                       as "E-post",
  case c.status when 'pending' then 'Väntar' when 'approved' then 'Godkänd' when 'rejected' then 'Nekad' else 'Återtagen' end as "Status",
  c.decided_at                                  as "Avgjord",
  c.message                                     as "Meddelande",
  c.id
from public.place_claims c
left join public.places p on p.id = c.place_id
left join public.profiles pr on pr.user_id = c.user_id
left join auth.users u on u.id = c.user_id
order by c.created_at desc;

revoke all on public.place_claims_overview from anon, authenticated;
