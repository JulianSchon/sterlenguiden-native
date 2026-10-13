-- Vänner ser varandras profilbild. Kör efter 031.
--
-- En persons profilsida visar nu framsidan av hens medlemskort (design, ring, namn). Profilbilden på
-- kortet syns bara för vänner — alla andra ser initialerna. Profilbilderna ligger i den privata
-- mappen profile-images, så två saker öppnas, båda bara när vänskapen är accepterad:
--
--   1. rpc_get_profile lämnar ut bildens sökväg (avatar_path) — annars null.
--   2. En ny läsregel öppnar exakt den aktuella profilbilden (inte kortfotot på baksidan eller äldre
--      bilder i samma mapp) för den som är vän med ägaren. Reglerna läggs ihop med ELLER (som
--      topplistornas regel i 024), så ingen befintlig läsrätt ändras.
--
-- Tas vänskapen bort slutar båda att gälla direkt. (En redan hämtad länk gäller högst en timme.)

drop policy if exists "Friends' avatars are visible" on storage.objects;
create policy "Friends' avatars are visible"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-images'
    and exists (
      select 1
      from public.profiles p
      join public.friendships f
        on f.status = 'accepted'
       and ((f.requester_id = auth.uid() and f.addressee_id = p.user_id)
         or (f.addressee_id = auth.uid() and f.requester_id = p.user_id))
      where p.avatar_url = storage.objects.name
         or p.avatar_url like '%/profile-images/' || storage.objects.name
    )
  );

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
  friends_since timestamptz,
  avatar_path   text
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
    case when f.status = 'accepted' then f.responded_at else null end,
    -- Profilbilden bara för vänner (och för en själv)
    case when f.status = 'accepted' or p.user_id = auth.uid() then p.avatar_url else null end
  from public.profiles p
  left join public.friendships f
    on (f.requester_id = auth.uid() and f.addressee_id = p.user_id)
    or (f.addressee_id = auth.uid() and f.requester_id = p.user_id)
  where p.user_id = target_user_id;
$$;

grant execute on function public.rpc_get_profile(uuid) to authenticated;
