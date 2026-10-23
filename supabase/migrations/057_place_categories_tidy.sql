-- 057: Platsernas kategorier och underkategorier städade
--
-- Kategorierna (places.categories) har bara huvudkategorierna, med de namn Mitt företag skriver
-- ("Hantverk & Service", "Café & Bageri" …). De gamla underkategorierna som låg där ("Gallerier",
-- "Barn & Familj" …) flyttas till places.sub_category, där kartan, Sök och Mitt företag läser dem.
-- Underkategorierna är samma lista som i Mitt företag (src/theme/categories.ts, SUBCATEGORIES);
-- värden som inte finns i den tas bort. Felstavningar, dolda radbrytningar och dubbletter rättas.
-- Går att köra flera gånger.

-- En lista med komma: putsar varje del, byter namn, tar bort det som inte ska vara med och dubbletter
create or replace function pg_temp.clean_list(txt text, renames jsonb, drops text[]) returns text
language sql immutable as $$
  select nullif(string_agg(v, ', ' order by first), '')
  from (
    select v, min(ord) as first
    from (
      select coalesce(renames ->> c, c) as v, ord
      from (
        select trim(regexp_replace(p, '\s+', ' ', 'g')) as c, ord
        from unnest(string_to_array(coalesce(txt, ''), ',')) with ordinality as t(p, ord)
      ) cleaned
    ) renamed
    where v <> '' and v <> all(drops)
    group by v
  ) uniq
$$;

-- De gamla underkategorierna i kategorikolumnen
create temporary table if not exists legacy_sub (old text primary key, new text not null);
truncate legacy_sub;
insert into legacy_sub values
  ('Livsmedel & Dagligvaror', 'Livsmedel & Dagligvaror'), ('Kläder & Mode', 'Kläder & Mode'),
  ('Hem & Inredning', 'Hem & Inredning'), ('Sport & Fritid', 'Sport & Fritid'),
  ('Ateljéer', 'Ateljéer'), ('Gallerier', 'Gallerier'), ('Verkstäder', 'Verkstäder'),
  ('Inredning & Livsstil', 'Inredning & Livsstil'), ('Barn & Familj', 'Barn'), ('Äventyr & Sport', 'Sport');

-- 1. Underkategorierna: de egna (putsade) plus de som låg i kategorikolumnen
update public.places p
set sub_category = pg_temp.clean_list(
  concat_ws(',', p.sub_category, (
    select string_agg(l.new, ',')
    from unnest(string_to_array(replace(coalesce(p.categories, ''), 'Ateljéer Sevärdheter', 'Ateljéer, Sevärdheter'), ',')) part
    join legacy_sub l on l.old = trim(regexp_replace(part, '\s+', ' ', 'g'))
  )),
  '{"Cafe": "Café"}'::jsonb,
  array['Butik', 'Skog', 'Göra', 'Byar', 'Natur', 'Lyx', 'Unikt']
);

-- 2. Kategorierna: bara huvudkategorierna, med rätt namn
update public.places p
set categories = pg_temp.clean_list(
  replace(p.categories, 'Ateljéer Sevärdheter', 'Ateljéer, Sevärdheter'),
  '{"Design & Hantverk": "Hantverk & Service", "Cafe & Bageri": "Café & Bageri", "Café & bageri": "Café & Bageri",
    "Sevärdhet": "Sevärdheter", "Sedvärdheter": "Sevärdheter", "Butik": "Butiker"}'::jsonb,
  (select array_agg(old) from legacy_sub)
)
where p.categories is not null;

-- 3. Servicepunkterna: en felstavad laddstation
update public.service_points set type = 'Laddning' where type = 'Ladning';
