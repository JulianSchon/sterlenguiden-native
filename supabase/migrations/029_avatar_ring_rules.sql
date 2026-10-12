-- Profilringarna går inte att fuska till sig. Kör efter 026 (räknar högersvepen i discovery_likes).
--
-- Vilken ring man har valt sparas i profiles.avatar_ring, men vilka ringar man äger räknas alltid
-- fram ur riktig data (inget sparas). Hittills kontrollerade bara appen kravet — den som skrev
-- avatar_ring direkt mot databasen kunde ta vilken ring som helst. Nu kontrollerar databasen
-- kravet varje gång avatar_ring ändras, med samma regler som appen (src/lib/avatarRings.ts):
--
--   gris       6 hittade skatter
--   far       12 hittade skatter
--   ko        18 hittade skatter
--   kronhjort  alla 21 utmaningar (src/lib/achievements.ts) — dvs varje grupps högsta nivå:
--              50 unika besökta platser, 30 favoriter, 6 olika inlösta erbjudanden, besök i alla
--              8 kategorier, 150 svepta platser i Upptäck, minst en egen lista och ett minne
--              (Österlenlegends krav ryms i dessa)
--
-- 'none' (ingen ring) och null är alltid tillåtna.

create or replace function public.ring_requirement_met(p_user uuid, p_ring text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  treasures int;
  visits int;
  favorites int;
  redemptions int;
  swipes int;
  lists int;
  memories int;
  categories int;
begin
  if p_ring is null or p_ring = 'none' then
    return true;
  end if;

  select count(*) into treasures from user_collectibles where user_id = p_user;
  if p_ring = 'gris' then return treasures >= 6; end if;
  if p_ring = 'far' then return treasures >= 12; end if;
  if p_ring = 'ko' then return treasures >= 18; end if;

  if p_ring = 'kronhjort' then
    select count(distinct place_id) into visits from visits where user_id = p_user;
    select count(*) into favorites from favorites where user_id = p_user;
    select count(distinct offer_id) into redemptions from offer_redemptions where user_id = p_user;
    select count(*) into swipes from (
      select place_id from discovery_dismissals where user_id = p_user
      union
      select place_id from discovery_likes where user_id = p_user
    ) s;
    select count(*) into lists from lists where owner_id = p_user;
    select count(*) into memories from memories where user_id = p_user;
    -- Kategorierna: samma matchning som appen (en del av platsens kategorier är lika med, innehåller
    -- eller ingår i ett av kategorins databasvärden)
    select count(*) into categories from (
      select g.id
      from (values
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
        join places p on p.id = v.place_id
        cross join lateral unnest(string_to_array(lower(coalesce(p.categories, '')), ',')) as part(raw)
        cross join lateral unnest(g.db_values) as dv(val)
        where v.user_id = p_user
          and trim(part.raw) <> ''
          and (trim(part.raw) = dv.val or trim(part.raw) like '%' || dv.val || '%' or dv.val like '%' || trim(part.raw) || '%')
      )
    ) c;
    return visits >= 50 and favorites >= 30 and redemptions >= 6 and categories >= 8
      and swipes >= 150 and lists >= 1 and memories >= 1;
  end if;

  -- Okänd ring
  return false;
end;
$$;

create or replace function public.profiles_check_avatar_ring()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar_ring is distinct from old.avatar_ring
     and not public.ring_requirement_met(new.user_id, new.avatar_ring) then
    raise exception 'ring_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_check_avatar_ring on public.profiles;

create trigger profiles_check_avatar_ring
  before update of avatar_ring on public.profiles
  for each row execute function public.profiles_check_avatar_ring();

-- De gamla ringarna (guld, blixt) finns inte längre — nollställ dem som har dem valda
update public.profiles set avatar_ring = null where avatar_ring in ('gold', 'lightning', 'skattletare', 'skattjagare', 'skattmastare', 'osterlenlegend');
