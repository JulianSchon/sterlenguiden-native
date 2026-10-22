-- Företagsportalen: ingen behöver lämna telefonnummer. Kör i Supabase → SQL Editor (efter 046).
-- Går att köra flera gånger.
--
-- Beviset att man driver företaget är företagets e-post: antingen en kod dit, eller (om platsen
-- saknar e-post eller man inte kommer åt den) en förfrågan + ett mejl till oss från företagets
-- adress. Därför behövs varken telefon eller roll längre.

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
  select id, name, claim_link_hidden into v_pl from public.places where id = p_place_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
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

create or replace function public.business_apply_new_place(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
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
  if exists (select 1 from public.place_claims where user_id = v_uid and kind = 'new_place' and status = 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;
  if (select count(*) from public.place_claims where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.place_claims (kind, place_id, user_id, message, new_place)
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
end $$;
