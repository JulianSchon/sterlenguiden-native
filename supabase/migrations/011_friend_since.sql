-- Vänprofilens botten ska visa "Vänner sedan ..." bredvid "Medlem sedan ..." — kräver datumet ni
-- faktiskt blev vänner (responded_at, satt av useAcceptFriendRequest), inte bara att status är
-- 'accepted'. rpc_get_profile fick aldrig med det förut.

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
  direction     text,
  friends_since timestamptz
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
    end,
    case when f.status = 'accepted' then f.responded_at else null end
  from public.profiles p
  left join public.friendships f
    on (f.requester_id = auth.uid() and f.addressee_id = p.user_id)
    or (f.addressee_id = auth.uid() and f.requester_id = p.user_id)
  where p.user_id = target_user_id;
$$;

grant execute on function public.rpc_get_profile(uuid) to authenticated;
