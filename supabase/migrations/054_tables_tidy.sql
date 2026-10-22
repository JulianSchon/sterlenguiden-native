-- Tabellerna inför framtiden. Kör i Supabase → SQL Editor (efter 053). Går att köra flera gånger.
--
-- 1. Fyra tabeller får namn som säger vad de är:
--      business_stories   → stories           (alla stories, från företagen)
--      business_analytics → place_analytics   (visningar och klick på platssidorna)
--      place_claims       → place_requests    (förfrågningar: ta hand om, gå med, nytt företag)
--      achievements       → trophies          (troféerna man klarat)
-- 2. Kolumner som inte används tas bort (mest rester från den gamla webbversionen), liksom
--    telefonnumren i profilerna, som appen aldrig använt.
-- 3. Varje tabell får en beskrivning på svenska, som syns i Supabase (Table Editor).

-- ── 1. Nya namn ─────────────────────────────────────────────────────────────────

alter table if exists public.business_stories rename to stories;
alter table if exists public.business_analytics rename to place_analytics;
alter table if exists public.place_claims rename to place_requests;
alter table if exists public.achievements rename to trophies;
alter view if exists public.place_claims_overview rename to place_requests_overview;

-- Index, regler och kontroller byter också namn, så allt som hör till en tabell börjar med dess namn
do $$
declare
  r record;
  pair text[];
begin
  foreach pair slice 1 in array array[
    ['business_stories', 'stories'], ['business_analytics', 'place_analytics'],
    ['place_claims', 'place_requests'], ['achievements', 'trophies']
  ] loop
    for r in select k.conname, c.relname from pg_constraint k join pg_class c on c.oid = k.conrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = pair[2] and k.conname like pair[1] || '\_%' loop
      execute format('alter table public.%I rename constraint %I to %I', r.relname, r.conname,
        pair[2] || substr(r.conname, length(pair[1]) + 1));
    end loop;
    for r in select ic.relname from pg_index i join pg_class ic on ic.oid = i.indexrelid
             join pg_class t on t.oid = i.indrelid join pg_namespace n on n.oid = t.relnamespace
             where n.nspname = 'public' and t.relname = pair[2] and ic.relname like pair[1] || '\_%'
               and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid) loop
      execute format('alter index public.%I rename to %I', r.relname, pair[2] || substr(r.relname, length(pair[1]) + 1));
    end loop;
  end loop;
end $$;

-- Samma index två gånger (det ena sorterar bara åt andra hållet)
drop index if exists public.idx_business_analytics_place_event;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trophies' and policyname = 'Users can view their own achievements') then
    alter policy "Users can view their own achievements" on public.trophies rename to "Egna troféer kan läsas";
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trophies' and policyname = 'Users can insert their own achievements') then
    alter policy "Users can insert their own achievements" on public.trophies rename to "Klarade troféer kan sparas";
  end if;
end $$;

-- ── 2. Kolumner som inte används ────────────────────────────────────────────────

-- Troféer: category fanns bara för ett äldre system (alltid tom). En per person och nivå gäller
-- fortfarande (trophies_one_per_user).
alter table public.trophies drop column if exists category;

-- Stories: filter, premium och erbjudandefälten kom från webbversionen. Ett erbjudande i en story
-- är i dag en länk till ett riktigt erbjudande (kolumnen link).
alter table public.stories
  drop column if exists filter,
  drop column if exists is_premium,
  drop column if exists deal_text,
  drop column if exists savings_label,
  drop column if exists savings_value,
  drop column if exists offer_category,
  drop column if exists redemption_limit,
  drop column if exists redemption_interval;

alter table public.events drop column if exists sub_categories;

alter table public.memories
  drop column if exists trip_id,
  drop column if exists highlight,
  drop column if exists cover_image_url;

-- Platser: nivåerna (bas/partner/premium) finns inte längre, stämningarna ersattes av smakerna
-- (tastes), och QR-incheckning är inte byggd
alter table public.places
  drop column if exists business_tier,
  drop column if exists moods,
  drop column if exists qr_token,
  drop column if exists site_group;

-- Profiler: telefon och land samlades in av webbversionen men används inte (och ska därför inte
-- sparas). Notisvalen ligger i notification_preferences, temat i telefonen.
alter table public.profiles
  drop column if exists phone,
  drop column if exists country,
  drop column if exists home_city,
  drop column if exists home_country,
  drop column if exists notification_prefs,
  drop column if exists onboarding_hints,
  drop column if exists onboarding_completed,
  drop column if exists notifications_enabled,
  drop column if exists dark_mode;

alter table public.service_points
  drop column if exists led_map,
  drop column if exists walk_bike,
  drop column if exists distance;

-- Roller: bara admin används. Företag är i dag medlemmar av sin plats (place_members).
alter table public.user_roles drop column if exists name;
delete from public.user_roles where role = 'business';

-- ── Funktionerna som nämner de nya namnen ───────────────────────────────────────
-- (samma funktioner som förut, bara med tabellernas nya namn och utan de borttagna kolumnerna)

CREATE OR REPLACE FUNCTION public.trophies_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Bara när en användare sparar (i SQL Editor går det att rätta för hand)
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' or not public.achievement_met(new.user_id, new.achievement_type, new.level) then
    raise exception 'achievement_locked';
  end if;
  new.unlocked_at := now();
  new.created_at := now();
  return new;
end $function$
;

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

  insert into public.place_members (place_id, user_id, role)
  values (v_place, v_c.user_id, case when v_c.kind = 'join' then 'staff' else 'owner' end)
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
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      select * from public.place_requests
      where kind in ('claim', 'new_place')
      order by created_at desc limit 500
    ) c
    left join public.places pl on pl.id = c.place_id
    left join public.profiles pr on pr.user_id = c.user_id
    left join auth.users u on u.id = c.user_id
  ), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.business_answer_join(p_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c record;
  v_place text;
begin
  select * into v_c from public.place_requests where id = p_id and kind = 'join' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform public.bp_require_member(v_c.place_id, true);
  if v_c.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;
  update public.place_requests set status = case when p_accept then 'approved' else 'rejected' end,
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
end $function$
;

CREATE OR REPLACE FUNCTION public.business_apply_new_place(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text := public.bp_text(p, 'name', 80);
  v_town text := public.bp_text(p, 'town', 60);
  v_cat text := public.bp_text(p, 'category', 60);
  v_web text := public.bp_url(p, 'website');
  v_msg text := public.bp_text(p, 'message', 600);
  v_who text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if v_name is null or char_length(v_name) < 2 or v_town is null then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if not public.bp_adult(v_uid) then return jsonb_build_object('ok', false, 'reason', 'not_adult'); end if;
  if exists (select 1 from public.place_requests where user_id = v_uid and kind = 'new_place' and status = 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;
  if (select count(*) from public.place_requests where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.place_requests (kind, place_id, user_id, message, new_place)
  values ('new_place', null, v_uid, v_msg, jsonb_build_object('name', v_name, 'town', v_town, 'category', v_cat, 'website', v_web));
  v_who := public.bp_display_name(v_uid);
  perform public.bp_email_admins(
    'Nytt företag vill med: ' || v_name,
    v_name || ' vill finnas i Österlenappen',
    '<p><b>' || public.bp_html(v_who) || '</b> vill lägga till <b>' || public.bp_html(v_name) || '</b> i ' || public.bp_html(v_town) || '.</p>'
      || coalesce('<p>Kategori: ' || public.bp_html(v_cat) || '</p>', '')
      || coalesce('<p>Hemsida: ' || public.bp_html(v_web) || '</p>', '')
      || coalesce('<p>”' || public.bp_html(v_msg) || '”</p>', '')
      || '<p>Vänta på ett mejl från företagets egen adress innan du godkänner. Godkänn i appen: Inställningar → Admin.</p>'
  );
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.business_cancel_request(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.place_requests set status = 'cancelled', decided_at = now()
  where id = p_id and user_id = auth.uid() and status = 'pending'
$function$
;

CREATE OR REPLACE FUNCTION public.business_claim_info(p_place_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select kind into v_pending from public.place_requests
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
end $function$
;

CREATE OR REPLACE FUNCTION public.business_claim_verify(p_place_id bigint, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_c record;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('claim:' || p_place_id::text, 0));
  if exists (select 1 from public.place_members where place_id = p_place_id and role = 'owner') then
    return jsonb_build_object('ok', false, 'reason', 'has_owner');
  end if;
  select * into v_c from public.place_claim_codes
  where place_id = p_place_id and user_id = v_uid and used_at is null
  order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if v_c.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if v_c.attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if v_c.code_hash <> encode(sha256(convert_to(
       regexp_replace(coalesce(p_code, ''), '\D', '', 'g') || ':' || v_uid::text || ':' || p_place_id::text, 'UTF8')), 'hex') then
    update public.place_claim_codes set attempts = attempts + 1 where id = v_c.id;
    return jsonb_build_object('ok', false, 'reason', case when v_c.attempts + 1 >= 5 then 'locked' else 'wrong' end,
                              'left', greatest(0, 4 - v_c.attempts));
  end if;

  update public.place_claim_codes set used_at = now() where id = v_c.id;
  insert into public.place_members (place_id, user_id, role) values (p_place_id, v_uid, 'owner')
  on conflict (place_id, user_id) do update set role = 'owner';
  update public.places set claim_link_hidden = true where id = p_place_id;
  update public.place_requests set status = 'approved', decided_at = now()
  where place_id = p_place_id and user_id = v_uid and status = 'pending';
  perform public.bp_log(p_place_id, 'claimed');
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.business_delete_story(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_place bigint;
begin
  select place_id into v_place from public.stories where id = p_id;
  if v_place is null then return; end if;
  perform public.bp_require_member(v_place);
  perform public.bp_require_permission(v_place, 'stories');
  delete from public.stories where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.business_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'requests', (select count(*) from public.place_requests c where c.place_id = p.id and c.kind = 'join' and c.status = 'pending')
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
      from public.place_requests c left join public.places p on p.id = c.place_id
      where c.user_id = v_uid and (c.status = 'pending' or c.decided_at > now() - interval '14 days')
    ), '[]'::jsonb),
    'admin', case when public.is_app_admin()
      then (select count(*) from public.place_requests where status = 'pending' and kind in ('claim', 'new_place'))
         + (select count(*) from public.place_suggestions where handled_at is null)
      else null end
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.business_post_story(p_place_id bigint, p_image_url text, p_caption text DEFAULT NULL::text, p_link jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if (select count(*) from public.stories where place_id = p_place_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'too_many:stories' using errcode = 'P0001';
  end if;
  insert into public.stories (user_id, place_id, image_url, caption, expires_at, link)
  values (auth.uid(), p_place_id, p_image_url, v_caption, now() + interval '24 hours', v_link)
  returning id into v_id;
  perform public.bp_log(p_place_id, 'story');
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.business_request_access(p_place_id bigint, p_role_title text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select 1 from public.place_requests
    where user_id = v_uid and place_id = p_place_id and kind = v_kind and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;
  if (select count(*) from public.place_requests where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  insert into public.place_requests (kind, place_id, user_id, message) values (v_kind, p_place_id, v_uid, v_msg);

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
end $function$
;

CREATE OR REPLACE FUNCTION public.business_stats(p_place_id bigint, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_days int := case when p_days in (7, 30, 365) then p_days else 30 end;
  v_cur timestamptz := now() - make_interval(days => v_days);
  v_prev timestamptz := now() - make_interval(days => v_days * 2);
  v_local date := (now() at time zone 'Europe/Stockholm')::date;
  v_res jsonb;
  v_visitors int;
begin
  perform public.bp_require_member(p_place_id);

  select jsonb_build_object(
    'days', v_days,
    'views', count(*) filter (where event_type = 'profile_view' and created_at >= v_cur),
    'views_prev', count(*) filter (where event_type = 'profile_view' and created_at < v_cur),
    'visitors', count(distinct user_id) filter (where event_type = 'profile_view' and created_at >= v_cur),
    'visitors_prev', count(distinct user_id) filter (where event_type = 'profile_view' and created_at < v_cur),
    'clicks', count(*) filter (where event_type = 'link_click' and created_at >= v_cur),
    'clicks_prev', count(*) filter (where event_type = 'link_click' and created_at < v_cur),
    'directions', count(*) filter (where event_type = 'navigation_click' and created_at >= v_cur),
    'directions_prev', count(*) filter (where event_type = 'navigation_click' and created_at < v_cur)
  ) into v_res
  from public.place_analytics
  where place_id = p_place_id and created_at >= v_prev;

  v_res := v_res || jsonb_build_object(
    'links', coalesce((
      select jsonb_object_agg(l, n) from (
        select coalesce(link_type, 'other') l, count(*) n from public.place_analytics
        where place_id = p_place_id and event_type = 'link_click' and created_at >= v_cur group by 1
      ) x), '{}'::jsonb),
    'sources', coalesce((
      select jsonb_object_agg(s, n) from (
        select coalesce(source, 'other') s, count(*) n from public.place_analytics
        where place_id = p_place_id and event_type = 'profile_view' and created_at >= v_cur group by 1
      ) x), '{}'::jsonb),
    'favorites_total', (select count(*) from public.favorites where place_id = p_place_id),
    'favorites_new', (select count(*) from public.favorites where place_id = p_place_id and created_at >= v_cur),
    'favorites_new_prev', (select count(*) from public.favorites where place_id = p_place_id and created_at >= v_prev and created_at < v_cur),
    'checkins', (select count(*) from public.visits where place_id = p_place_id and visited_at >= v_cur),
    'checkins_prev', (select count(*) from public.visits where place_id = p_place_id and visited_at >= v_prev and visited_at < v_cur),
    'redemptions', (
      select count(*) from public.offer_redemptions r join public.offers o on o.id = r.offer_id
      where o.place_id = p_place_id and r.activated_at >= v_cur),
    'redemptions_prev', (
      select count(*) from public.offer_redemptions r join public.offers o on o.id = r.offer_id
      where o.place_id = p_place_id and r.activated_at >= v_prev and r.activated_at < v_cur),
    'story_views', (
      select count(*) from public.story_views v join public.stories s on s.id::text = v.story_id::text
      where s.place_id = p_place_id and v.viewed_at >= v_cur)
  );

  if v_days <= 30 then
    v_res := v_res || jsonb_build_object('series', (
      select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'), 'views', coalesce(x.views, 0), 'visitors', coalesce(x.visitors, 0))
        order by g.d), '[]'::jsonb)
      from generate_series((v_local - (v_days - 1))::timestamp, v_local::timestamp, interval '1 day') as g(d)
      left join (
        select (created_at at time zone 'Europe/Stockholm')::date dd, count(*) views, count(distinct user_id) visitors
        from public.place_analytics
        where place_id = p_place_id and event_type = 'profile_view' and created_at >= v_cur - interval '1 day'
        group by 1
      ) x on x.dd = g.d::date
    ));
  else
    v_res := v_res || jsonb_build_object('series', (
      select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'), 'views', coalesce(x.views, 0), 'visitors', coalesce(x.visitors, 0))
        order by g.d), '[]'::jsonb)
      from generate_series(date_trunc('month', v_local::timestamp) - interval '11 months', date_trunc('month', v_local::timestamp), interval '1 month') as g(d)
      left join (
        select date_trunc('month', created_at at time zone 'Europe/Stockholm') mm, count(*) views, count(distinct user_id) visitors
        from public.place_analytics
        where place_id = p_place_id and event_type = 'profile_view' and created_at >= v_cur - interval '31 days'
        group by 1
      ) x on x.mm = g.d
    ));
  end if;

  -- Vilka som tittar: bara när tillräckligt många tittat, och bara grupper med minst 5 personer
  select count(distinct user_id) into v_visitors from public.place_analytics
  where place_id = p_place_id and event_type = 'profile_view' and created_at >= v_cur and user_id is not null;

  if v_visitors >= 20 then
    v_res := v_res || jsonb_build_object('audience', (
      with people as (
        select distinct a.user_id from public.place_analytics a
        where a.place_id = p_place_id and a.event_type = 'profile_view' and a.created_at >= v_cur and a.user_id is not null
      ),
      prof as (
        select pr.birth_date, pr.birth_year, pr.city, pr.lives_in_osterlen
        from people x join public.profiles pr on pr.user_id = x.user_id
      ),
      ages as (
        select case
          when age < 25 then 'under25' when age < 35 then '25-34' when age < 45 then '35-44'
          when age < 55 then '45-54' when age < 65 then '55-64' else '65plus' end bucket
        from (
          select extract(year from age(v_local, coalesce(birth_date, make_date(birth_year, 7, 1))))::int age
          from prof where birth_date is not null or birth_year is not null
        ) y
      )
      select jsonb_build_object(
        'people', v_visitors,
        'ages', coalesce((select jsonb_object_agg(bucket, n) from (select bucket, count(*) n from ages group by bucket having count(*) >= 5) a), '{}'::jsonb),
        'towns', coalesce((
          select jsonb_agg(jsonb_build_object('town', town, 'n', n) order by n desc) from (
            select btrim(city) town, count(*) n from prof where nullif(btrim(city), '') is not null
            group by btrim(city) having count(*) >= 5 order by count(*) desc limit 5
          ) t), '[]'::jsonb),
        'local', (select count(*) from prof where lives_in_osterlen is true),
        'visiting', (select count(*) from prof where lives_in_osterlen is false)
      )
    ));
  else
    v_res := v_res || jsonb_build_object('audience', null, 'audience_people', v_visitors);
  end if;

  return v_res;
end $function$
;

CREATE OR REPLACE FUNCTION public.business_stories_overview(p_place_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.bp_require_member(p_place_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'image_url', s.image_url, 'caption', s.caption, 'created_at', s.created_at,
      'expires_at', s.expires_at, 'link', s.link,
      'views', (select count(*) from public.story_views v where v.story_id::text = s.id::text)
    ) order by s.created_at desc)
    from public.stories s
    where s.place_id = p_place_id and s.created_at > now() - interval '30 days'
  ), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.business_team(p_place_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      from public.place_requests c left join public.profiles pr on pr.user_id = c.user_id
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
end $function$
;

CREATE OR REPLACE FUNCTION public.rpc_friend_stats(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_friend boolean;
  result    jsonb;
begin
  select exists(
    select 1 from public.friendships
    where status = 'accepted'
      and (
        (requester_id = auth.uid() and addressee_id = target_user_id)
        or (requester_id = target_user_id and addressee_id = auth.uid())
      )
  ) into is_friend;

  if not is_friend then
    raise exception 'not_friends';
  end if;

  select jsonb_build_object(
    'app_days', coalesce((select jsonb_agg(day) from public.app_days where user_id = target_user_id), '[]'::jsonb),
    'visits_total', (select count(distinct place_id) from public.visits where user_id = target_user_id),
    'stickers_total', (select count(*) from public.user_collectibles where user_id = target_user_id),
    'favorites_total', (select count(*) from public.favorites where user_id = target_user_id),
    'visited_place_ids', coalesce((
      select jsonb_agg(distinct place_id) from public.visits where user_id = target_user_id
    ), '[]'::jsonb),
    'trophies', coalesce((
      select jsonb_agg(jsonb_build_object('achievement_type', achievement_type, 'level', level) order by unlocked_at)
      from public.trophies
      where user_id = target_user_id
    ), '[]'::jsonb),
    'collectibles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', co.id, 'name', co.name, 'image_path', co.image_path
      ) order by uc.collected_at desc)
      from public.user_collectibles uc
      join public.collectibles co on co.id = uc.collectible_id
      where uc.user_id = target_user_id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', x.kind, 'label', x.label, 'image_path', x.image_path, 'happened_at', x.happened_at,
        'place_id', x.place_id, 'event_id', x.event_id
      ) order by x.happened_at desc)
      from (
        select * from (
          (
            select 'visit' as kind, pl.name as label, pl.image_url as image_path, vi.visited_at as happened_at,
                   vi.place_id as place_id, null::bigint as event_id
            from public.visits vi
            join public.places pl on pl.id = vi.place_id
            where vi.user_id = target_user_id
            order by vi.visited_at desc
            limit 8
          )
          union all
          (
            select 'favorite' as kind, coalesce(pl.name, ev.title) as label,
                   coalesce(pl.image_url, ev.image_url) as image_path, fa.created_at as happened_at,
                   fa.place_id as place_id, fa.event_id as event_id
            from public.favorites fa
            left join public.places pl on pl.id = fa.place_id
            left join public.events ev on ev.id = fa.event_id
            where fa.user_id = target_user_id
            order by fa.created_at desc
            limit 8
          )
          union all
          (
            select 'sticker' as kind, co.name as label, co.image_path, uc.collected_at as happened_at,
                   null::bigint as place_id, null::bigint as event_id
            from public.user_collectibles uc
            join public.collectibles co on co.id = uc.collectible_id
            where uc.user_id = target_user_id
            order by uc.collected_at desc
            limit 8
          )
        ) combined
        order by happened_at desc
        limit 5
      ) x
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.track_place_event(p_place_id bigint, p_kind text, p_link text DEFAULT NULL::text, p_source text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_link text := case when p_kind = 'link_click' and p_link in ('phone', 'website', 'book', 'instagram', 'facebook', 'email') then p_link end;
  v_source text := case when p_source in ('home', 'search', 'map', 'calendar', 'profile', 'category', 'lists', 'place', 'offers', 'story', 'friends', 'event', 'discover', 'news', 'checkin', 'other') then p_source end;
begin
  if v_uid is null or p_kind not in ('profile_view', 'link_click', 'navigation_click') then return; end if;
  if p_kind = 'link_click' and v_link is null then return; end if;
  if exists (select 1 from public.place_members where place_id = p_place_id and user_id = v_uid) then return; end if;
  if p_kind = 'profile_view' and exists (
    select 1 from public.place_analytics
    where place_id = p_place_id and user_id = v_uid and event_type = 'profile_view' and created_at > now() - interval '30 minutes'
  ) then return; end if;
  if p_kind <> 'profile_view' and exists (
    select 1 from public.place_analytics
    where place_id = p_place_id and user_id = v_uid and event_type = p_kind and link_type is not distinct from v_link
      and created_at > now() - interval '10 seconds'
  ) then return; end if;
  if (select count(*) from public.place_analytics where user_id = v_uid and created_at > now() - interval '1 hour') >= 500 then return; end if;
  if not exists (select 1 from public.places where id = p_place_id) then return; end if;
  insert into public.place_analytics (place_id, event_type, link_type, user_id, source)
  values (p_place_id, p_kind, v_link, v_uid, case when p_kind = 'profile_view' then v_source end);
end $function$
;

-- Trofévakten heter som sin tabell
drop trigger if exists achievements_guard on public.trophies;
drop trigger if exists trophies_guard on public.trophies;
create trigger trophies_guard before insert or update on public.trophies
  for each row execute function public.trophies_guard();
drop function if exists public.achievements_guard();
revoke execute on function public.trophies_guard() from public, anon, authenticated;

-- ── 3. Beskrivningar ────────────────────────────────────────────────────────────

comment on schema arkiv is 'Den gamla webbversionens tabeller. Används inte av appen och syns inte i API:t. Kan tas bort efter lanseringen: drop schema arkiv cascade;';

-- Platser och innehåll
comment on table public.places is 'Platserna i appen (restauranger, kaféer, natur, sevärdheter …). Företagen ändrar sin egen plats i Mitt företag.';
comment on column public.places.categories is 'Kategorier, kommaseparerade (t.ex. "Mat & Dryck, Butiker"). Appens kategorier matchar mot de här.';
comment on column public.places.sub_category is 'Underkategori, t.ex. "Pizzeria". Grupperar raderna på kategorisidan.';
comment on column public.places.image_url is 'Bilder, kommaseparerade. Den första är omslaget.';
comment on column public.places.opening_hours is 'Öppettider per veckodag, t.ex. {"Måndag": "10:00-17:00"}.';
comment on column public.places.hours_exceptions is 'Avvikande öppettider: en dag, semester eller säsong (sätts i Mitt företag).';
comment on column public.places.amenities is 'Bekvämligheter, t.ex. parkering och toalett.';
comment on column public.places.tastes is 'Smaker (t.ex. vegetariskt) som sökningen och "Eftersom du gillar" använder.';
comment on column public.places.checkin_enabled is 'Om man kan checka in här. Av för t.ex. kyrkor och naturplatser utan tydlig ingång.';
comment on column public.places.is_business is 'Ett företag som kan ta hand om sin sida i Mitt företag.';
comment on column public.places.claim_link_hidden is 'Företaget har dolt länken "Är det här ditt företag?".';
comment on column public.places.info_updated_at is 'När något på sidan senast ändrades ("Senast uppdaterad"). Sätts av databasen.';
comment on table public.events is 'Evenemangen i kalendern. Företagen skapar dem i Mitt företag.';
comment on column public.events.series_id is 'Evenemang som återkommer (flera datum) delar samma id.';
comment on column public.events.main_category is 'Evenemangets kategori, se EVENT_CATEGORIES i appen (src/lib/events.ts).';
comment on table public.news is 'Nyheterna på Hem. Bara publicerade (is_published) syns i appen.';
comment on table public.service_points is 'Servicepunkter på kartan: toaletter, laddstolpar, butiker, vårdcentraler.';
comment on table public.stories is 'Företagens stories. Syns i 24 timmar (expires_at).';
comment on column public.stories.link is 'Klistermärket i storyn som leder till ett erbjudande eller evenemang, och var det sitter på bilden.';
comment on table public.story_views is 'Vem som sett vilken story (för ringen runt loggan och företagets statistik).';

-- Användarna
comment on table public.profiles is 'En rad per användare: namn, kort, medlemskap och val. Skapas när kontot skapas.';
comment on column public.profiles.avatar_url is 'Profilbilden (i bildmappen profile-images). Syns för vänner.';
comment on column public.profiles.profile_image_url is 'Fotot på medlemskortet. Kan bytas en gång var 30:e dag.';
comment on column public.profiles.circle_color is 'Färgen på cirkeln runt profilbilden.';
comment on column public.profiles.card_color is 'Medlemskortets utseende. Fria färger eller ett kort man vunnit (user_cards).';
comment on column public.profiles.avatar_ring is 'Ringen runt profilbilden. Låses upp med skatter och troféer (databasen kontrollerar).';
comment on column public.profiles.is_member is 'Har Österlenpasset. Ändras bara av databasen (köp och gåvokoder).';
comment on column public.profiles.member_until is 'Sista dagen passet gäller. Tom = utan slutdatum.';
comment on column public.profiles.member_bonus_days is 'Dagar från gåvokoder som väntar tills ett förnyande pass slutar.';
comment on column public.profiles.birth_date is 'Födelsedagen. Kan inte ändras när den väl är satt.';
comment on column public.profiles.birth_year is 'Födelseåret, för åldersgrupperna i företagens statistik.';
comment on column public.profiles.show_in_leaderboard is 'Med på topplistorna (av från början, man väljer själv).';
comment on column public.profiles.show_leaderboard_avatar is 'Visar profilbilden på topplistorna även för andra än vänner.';
comment on column public.profiles.onboarded_at is 'När kontot blev klart (onboardingen). Sätts av databasen.';
comment on table public.user_roles is 'Vilka som är administratörer (role = admin).';
comment on table public.friendships is 'Vänner och vänförfrågningar (status pending eller accepted).';
comment on table public.notification_preferences is 'Vilka notiser användaren vill ha, och för vilka orter.';
comment on table public.code_attempts is 'Fel försök med gåvokoder och listkoder, så koder inte kan gissas (högst 10 i timmen).';

-- Det man gör i appen
comment on table public.visits is 'Incheckningar. Sparas bara via check_in(), som kontrollerar att man är på plats.';
comment on column public.visits.method is 'Hur man checkade in (gps).';
comment on table public.app_days is 'Dagarna man öppnat appen (för streaken). Alltid dagens datum, satt av databasen.';
comment on table public.favorites is 'Hjärtan: sparade platser, evenemang och servicepunkter.';
comment on table public.discovery_likes is 'Platser man svept höger på i Upptäck.';
comment on table public.discovery_dismissals is 'Platser man svept vänster på i Upptäck.';
comment on table public.memories is 'Minnen: bilder och text från besök. Privata.';
comment on column public.memories.photo_paths is 'Bilderna i den privata bildmappen memories (<användare>/<fil>.jpg).';
comment on table public.lists is 'Listor som man delar med andra (gå med via invite_code).';
comment on table public.list_members is 'Vilka som är med i en lista (owner eller member, inbjudan pending eller accepted).';
comment on table public.list_places is 'Platserna i en lista, i ordningen position.';
comment on table public.list_opens is 'När man senast öppnade en lista (för "nytt sedan sist").';

-- Belöningar
comment on table public.trophies is 'Troféerna man klarat (grupp och nivå). Databasen kontrollerar att de verkligen är klara.';
comment on column public.trophies.achievement_type is 'Troféns grupp, t.ex. utforskaren eller samlaren (se src/lib/achievements.ts).';
comment on column public.trophies.level is 'bronze, silver eller gold.';
comment on table public.collectibles is 'Skatterna på kartan. Bara publicerade (published) syns.';
comment on table public.user_collectibles is 'Skatterna man hittat. Sparas bara via collect_sticker(), inom 75 meter.';
comment on table public.reward_cards is 'Korten man kan vinna: Skattjägare och månadens/årets mest besök.';
comment on table public.user_cards is 'Korten man vunnit.';

-- Österlenpasset
comment on table public.pass_products is 'Österlenpassets perioder och priser.';
comment on table public.pass_purchases is 'Köpta pass.';
comment on table public.pass_gifts is 'Pass som gåvor, med koden mottagaren löser in.';
comment on table public.offers is 'Förmånerna i Österlenpasset, från företagen.';
comment on column public.offers.redemption_interval is 'Hur ofta det får användas: once, daily, weekly, monthly eller unlimited.';
comment on table public.offer_redemptions is 'När en medlem använt en förmån. Databasen kontrollerar reglerna.';

-- Mitt företag
comment on table public.place_members is 'Vem som sköter vilken plats (ägare eller personal, och vad personalen får göra).';
comment on table public.place_invites is 'Inbjudningar till personal som inte svarat än.';
comment on table public.place_requests is 'Förfrågningar som väntar på svar: ta hand om en plats, gå med i en plats, eller ett nytt företag.';
comment on table public.place_claim_codes is 'Koderna som mejlas till företaget när någon vill ta hand om platsen (15 minuter, fem försök).';
comment on table public.place_changes is 'Vad företagen ändrat och när (historik för administratören).';
comment on table public.place_analytics is 'Visningar och klick på platssidorna. Företagen ser bara antal, aldrig vem.';
comment on table public.place_reports is 'Fel som användare rapporterat på en plats.';
comment on table public.place_suggestions is 'Platser som användare föreslagit.';
comment on view public.place_requests_overview is 'Förfrågningarna i klartext, för administratören.';
comment on view public.place_reports_overview is 'Rapporterade fel i klartext, för administratören.';
