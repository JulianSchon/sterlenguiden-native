-- 015 matchade på profiles.id, men profiles nycklas på user_id (id är radens eget id, samma sak
-- som rpc_get_profile använder: "where p.user_id = target_user_id"). Ingen rad matchade någonsin,
-- så alla i en lista hette "Medlem" — även en själv. Returkolumnerna ändras (id → user_id, plus
-- username som reserv när display_name saknas), därför drop först.

drop function if exists public.rpc_list_profiles_public(uuid[]);

create or replace function public.rpc_list_profiles_public(target_user_ids uuid[])
returns table (
  user_id       uuid,
  display_name  text,
  username      text,
  circle_color  text,
  avatar_ring   text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, p.display_name, p.username, p.circle_color, p.avatar_ring
  from public.profiles p
  where p.user_id = any(target_user_ids);
$$;

revoke execute on function public.rpc_list_profiles_public(uuid[]) from public, anon;
grant execute on function public.rpc_list_profiles_public(uuid[]) to authenticated;
