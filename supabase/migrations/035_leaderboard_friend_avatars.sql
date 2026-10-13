-- Vänners listor och topplistornas profilbilder. Kör efter 034.
--
-- 1. rpc_friend_list_places — platserna i en väns lista som visas för vänner, så att den kan
--    öppnas på den vanliga listsidan (bara titta).
-- 2. Topplistor: vänners profilbilder syns alltid. Förut syntes en profilbild i topplistorna
--    bara om personen själv slagit på "visa profilbild i topplistorna" (024). Nu syns dessutom
--    alltid ens vänners (accepterad vänskap) och ens egen — samma regel som i resten av appen
--    (034). Alla andra visas med initialer, om de inte själva valt att visa sin bild. Läsrätten
--    till bilderna finns redan i 034 (avatar_visible_to_me). rpc_leaderboard är i övrigt
--    oförändrad från 028.

-- ─── En väns lista, visad på den vanliga listsidan (bara titta) ──────────────
-- Platserna i en lista som ägaren visar för sina vänner (lists.visible_to_friends, 033), med vem
-- som lade till dem — samma uppgifter som listsidan visar för medlemmar. Tom om listan inte är
-- synlig för vänner eller om man inte är vän med ägaren.
create or replace function public.rpc_friend_list_places(target_list_id uuid)
returns table (
  row_id     uuid,
  place_id   bigint,
  added_by   uuid,
  created_at timestamptz,
  "position" int
)
language sql
security definer
set search_path = public
stable
as $$
  select lp.id, lp.place_id::bigint, lp.added_by, lp.created_at, lp.position::int
  from public.list_places lp
  join public.lists l on l.id = lp.list_id
  where lp.list_id = target_list_id
    and l.visible_to_friends
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = l.owner_id)
          or (f.addressee_id = auth.uid() and f.requester_id = l.owner_id))
    )
  order by lp.position, lp.created_at desc;
$$;

grant execute on function public.rpc_friend_list_places(uuid) to authenticated;

-- ─── Topplistan ──────────────────────────────────────────────────────────────

drop function if exists public.rpc_leaderboard(text, text, text, int, int);

create or replace function public.rpc_leaderboard(
  p_metric text,                -- 'visits' | 'streak' | 'stickers'
  p_scope text,                 -- 'all' | 'area' | 'friends'
  p_period text default 'all',  -- visits/stickers: 'month' | 'year' | 'all'; streak: 'all' (just nu) | 'best' (någonsin)
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  user_id uuid,
  display_name text,
  circle_color text,
  metric_value int,
  placement int,
  self_row boolean,
  row_pos int,
  username text,
  city text,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_city text;
  today date := (now() at time zone 'Europe/Stockholm')::date;
  month_start date := date_trunc('month', now() at time zone 'Europe/Stockholm')::date;
  year_start date := date_trunc('year', now() at time zone 'Europe/Stockholm')::date;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if p_metric not in ('visits', 'streak', 'stickers') then
    raise exception 'bad_metric';
  end if;
  if p_scope not in ('all', 'area', 'friends') then
    raise exception 'bad_scope';
  end if;

  select nullif(lower(trim(p.city)), '') into my_city
  from public.profiles p
  where p.user_id = me;

  return query
  with scoped as (
    select
      p.user_id as uid,
      -- ::text uttryckligen — RETURN QUERY kräver exakt samma typ som RETURNS TABLE, och är
      -- någon av kolumnerna varchar i databasen kraschar annars hela anropet
      coalesce(nullif(trim(p.display_name::text), ''), p.username::text, 'Medlem')::text as label,
      p.circle_color::text as color,
      p.username::text as uname,
      nullif(trim(p.city::text), '') as ucity,
      case
        when p.user_id = me or p.show_leaderboard_avatar is true or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = me and f.addressee_id = p.user_id)
              or (f.addressee_id = me and f.requester_id = p.user_id))
        ) then p.avatar_url::text
      end as uavatar,
      (p.show_in_leaderboard is true and (p_scope <> 'area' or my_city is not null)) as participates
    from public.profiles p
    where p.user_id = me
       or (
         p.show_in_leaderboard is true
         and (
           p_scope = 'all'
           or (p_scope = 'area' and my_city is not null and lower(trim(p.city)) = my_city)
           or (p_scope = 'friends' and exists (
                 select 1 from public.friendships f
                 where f.status = 'accepted'
                   and ((f.requester_id = me and f.addressee_id = p.user_id)
                     or (f.addressee_id = me and f.requester_id = p.user_id))
               ))
         )
       )
  ),
  vals as (
    select
      s.uid, s.label, s.color, s.uname, s.ucity, s.uavatar, s.participates,
      case p_metric
        -- Unika platser, samma regel som resten av appen (Statistik, troféerna)
        when 'visits' then (
          select count(distinct v.place_id)::int
          from public.visits v
          where v.user_id = s.uid
            and (
              p_period = 'all'
              or (p_period = 'month' and (v.visited_at at time zone 'Europe/Stockholm')::date >= month_start)
              or (p_period = 'year' and (v.visited_at at time zone 'Europe/Stockholm')::date >= year_start)
            )
        )
        -- Skatter: hittade under perioden (som besöken), räknat på när de hittades
        when 'stickers' then (
          select count(*)::int from public.user_collectibles uc
          where uc.user_id = s.uid
            and (
              p_period = 'all'
              or (p_period = 'month' and (uc.collected_at at time zone 'Europe/Stockholm')::date >= month_start)
              or (p_period = 'year' and (uc.collected_at at time zone 'Europe/Stockholm')::date >= year_start)
            )
        )
        -- Pågående streak, samma regel som computeStreak() i src/lib/streak.ts: räknas bakåt från
        -- idag, eller från igår om man inte hunnit öppna appen idag (streaken lever dagen ut).
        else (
          with d as (
            select distinct a.day::date as dday
            from public.app_days a
            where a.user_id = s.uid and a.day::date <= today
          ),
          islands as (
            select d.dday, d.dday - (row_number() over (order by d.dday))::int as grp
            from d
          ),
          latest as (
            select i.dday, i.grp from islands i order by i.dday desc limit 1
          )
          select case
            -- Någonsin: den längsta sammanhängande serien, även om den är bruten
            when p_period = 'best' then coalesce((select max(n)::int from (select count(*) as n from islands group by grp) g), 0)
            -- Just nu: den pågående serien
            else (select count(*)::int from islands i, latest l where i.grp = l.grp and l.dday >= today - 1)
          end
        )
      end as val
    from scoped s
  ),
  ranked as (
    select
      v.uid, v.label, v.color, v.uname, v.ucity, v.uavatar, v.val,
      (rank() over (order by v.val desc))::int as rnk,
      (row_number() over (order by v.val desc, v.label))::int as rn
    from vals v
    where v.participates and v.val > 0
  )
  select r.uid, r.label, r.color, r.val, r.rnk, false, r.rn, r.uname, r.ucity, r.uavatar
  from ranked r
  where r.rn > p_offset and r.rn <= p_offset + p_limit
  union all
  select v.uid, v.label, v.color, v.val,
         (select r.rnk from ranked r where r.uid = me), true,
         (select r.rn from ranked r where r.uid = me),
         v.uname, v.ucity, v.uavatar
  from vals v
  where v.uid = me and p_offset = 0;
end;
$$;

revoke execute on function public.rpc_leaderboard(text, text, text, int, int) from public, anon;
grant execute on function public.rpc_leaderboard(text, text, text, int, int) to authenticated;
