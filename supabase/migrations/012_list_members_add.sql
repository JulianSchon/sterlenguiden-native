-- Låter en listas ägare lägga till sina vänner direkt som medlemmar (t.ex. redan när listan
-- skapas), i stället för att bara kunna bjuda in via kod. Kräver att mottagaren faktiskt är en
-- accepterad vän — annars skulle vem som helst kunna lägga till sig själv i andras listor bara
-- genom att känna till deras user_id.

create or replace function public.add_list_members(target_list_id uuid, target_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner boolean;
  uid uuid;
begin
  select exists(
    select 1 from public.lists where id = target_list_id and owner_id = auth.uid()
  ) into is_owner;

  if not is_owner then
    raise exception 'not_owner';
  end if;

  foreach uid in array target_user_ids loop
    if exists (
      select 1 from public.friendships
      where status = 'accepted'
        and (
          (requester_id = auth.uid() and addressee_id = uid)
          or (requester_id = uid and addressee_id = auth.uid())
        )
    ) then
      insert into public.list_members (list_id, user_id, role)
      values (target_list_id, uid, 'member')
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.add_list_members(uuid, uuid[]) to authenticated;
