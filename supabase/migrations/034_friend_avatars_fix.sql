-- Vänners profilbilder syns överallt där vänner visas (profilsida, vänlistan, listornas medlemmar
-- och "tillagd av"). Kör efter 033.
--
-- RÄTTELSE av 032 (och 024): läsreglerna för profilbilderna slog upp ägaren i profiles — men en
-- vanlig fråga mot profiles ser bara den egna raden (RLS), så villkoret kunde aldrig bli sant för
-- någon annans bild. Vänner fick därför bara initialerna, och topplistornas profilbilder syntes
-- inte heller. Nu görs kontrollen i en funktion som får läsa profiles (security definer), med
-- exakt samma villkor som förut:
--   - vän (accepterad vänskap) med bildens ägare, eller
--   - ägaren syns i topplistorna och har valt att visa sin profilbild där (024).
-- Bara den aktuella profilbilden öppnas — inte kortfotot eller äldre bilder i samma mapp.
--
-- Dessutom lämnar rpc_list_profiles_public (listornas medlemmar och "tillagd av") och
-- rpc_list_friendships (vänlistan) nu ut profilbildens sökväg — bara för accepterade vänner och
-- en själv, annars null (då visas initialerna).

create or replace function public.avatar_visible_to_me(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where (p.avatar_url = p_object_name or p.avatar_url like '%/profile-images/' || p_object_name)
      and (
        (p.show_in_leaderboard is true and p.show_leaderboard_avatar is true)
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = auth.uid() and f.addressee_id = p.user_id)
              or (f.addressee_id = auth.uid() and f.requester_id = p.user_id))
        )
      )
  );
$$;

revoke execute on function public.avatar_visible_to_me(text) from public, anon;
grant execute on function public.avatar_visible_to_me(text) to authenticated;

drop policy if exists "Leaderboard avatars are visible" on storage.objects;
drop policy if exists "Friends' avatars are visible" on storage.objects;
create policy "Shared avatars are visible"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'profile-images' and public.avatar_visible_to_me(name));

-- ─── Listornas personer: + profilbildens sökväg för vänner och en själv ─────
drop function if exists public.rpc_list_profiles_public(uuid[]);

create or replace function public.rpc_list_profiles_public(target_user_ids uuid[])
returns table (
  user_id       uuid,
  display_name  text,
  username      text,
  circle_color  text,
  avatar_ring   text,
  avatar_path   text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.user_id, p.display_name, p.username, p.circle_color, p.avatar_ring,
    case
      when p.user_id = auth.uid() or exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = auth.uid() and f.addressee_id = p.user_id)
            or (f.addressee_id = auth.uid() and f.requester_id = p.user_id))
      ) then p.avatar_url
      else null
    end
  from public.profiles p
  where p.user_id = any(target_user_ids);
$$;

revoke execute on function public.rpc_list_profiles_public(uuid[]) from public, anon;
grant execute on function public.rpc_list_profiles_public(uuid[]) to authenticated;

-- ─── Vänlistan: + profilbildens sökväg för accepterade vänner ───────────────
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
  created_at    timestamptz,
  avatar_path   text
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
    f.created_at,
    case when f.status = 'accepted' then p.avatar_url else null end
  from public.friendships f
  join public.profiles p
    on p.user_id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  order by f.created_at desc;
$$;

grant execute on function public.rpc_list_friendships() to authenticated;

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
