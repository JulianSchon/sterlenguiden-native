-- Profilbakgrund (kortdesignen) och en riktig aktivitetslogg.
--
-- is_member + card_color läggs till på de tre profil-funktionerna, så profilsidan kan visa samma
-- bakgrund som personens eget Österlenpass-kort — ren kosmetik, inget känsligt.
--
-- rpc_friend_stats byggs om: "activity" är en sammanslagen, tidssorterad logg av besök,
-- favorit-tillägg och insamlade klistermärken (med bild), i stället för bara senaste besöken.

-- ------------------------------------------------------------
-- 1. rpc_search_users — + is_member, card_color
-- ------------------------------------------------------------

-- CREATE OR REPLACE kan inte ändra en funktions returtyp (bara innehållet) — de tre funktionerna
-- nedan får nya returkolumner (is_member, card_color) och måste därför droppas först.
drop function if exists public.rpc_search_users(text);

create or replace function public.rpc_search_users(q text)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  city          text,
  circle_color  text,
  avatar_ring   text,
  is_member     boolean,
  card_color    text,
  member_since  timestamptz,
  friendship_id uuid,
  status        text,
  direction     text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.user_id,
    p.username,
    p.display_name,
    p.city,
    p.circle_color,
    p.avatar_ring,
    coalesce(p.is_member, false),
    p.card_color,
    p.created_at,
    f.id,
    f.status,
    case
      when f.id is null then null
      when f.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end
  from public.profiles p
  left join public.friendships f
    on (f.requester_id = auth.uid() and f.addressee_id = p.user_id)
    or (f.addressee_id = auth.uid() and f.requester_id = p.user_id)
  where p.username is not null
    and length(coalesce(q, '')) >= 2
    and p.username ilike q || '%'
    and p.user_id <> auth.uid()
  order by p.username
  limit 20;
$$;

grant execute on function public.rpc_search_users(text) to authenticated;


-- ------------------------------------------------------------
-- 2. rpc_list_friendships — + is_member, card_color
-- ------------------------------------------------------------

drop function if exists public.rpc_list_friendships();

create or replace function public.rpc_list_friendships()
returns table (
  friendship_id uuid,
  user_id       uuid,
  username      text,
  display_name  text,
  city          text,
  circle_color  text,
  avatar_ring   text,
  is_member     boolean,
  card_color    text,
  status        text,
  direction     text,
  created_at    timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    f.id,
    p.user_id,
    p.username,
    p.display_name,
    p.city,
    p.circle_color,
    p.avatar_ring,
    coalesce(p.is_member, false),
    p.card_color,
    f.status,
    case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.user_id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  order by f.created_at desc;
$$;

grant execute on function public.rpc_list_friendships() to authenticated;


-- ------------------------------------------------------------
-- 3. rpc_get_profile — + is_member, card_color
-- ------------------------------------------------------------

drop function if exists public.rpc_get_profile(uuid);

create or replace function public.rpc_get_profile(target_user_id uuid)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  city          text,
  circle_color  text,
  avatar_ring   text,
  is_member     boolean,
  card_color    text,
  member_since  timestamptz,
  friendship_id uuid,
  status        text,
  direction     text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.user_id,
    p.username,
    p.display_name,
    p.city,
    p.circle_color,
    p.avatar_ring,
    coalesce(p.is_member, false),
    p.card_color,
    p.created_at,
    f.id,
    f.status,
    case
      when f.id is null then null
      when f.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end
  from public.profiles p
  left join public.friendships f
    on (f.requester_id = auth.uid() and f.addressee_id = p.user_id)
    or (f.addressee_id = auth.uid() and f.requester_id = p.user_id)
  where p.user_id = target_user_id;
$$;

grant execute on function public.rpc_get_profile(uuid) to authenticated;


-- ------------------------------------------------------------
-- 4. rpc_friend_stats — riktig aktivitetslogg: besök, favorit-tillägg, insamlade stickers
-- ------------------------------------------------------------

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
    'visits_total', (select count(*) from public.visits where user_id = target_user_id),
    'stickers_total', (select count(*) from public.user_collectibles where user_id = target_user_id),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', x.kind, 'label', x.label, 'image_path', x.image_path, 'happened_at', x.happened_at
      ) order by x.happened_at desc)
      from (
        select * from (
          (
            select 'visit' as kind, pl.name as label, null::text as image_path, vi.visited_at as happened_at
            from public.visits vi
            join public.places pl on pl.id = vi.place_id
            where vi.user_id = target_user_id
            order by vi.visited_at desc
            limit 8
          )
          union all
          (
            select 'favorite' as kind, coalesce(pl.name, ev.title) as label, null::text as image_path, fa.created_at as happened_at
            from public.favorites fa
            left join public.places pl on pl.id = fa.place_id
            left join public.events ev on ev.id = fa.event_id
            where fa.user_id = target_user_id
            order by fa.created_at desc
            limit 8
          )
          union all
          (
            select 'sticker' as kind, co.name as label, co.image_path, uc.collected_at as happened_at
            from public.user_collectibles uc
            join public.collectibles co on co.id = uc.collectible_id
            where uc.user_id = target_user_id
            order by uc.collected_at desc
            limit 8
          )
        ) combined
        order by happened_at desc
        limit 8
      ) x
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.rpc_friend_stats(uuid) to authenticated;
