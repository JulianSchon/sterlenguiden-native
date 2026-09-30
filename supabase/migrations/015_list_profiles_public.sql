-- Alla i en lista hette bara "Medlem" (även ägaren själv) — useLists.ts läste profiles direkt
-- (.from("profiles").select(...).in("id", ids)), men precis som i Vänner-grunden tidigare
-- (rpc_get_profile/rpc_search_users) släpper profiles RLS bara igenom den egna raden vid en rå
-- tabellfråga. Samma lösning: en security-definer-funktion som lämnar ut ENDAST de offentliga,
-- ofarliga fälten (inget födelsedatum, inga privata bilder) för en godtycklig lista med id:n —
-- vem som helst kan slå upp namnet/avataren för en medlem i en lista de själva är med i,
-- ingen vän-koppling krävs (till skillnad från rpc_get_profile).

create or replace function public.rpc_list_profiles_public(target_user_ids uuid[])
returns table (
  id            uuid,
  display_name  text,
  circle_color  text,
  avatar_ring   text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.display_name, p.circle_color, p.avatar_ring
  from public.profiles p
  where p.id = any(target_user_ids);
$$;

grant execute on function public.rpc_list_profiles_public(uuid[]) to authenticated;
