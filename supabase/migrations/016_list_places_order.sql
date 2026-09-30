-- Drag & drop-ordning på platserna i en lista. Backfyller position efter created_at (äldst
-- först) så befintliga listor får en rimlig startordning, inte en slumpmässig en.

alter table public.list_places
  add column if not exists position integer;

with ordered as (
  select id, row_number() over (partition by list_id order by created_at asc) - 1 as rn
  from public.list_places
  where position is null
)
update public.list_places lp
set position = ordered.rn
from ordered
where lp.id = ordered.id;

alter table public.list_places
  alter column position set default 0,
  alter column position set not null;

-- Alla medlemmar kan dra om ordningen (samma rättighet som att lägga till/ta bort platser) — en
-- RPC i stället för en rå UPDATE-policy, så vi kollar medlemskap på ett ställe och inte kan
-- råka öppna upp uppdatering av andra fält än position.
create or replace function public.reorder_list_places(target_list_id uuid, ordered_row_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_member boolean;
  row_id uuid;
  idx integer := 0;
begin
  select exists(
    select 1 from public.list_members
    where list_id = target_list_id and user_id = auth.uid() and status = 'accepted'
  ) or exists(
    select 1 from public.lists where id = target_list_id and owner_id = auth.uid()
  ) into is_member;

  if not is_member then
    raise exception 'not_a_member';
  end if;

  foreach row_id in array ordered_row_ids loop
    update public.list_places set position = idx where id = row_id and list_id = target_list_id;
    idx := idx + 1;
  end loop;
end;
$$;

grant execute on function public.reorder_list_places(uuid, uuid[]) to authenticated;
