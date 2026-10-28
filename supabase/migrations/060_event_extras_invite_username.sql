-- 060: Evenemang får barnvänligt, hundvänligt och tillgängligt för rullstol. Personal kan bjudas in
-- med användarnamn i stället för e-post.
--
-- Inbjudan med användarnamn: inbjudan sparas fortfarande på personens e-post (så den väntar under
-- Inställningar som vanligt), men ägaren ser bara @användarnamnet, aldrig adressen.
-- Går att köra flera gånger.

alter table public.events add column if not exists is_child_friendly boolean not null default false;
alter table public.events add column if not exists is_dog_friendly boolean not null default false;
alter table public.events add column if not exists is_accessible boolean not null default false;

alter table public.place_invites add column if not exists invited_username text;

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
  v_child boolean := coalesce((p_event ->> 'is_child_friendly')::boolean, false);
  v_dog boolean := coalesce((p_event ->> 'is_dog_friendly')::boolean, false);
  v_access boolean := coalesce((p_event ->> 'is_accessible')::boolean, false);
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
                                 has_parking, is_child_friendly, is_dog_friendly, is_accessible, series_id, created_by)
      values (v_title, v_desc, v_d, case when v_span is null then null else v_d + v_span end, v_time, v_loc, v_img, v_cat, false,
              p_place_id, v_tickets, v_booking, v_ticket, v_indoor, v_food, v_parking, v_child, v_dog, v_access, v_series, v_uid)
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
      is_child_friendly = v_child, is_dog_friendly = v_dog, is_accessible = v_access,
      end_date = case when v_span is null then null else date + v_span end
    where series_id = v_e.series_id and place_id = p_place_id and date >= least(v_e.date, v_today);
  else
    update public.events set
      title = v_title, description = v_desc, date = v_date, end_date = v_end, time = v_time, location = v_loc,
      image_url = v_img, main_category = v_cat, tickets_required = v_tickets, booking_required = v_booking,
      ticket_url = v_ticket, is_indoor = v_indoor, has_food_drink = v_food, has_parking = v_parking,
      is_child_friendly = v_child, is_dog_friendly = v_dog, is_accessible = v_access
    where id = p_id;
  end if;
  perform public.bp_log(p_place_id, 'event');
  return jsonb_build_object('ids', jsonb_build_array(p_id), 'series_id', v_e.series_id);
end $$;

-- Inbjudan: p_email kan vara en e-postadress eller ett användarnamn (med eller utan @ först)
create or replace function public.business_invite(p_place_id bigint, p_email text, p_role text default 'staff', p_permissions text[] default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_input text := lower(btrim(coalesce(p_email, '')));
  v_email text;
  v_username text;
  v_place text;
  v_from text;
  v_sent boolean;
begin
  perform public.bp_require_member(p_place_id, true);
  if public.bp_is_email(v_input) then
    v_email := v_input;
  else
    -- Ett användarnamn: personens e-post hämtas här och visas aldrig för den som bjuder in
    v_username := regexp_replace(v_input, '^@', '');
    select lower(u.email), pr.username into v_email, v_username
    from public.profiles pr join auth.users u on u.id = pr.user_id
    where lower(pr.username) = v_username;
    if v_email is null then return jsonb_build_object('ok', false, 'reason', 'unknown_user'); end if;
  end if;
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
  insert into public.place_invites (place_id, email, invited_username, role, invited_by, permissions)
  values (p_place_id, v_email, v_username, p_role, auth.uid(),
          case when p_role = 'staff' then coalesce(p_permissions, public.bp_default_permissions()) end);

  select name into v_place from public.places where id = p_place_id;
  v_from := public.bp_display_name(auth.uid());
  v_sent := public.send_app_email(
    v_email,
    v_from || ' har bjudit in dig till ' || v_place,
    'Du är inbjuden till ' || v_place,
    '<p><b>' || public.bp_html(v_from) || '</b> vill att du hjälper till med <b>' || public.bp_html(v_place)
      || '</b> i Österlenappen – öppettider, bilder, erbjudanden och evenemang.</p>'
      || case when v_username is not null
           then '<p>Öppna Österlenappen – inbjudan väntar under Inställningar.</p>'
           else '<p>Ladda ner Österlenappen och logga in med den här e-postadressen (' || public.bp_html(v_email)
             || '). Inbjudan väntar under Inställningar.</p>' end
  );
  perform public.bp_log(p_place_id, 'team');
  return jsonb_build_object('ok', true, 'emailed', v_sent);
end $$;

-- Personal: en inbjudan med användarnamn visas som @namn, inte som personens e-post
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
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', case when i.invited_username is not null then '@' || i.invited_username else i.email end,
        'role', i.role, 'created_at', i.created_at)
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
