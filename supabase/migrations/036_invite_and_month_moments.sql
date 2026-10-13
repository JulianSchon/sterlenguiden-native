-- Mitt Österlens sista två ögonblick. Kör efter 035.
--
-- 1. Listinbjudan: rpc_pending_list_invites lämnar ut mer, så inbjudan kan visas som ett eget
--    ögonblick — vem som bjöd in (namn, ring, färg och profilbild; inbjudaren är alltid en vän,
--    se add_list_members), listans omslag, de första platserna (till omslagets kollage) och antal
--    platser.
--    RÄTTELSE: ägaren slogs upp med profiles.id i stället för profiles.user_id, så namnet blev
--    alltid "Någon".
-- 2. Ny månad på topplistan: rpc_my_last_leaderboard berättar hur det gick förra månaden (eller
--    förra året) i topplistan "Flest besök" för hela appen — samma regel som topplistan och
--    korten (unika platser, svensk tid, bara de som syns i topplistan). Tom om man inte deltog
--    eller inte besökte något.

-- ─── 1. Listinbjudan ─────────────────────────────────────────────────────────
drop function if exists public.rpc_pending_list_invites();

create or replace function public.rpc_pending_list_invites()
returns table (
  list_id            uuid,
  list_name          text,
  owner_id           uuid,
  owner_name         text,
  owner_circle_color text,
  owner_ring         text,
  owner_avatar_path  text,
  cover_image_url    text,
  first_place_ids    bigint[],
  place_count        int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    l.id,
    l.name,
    l.owner_id,
    coalesce(nullif(trim(p.display_name), ''), p.username, 'Någon'),
    p.circle_color,
    p.avatar_ring,
    -- Profilbilden bara om ni är vänner (det är man alltid när man blivit inbjuden)
    case when exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = l.owner_id)
          or (f.addressee_id = auth.uid() and f.requester_id = l.owner_id))
    ) then p.avatar_url else null end,
    l.cover_image_url,
    array(
      select lp.place_id::bigint from public.list_places lp
      where lp.list_id = l.id
      order by lp.position, lp.created_at desc
      limit 4
    ),
    (select count(*)::int from public.list_places lp where lp.list_id = l.id)
  from public.list_members lm
  join public.lists l on l.id = lm.list_id
  left join public.profiles p on p.user_id = l.owner_id
  where lm.user_id = auth.uid() and lm.status = 'pending'
  order by lm.joined_at;
$$;

grant execute on function public.rpc_pending_list_invites() to authenticated;

-- ─── 2. Förra månaden / förra året på topplistan ─────────────────────────────
create or replace function public.rpc_my_last_leaderboard(p_period text)
returns table (period_start date, placement int, visit_count int, participants int)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  from_date date;
  to_date_excl date;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if p_period = 'month' then
    to_date_excl := date_trunc('month', now() at time zone 'Europe/Stockholm')::date;
    from_date := (to_date_excl - interval '1 month')::date;
  elsif p_period = 'year' then
    to_date_excl := date_trunc('year', now() at time zone 'Europe/Stockholm')::date;
    from_date := (to_date_excl - interval '1 year')::date;
  else
    raise exception 'bad_period';
  end if;

  return query
  with counts as (
    select p.user_id as uid, count(distinct v.place_id)::int as n
    from public.profiles p
    join public.visits v on v.user_id = p.user_id
    where p.show_in_leaderboard is true
      and (v.visited_at at time zone 'Europe/Stockholm')::date >= from_date
      and (v.visited_at at time zone 'Europe/Stockholm')::date < to_date_excl
    group by p.user_id
  ),
  ranked as (
    select c.uid, c.n, (rank() over (order by c.n desc))::int as rnk from counts c
  )
  select from_date, r.rnk, r.n, (select count(*)::int from counts)
  from ranked r
  where r.uid = me;
end;
$$;

revoke execute on function public.rpc_my_last_leaderboard(text) from public, anon;
grant execute on function public.rpc_my_last_leaderboard(text) to authenticated;
