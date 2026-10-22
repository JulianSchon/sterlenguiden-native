-- Gåvor: när man löser in en kod får man veta vem den är från och läsa hälsningen.
-- Kör i Supabase → SQL Editor.
--
-- redeem_pass_code fungerar som förut (samma regler för tid, sparade dagar och startdatum) men
-- svarar nu också med köparens namn (from_name) och hälsningen (message). Namnet skickas bara när
-- någon annan köpt gåvan — inte när man löst in en kod man köpt själv.
-- Går att köra flera gånger.

create or replace function public.redeem_pass_code(_code text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
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

  select * into v_gift from public.pass_gifts where upper(claim_code) = v_code for update;
  if not found then
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
end;
$$;
