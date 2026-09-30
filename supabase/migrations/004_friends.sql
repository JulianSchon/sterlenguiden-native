-- Vänner: grunden.
--
-- Sökning sker på användarnamn, inte namn (namn krockar för lätt). Vänrelationer är en enda rad
-- per par med status pending/accepted; att neka, avbryta eller ta bort en vän är samma sak —
-- radera raden. Ett unikt index på paret (oordnat) gör att det aldrig kan finnas två rader för
-- samma två personer samtidigt.
--
-- Tre säkerhetsdefinierade funktioner (security definer) gör jobbet i stället för att öppna upp
-- profiles-tabellens vanliga RLS för alla: de returnerar bara de fält som faktiskt behövs
-- (aldrig födelsedatum, aldrig privata bilder) och kontrollerar vänskap innan statistik lämnas ut.

-- ------------------------------------------------------------
-- 1. Användarnamn på profiles
-- ------------------------------------------------------------

alter table public.profiles add column if not exists username text;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-zA-Z0-9_.]{3,20}$');

-- Skiftlägesokänsligt unikt: "Mats" och "mats" är samma användarnamn
drop index if exists profiles_username_unique_idx;
create unique index profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;


-- ------------------------------------------------------------
-- 2. Vänrelationer
-- ------------------------------------------------------------

create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users (id) on delete cascade,
  addressee_id  uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- Bara en relation per par åt gången, oavsett vem som skickade den
drop index if exists friendships_unique_pair_idx;
create unique index friendships_unique_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

drop policy if exists "Se egna vänrelationer"      on public.friendships;
drop policy if exists "Skicka vänförfrågan"        on public.friendships;
drop policy if exists "Acceptera vänförfrågan"     on public.friendships;
drop policy if exists "Ta bort egen vänrelation"   on public.friendships;

create policy "Se egna vänrelationer"
  on public.friendships for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Skicka vänförfrågan"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

-- Bara mottagaren kan acceptera, och bara en väntande förfrågan
create policy "Acceptera vänförfrågan"
  on public.friendships for update
  to authenticated
  using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status = 'accepted');

-- Neka, avbryta och ta bort en vän är alla samma sak: radera raden. Båda parter får göra det.
create policy "Ta bort egen vänrelation"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);


-- ------------------------------------------------------------
-- 3. Sök användare på användarnamn
-- ------------------------------------------------------------

create or replace function public.rpc_search_users(q text)
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
  where p.username is not null
    and length(coalesce(q, '')) >= 2
    and p.username ilike q || '%'
    and p.user_id <> auth.uid()
  order by p.username
  limit 20;
$$;

grant execute on function public.rpc_search_users(text) to authenticated;


-- ------------------------------------------------------------
-- 4. Lista alla egna vänrelationer (väntande + accepterade)
-- ------------------------------------------------------------

create or replace function public.rpc_list_friendships()
returns table (
  friendship_id uuid,
  user_id       uuid,
  username      text,
  display_name  text,
  city          text,
  circle_color  text,
  avatar_ring   text,
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
-- 5. En väns statistik — bara om ni faktiskt är vänner
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
    'recent_visits', coalesce((
      select jsonb_agg(jsonb_build_object('place_name', v.place_name, 'visited_at', v.visited_at) order by v.visited_at desc)
      from (
        select pl.name as place_name, vi.visited_at
        from public.visits vi
        join public.places pl on pl.id = vi.place_id
        where vi.user_id = target_user_id
        order by vi.visited_at desc
        limit 5
      ) v
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.rpc_friend_stats(uuid) to authenticated;
