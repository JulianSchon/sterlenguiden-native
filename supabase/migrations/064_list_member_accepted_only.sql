-- 064: Bara den som tackat ja räknas som medlem i en lista
--
-- is_list_member räknade även den som bara blivit inbjuden (status 'pending'). Den inbjudna kunde
-- därför redan innan svaret se listan och dess medlemmar, och lägga till och ta bort platser — även
-- om de tänkte tacka nej. Nu räknas bara 'accepted'. Funktionen styr reglerna på lists,
-- list_members och list_places, så alla tre följer med.
--
-- Inget i appen ändras av det: inbjudan och dess förhandsvisning hämtas via
-- rpc_pending_list_invites (egen funktion), listorna i appen visar redan bara de man tackat ja till
-- (useLists), ägaren ser fortfarande vem som är inbjuden (ägaren är själv 'accepted'), och att tacka
-- nej (ta bort sin egen rad) använder inte den här kollen.

create or replace function public.is_list_member(l uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from list_members
    where list_id = l and user_id = auth.uid() and status = 'accepted'
  )
$$;
