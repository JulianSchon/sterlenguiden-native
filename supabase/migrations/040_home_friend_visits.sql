-- Hem: vänners senaste besök i flödet ("Anna var på Kiviks Musteri"). Kör i Supabase → SQL Editor.
--
-- Samma regler som vänprofilen (rpc_friend_stats): bara accepterade vänner, och bara det de redan
-- kan se där (besökta platser). Senaste besöket per vän och plats, de senaste 30 dagarna, nyast
-- först. Profilbildens sökväg lämnas ut som i rpc_list_profiles_public (034) — bara till vänner.

create or replace function public.rpc_friends_recent_visits(p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  username     text,
  circle_color text,
  avatar_ring  text,
  avatar_path  text,
  place_id     bigint,
  visited_at   timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with friends as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ),
  latest as (
    select v.user_id, v.place_id, max(v.visited_at) as visited_at
    from public.visits v
    join friends fr on fr.friend_id = v.user_id
    where v.visited_at > now() - interval '30 days'
    group by v.user_id, v.place_id
  )
  select
    p.user_id, p.display_name, p.username, p.circle_color, p.avatar_ring, p.avatar_url,
    l.place_id::bigint, l.visited_at
  from latest l
  join public.profiles p on p.user_id = l.user_id
  order by l.visited_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.rpc_friends_recent_visits(integer) from public, anon;
grant execute on function public.rpc_friends_recent_visits(integer) to authenticated;
