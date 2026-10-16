-- Platssidan: "Vänner som varit här" och "Stämmer något inte?". Kör i Supabase → SQL Editor.

-- ─── Vänner som varit här ───────────────────────────────────────────────────
-- Vänner som besökt eller sparat platsen. Samma regler som vänprofilen (rpc_friend_stats): bara
-- accepterade vänner, och bara det de redan kan se där (besökta platser och sparade platser).
-- Profilbildens sökväg lämnas ut som i rpc_list_profiles_public (034) — bara till vänner.
create or replace function public.rpc_friends_at_place(p_place_id bigint)
returns table (
  user_id      uuid,
  display_name text,
  username     text,
  circle_color text,
  avatar_ring  text,
  avatar_path  text,
  last_visit   timestamptz,
  visits       integer,
  saved        boolean
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
  visited as (
    select v.user_id, max(v.visited_at) as last_visit, count(*)::integer as visits
    from public.visits v
    where v.place_id = p_place_id
    group by v.user_id
  ),
  saved as (
    select distinct fa.user_id
    from public.favorites fa
    where fa.place_id = p_place_id
  )
  select
    p.user_id, p.display_name, p.username, p.circle_color, p.avatar_ring, p.avatar_url,
    vi.last_visit, coalesce(vi.visits, 0), sa.user_id is not null
  from friends fr
  join public.profiles p on p.user_id = fr.friend_id
  left join visited vi on vi.user_id = fr.friend_id
  left join saved sa on sa.user_id = fr.friend_id
  where vi.user_id is not null or sa.user_id is not null
  order by vi.last_visit desc nulls last, p.display_name
  limit 50;
$$;

revoke execute on function public.rpc_friends_at_place(bigint) from public, anon;
grant execute on function public.rpc_friends_at_place(bigint) to authenticated;

-- ─── Stämmer något inte? ────────────────────────────────────────────────────
-- Besökarnas tips om fel på en platssida (fel öppettider, gamla bilder, stängt …). Läses i
-- Supabase (Table Editor → place_reports); ingen i appen kan läsa dem. Högst 10 per dygn och person.
create table if not exists public.place_reports (
  id         uuid primary key default gen_random_uuid(),
  place_id   bigint not null references public.places(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('hours', 'contact', 'photos', 'description', 'closed', 'other')),
  message    text check (char_length(message) <= 1000),
  created_at timestamptz not null default now(),
  handled    boolean not null default false
);

create index if not exists place_reports_place_idx on public.place_reports (place_id, created_at desc);

alter table public.place_reports enable row level security;

drop policy if exists "Users can report places" on public.place_reports;
create policy "Users can report places"
  on public.place_reports for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function public.place_reports_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from public.place_reports
    where user_id = new.user_id and created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'report_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists place_reports_limit on public.place_reports;
create trigger place_reports_limit
  before insert on public.place_reports
  for each row execute function public.place_reports_limit();
