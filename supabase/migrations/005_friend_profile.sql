-- En enskild persons profil, oavsett om ni är vänner än eller inte.
--
-- Samma säkra mönster som rpc_search_users (bara publika fält, aldrig födelsedatum eller privata
-- bilder), men slår upp exakt en person via id i stället för att söka på användarnamn. Används av
-- vänprofilsidan: innan man är vän visas bara namn/ort/medlem-sedan och en "lägg till"-knapp, efter
-- att man blivit vän hämtas statistiken separat via rpc_friend_stats.

create or replace function public.rpc_get_profile(target_user_id uuid)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  city          text,
  circle_color  text,
  avatar_ring   text,
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
