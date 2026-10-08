-- Topplistor: varje rad visar nu även användarnamn och ort (inte bara visningsnamnet), så man
-- kan skilja två med samma namn åt och se var de bor. Bara för de som själva valt att delta —
-- samma regel som allt annat i funktionen. Ny returtyp = ny funktion i Postgres, så den gamla
-- tas bort först. Kör efter 022.

drop function if exists public.rpc_leaderboard(text, text, text, int, int);

create or replace function public.rpc_leaderboard(
  p_metric text,                -- 'visits' | 'streak' | 'stickers'
  p_scope text,                 -- 'all' | 'area' | 'friends'
  p_period text default 'all',  -- 'month' | 'year' | 'all' (används bara för visits)
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
  city text
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
      s.uid, s.label, s.color, s.uname, s.ucity, s.participates,
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
        when 'stickers' then (
          select count(*)::int from public.user_collectibles uc where uc.user_id = s.uid
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
          select count(*)::int
          from islands i, latest l
          where i.grp = l.grp and l.dday >= today - 1
        )
      end as val
    from scoped s
  ),
  ranked as (
    select
      v.uid, v.label, v.color, v.uname, v.ucity, v.val,
      (rank() over (order by v.val desc))::int as rnk,
      (row_number() over (order by v.val desc, v.label))::int as rn
    from vals v
    where v.participates and v.val > 0
  )
  select r.uid, r.label, r.color, r.val, r.rnk, false, r.rn, r.uname, r.ucity
  from ranked r
  where r.rn > p_offset and r.rn <= p_offset + p_limit
  union all
  select v.uid, v.label, v.color, v.val,
         (select r.rnk from ranked r where r.uid = me), true,
         (select r.rn from ranked r where r.uid = me),
         v.uname, v.ucity
  from vals v
  where v.uid = me and p_offset = 0;
end;
$$;

revoke execute on function public.rpc_leaderboard(text, text, text, int, int) from public, anon;
grant execute on function public.rpc_leaderboard(text, text, text, int, int) to authenticated;
