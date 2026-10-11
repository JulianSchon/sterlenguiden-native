-- Högersvep i Upptäck sparas för sig. Kör efter 025.
--
-- Utmaningen Bläddraren ("Svep igenom 15/60/150 platser i Upptäck") räknade bara vänstersvep
-- (discovery_dismissals). Ett högersvep sparar platsen som favorit, men favoriter kan också
-- sparas på andra ställen (sök, platssidan) — så favoriter går inte att räkna som svep. Här
-- loggas varje högersvep, och Bläddraren räknar platser som svepts åt något håll.

create table if not exists public.discovery_likes (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  place_id   integer not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

alter table public.discovery_likes enable row level security;

drop policy if exists "Egna högersvep kan läsas" on public.discovery_likes;
create policy "Egna högersvep kan läsas"
  on public.discovery_likes for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Egna högersvep kan sparas" on public.discovery_likes;
create policy "Egna högersvep kan sparas"
  on public.discovery_likes for insert
  to authenticated
  with check (auth.uid() = user_id);
