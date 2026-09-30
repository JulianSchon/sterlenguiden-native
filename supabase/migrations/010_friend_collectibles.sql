-- Vänprofilens Samlarobjekt-sektion (under Troféer) behöver en riktig lista över insamlade
-- stickers — stickers_total var hittills bara en räknare, inte vilka. Samma mönster som
-- troféerna: senast insamlad först, ingen gräns (få stickers totalt, likt de max 21 troféerna).

create or replace function public.rpc_friend_stats(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
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
      from public.achievements
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
$$;

grant execute on function public.rpc_friend_stats(uuid) to authenticated;
