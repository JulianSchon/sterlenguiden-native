-- Fem kolumner som inte används. Kör i Supabase → SQL Editor (efter 054). Går att köra flera gånger.
--
-- favorites.service_point_id: webbversionen kunde spara servicepunkter som favoriter, appen kan inte
--   det. Den enda sådana favoriten tas bort.
-- news.slug, source, category, created_by: webbadress, källa, kategori och författare från
--   webbversionen, som appen inte visar. Färre kolumner gör nyheterna lättare att fylla i för hand.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'favorites' and column_name = 'service_point_id') then
    delete from public.favorites where service_point_id is not null and place_id is null and event_id is null;
  end if;
end $$;

-- En favorit är antingen en plats eller ett evenemang
alter table public.favorites drop constraint if exists chk_favorite_type;
alter table public.favorites drop column if exists service_point_id;
alter table public.favorites add constraint chk_favorite_type
  check (((place_id is not null)::integer + (event_id is not null)::integer) = 1);

alter table public.news
  drop column if exists slug,
  drop column if exists source,
  drop column if exists category,
  drop column if exists created_by;

comment on table public.favorites is 'Hjärtan: sparade platser och evenemang.';
