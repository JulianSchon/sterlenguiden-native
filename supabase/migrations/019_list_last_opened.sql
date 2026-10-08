-- Mitt Österlens listrad sorterades efter created_at (senast SKAPAD först). Viktor vill ha
-- senast ÖPPNAD längst till vänster i stället — en egen liten tabell i stället för en kolumn på
-- list_members, för ägaren har ingen egen rad där (en lista räknas som "min" om jag äger den
-- ELLER är en accepterad medlem, se useLists.ts) — en kolumn på list_members hade missat alla
-- ägarens egna öppningar.
--
-- Per användare, inte delad mellan listans medlemmar — din öppningshistorik ska inte påverka
-- ordningen någon annan ser i sin egen Mitt Österlen.

create table if not exists public.list_opens (
  user_id    uuid not null references auth.users (id) on delete cascade,
  list_id    uuid not null references public.lists (id) on delete cascade,
  opened_at  timestamptz not null default now(),
  primary key (user_id, list_id)
);

alter table public.list_opens enable row level security;

drop policy if exists "Se egna öppningar" on public.list_opens;
drop policy if exists "Sätt egen öppning" on public.list_opens;
drop policy if exists "Uppdatera egen öppning" on public.list_opens;

create policy "Se egna öppningar"
  on public.list_opens for select
  to authenticated
  using (user_id = auth.uid());

create policy "Sätt egen öppning"
  on public.list_opens for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Uppdatera egen öppning"
  on public.list_opens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
