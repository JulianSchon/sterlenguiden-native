-- Listans egen omslagsbild ("Byt omslagsbild" i alternativ-menyn) — tidigare fanns bara det
-- auto-genererade kollaget av platsbilder (ListCover-komponenten), ingen egen vald bild.
-- Public bucket: omslag är inte känsliga bilder (ägaren väljer dem själv, syns för alla
-- medlemmar), så samma mönster som business-stories i stället för en privat, signerad mapp.

alter table public.lists
  add column if not exists cover_image_url text;

insert into storage.buckets (id, name, public)
values ('list-covers', 'list-covers', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view list covers" on storage.objects;
create policy "Anyone can view list covers"
  on storage.objects for select
  using (bucket_id = 'list-covers');

drop policy if exists "Authenticated upload list covers" on storage.objects;
create policy "Authenticated upload list covers"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'list-covers');

drop policy if exists "Owner can delete own list covers" on storage.objects;
create policy "Owner can delete own list covers"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'list-covers' and owner = auth.uid());
