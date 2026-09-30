-- "Lägg till vänner" (Medlemmar) i Ny lista ska inte lägga in folk i andras listor direkt — de
-- måste acceptera. join_list (kod) och ägarens egen rad (trigger vid skapande) är fortfarande
-- omedelbara ('accepted' direkt); bara add_list_members sätter nu 'pending' i stället.

alter table public.list_members
  add column if not exists status text not null default 'accepted'
  check (status in ('pending', 'accepted'));

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
      insert into public.list_members (list_id, user_id, role, status)
      values (target_list_id, uid, 'member', 'pending')
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.add_list_members(uuid, uuid[]) to authenticated;

-- Bara den egna raden man accepterar — owner-oberoende, man kan bara flippa sin egen inbjudan.
create or replace function public.accept_list_invite(target_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.list_members
  set status = 'accepted'
  where list_id = target_list_id and user_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'invite_not_found';
  end if;
end;
$$;

grant execute on function public.accept_list_invite(uuid) to authenticated;

-- Pending inbjudningar TILL mig, med listans namn och ägarens namn för kortet på Mitt Österlen.
create or replace function public.rpc_pending_list_invites()
returns table (
  list_id    uuid,
  list_name  text,
  owner_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    l.id,
    l.name,
    coalesce(p.display_name, p.username, 'Någon')
  from public.list_members lm
  join public.lists l on l.id = lm.list_id
  left join public.profiles p on p.id = l.owner_id
  where lm.user_id = auth.uid() and lm.status = 'pending';
$$;

grant execute on function public.rpc_pending_list_invites() to authenticated;
