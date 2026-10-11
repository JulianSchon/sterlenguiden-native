-- Erbjudandenas regler kontrolleras av servern, med serverns klocka. Kör efter 003.
--
-- Hittills avgjordes "en gång", "en gång per dag/vecka/månad" och "max N gånger" bara i appen,
-- mot telefonens klocka. Den som ställde fram klockan en vecka kunde därför använda ett
-- veckoerbjudande igen, och vem som helst kunde skicka in en aktivering direkt mot databasen.
-- Nu stoppas varje aktivering som bryter mot reglerna redan i databasen, räknat med now().
--
-- Dessutom: rpc_active_redemption() — den pågående aktiveringen (yngre än 60 s) räknad med
-- serverns klocka, plus serverns tid just nu. Appen ställer sin nedräkning och kortets klocka
-- efter den, så en tillbakaställd telefonklocka varken kan ta fram en gammal aktivering igen
-- eller förlänga nedräkningen.

create or replace function public.offer_redemptions_check_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  used_count int;
  last_at timestamptz;
  max_uses int;
  win interval;
begin
  -- Två aktiveringar av samma erbjudande samtidigt (dubbeltryck, två telefoner) får inte båda
  -- slinka igenom: den ena väntar tills den andra är klar
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.offer_id::text, 0));

  select is_active, expires_at, redemption_limit, redemption_interval
    into o
  from public.offers
  where id = new.offer_id;

  if not found or not o.is_active or (o.expires_at is not null and o.expires_at < now()) then
    raise exception 'offer_not_available' using errcode = 'P0001';
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
$$;

drop trigger if exists offer_redemptions_check_rules on public.offer_redemptions;

create trigger offer_redemptions_check_rules
  before insert on public.offer_redemptions
  for each row execute function public.offer_redemptions_check_rules();

-- Den pågående aktiveringen + serverns tid. Returnerar alltid en rad (offer_id null om inget
-- erbjudande är aktivt), så appen får serverns tid även när inget pågår.
create or replace function public.rpc_active_redemption()
returns table (offer_id uuid, activated_at timestamptz, server_now timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select a.offer_id, a.activated_at, now()
  from (select 1) one
  left join lateral (
    select r.offer_id, r.activated_at
    from public.offer_redemptions r
    where r.user_id = auth.uid()
      and r.activated_at > now() - interval '60 seconds'
    order by r.activated_at desc
    limit 1
  ) a on true;
$$;

revoke execute on function public.rpc_active_redemption() from public, anon;
grant execute on function public.rpc_active_redemption() to authenticated;
