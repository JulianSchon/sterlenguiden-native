-- Profilringen tas bort om kravet inte längre är uppfyllt. Kör efter 029.
--
-- 029 kontrollerar kravet när man VÄLJER en ring. Men kravet kan sluta gälla efteråt: en skatt
-- raderas (t.ex. om en skatt tas bort ur collectibles försvinner den hos alla som hittat den),
-- eller någon sparar 30 favoriter, får Kronhjorten och tar sen bort favoriterna igen. Här
-- kontrolleras den valda ringen varje gång en rad som räknas till kraven raderas — skatter,
-- favoriter, egna listor, minnen, inlösta erbjudanden och svep — och nollställs om kravet inte
-- längre uppfylls.
--
-- Prestanda: körs bara vid radering (sällsynt), och bara för personer som har en ring vald.

create or replace function public.recheck_avatar_ring()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Listor har owner_id, övriga tabeller user_id (via jsonb, så samma funktion passar alla)
  owner uuid := coalesce((to_jsonb(old) ->> 'user_id')::uuid, (to_jsonb(old) ->> 'owner_id')::uuid);
  current_ring text;
begin
  select avatar_ring into current_ring from profiles where user_id = owner;
  if current_ring is not null and current_ring <> 'none'
     and not ring_requirement_met(owner, current_ring) then
    update profiles set avatar_ring = null where user_id = owner;
  end if;
  return old;
end;
$$;

drop trigger if exists recheck_avatar_ring on public.user_collectibles;
create trigger recheck_avatar_ring after delete on public.user_collectibles
  for each row execute function public.recheck_avatar_ring();

drop trigger if exists recheck_avatar_ring on public.favorites;
create trigger recheck_avatar_ring after delete on public.favorites
  for each row execute function public.recheck_avatar_ring();

drop trigger if exists recheck_avatar_ring on public.lists;
create trigger recheck_avatar_ring after delete on public.lists
  for each row execute function public.recheck_avatar_ring();

drop trigger if exists recheck_avatar_ring on public.memories;
create trigger recheck_avatar_ring after delete on public.memories
  for each row execute function public.recheck_avatar_ring();

drop trigger if exists recheck_avatar_ring on public.offer_redemptions;
create trigger recheck_avatar_ring after delete on public.offer_redemptions
  for each row execute function public.recheck_avatar_ring();

drop trigger if exists recheck_avatar_ring on public.discovery_dismissals;
create trigger recheck_avatar_ring after delete on public.discovery_dismissals
  for each row execute function public.recheck_avatar_ring();

drop trigger if exists recheck_avatar_ring on public.discovery_likes;
create trigger recheck_avatar_ring after delete on public.discovery_likes
  for each row execute function public.recheck_avatar_ring();
