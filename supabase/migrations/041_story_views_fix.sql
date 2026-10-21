-- Berättelser: "sedd" måste kunna sparas. Kör i Supabase → SQL Editor.
--
-- Appen sparar att man sett en berättelse med en rad per person och berättelse (upsert). Det kräver
-- en regel som säger att samma person bara har en rad per berättelse — saknas den nekas varje
-- sparning tyst, och cirkeln blir aldrig grå. Här:
--   1. tas dubbletter bort (den senaste behålls),
--   2. läggs regeln till (om den inte redan finns),
--   3. får man läsa, lägga till och uppdatera sina egna rader — ingen annans.
-- Går att köra flera gånger.

delete from public.story_views a
using public.story_views b
where a.user_id = b.user_id
  and a.story_id = b.story_id
  and (
    coalesce(a.viewed_at, 'epoch') < coalesce(b.viewed_at, 'epoch')
    or (coalesce(a.viewed_at, 'epoch') = coalesce(b.viewed_at, 'epoch') and a.id < b.id)
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.story_views'::regclass and conname = 'story_views_user_story_key'
  ) then
    alter table public.story_views add constraint story_views_user_story_key unique (user_id, story_id);
  end if;
end $$;

alter table public.story_views enable row level security;

drop policy if exists "Users read own story views" on public.story_views;
create policy "Users read own story views"
  on public.story_views for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users add own story views" on public.story_views;
create policy "Users add own story views"
  on public.story_views for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own story views" on public.story_views;
create policy "Users update own story views"
  on public.story_views for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
