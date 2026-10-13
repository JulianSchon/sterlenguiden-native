-- Listor synliga för vänner. Kör efter 032.
--
-- Två olika saker:
--   - Bjuda in vänner till en lista (list_members) — de kan då också redigera. Som förut.
--   - Visa en lista för vänner (nytt, lists.visible_to_friends) — vännerna ser den på ägarens
--     profilsida och kan titta på platserna, men inte ändra något. Avstängt som standard.
--
-- Vännerna läser listorna bara via rpc_friend_lists nedan, så listornas vanliga åtkomstregler är
-- orörda (en vän blir aldrig medlem och kan inte läsa listan på något annat sätt).

alter table public.lists add column if not exists visible_to_friends boolean not null default false;

-- En väns listor som hen valt att visa för vänner, nyast först, med platserna i listans ordning.
-- Tom om ni inte är vänner.
create or replace function public.rpc_friend_lists(target_user_id uuid)
returns table (
  id              uuid,
  name            text,
  description     text,
  cover_image_url text,
  place_ids       bigint[],
  created_at      timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    l.id,
    l.name,
    l.description,
    l.cover_image_url,
    array(
      select lp.place_id::bigint from public.list_places lp
      where lp.list_id = l.id
      order by lp.position, lp.created_at desc
    ),
    l.created_at
  from public.lists l
  where l.owner_id = target_user_id
    and l.visible_to_friends
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = target_user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = target_user_id))
    )
  order by l.created_at desc;
$$;

grant execute on function public.rpc_friend_lists(uuid) to authenticated;
