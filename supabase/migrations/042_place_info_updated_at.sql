-- Platssidan: "Senast uppdaterad …" längst ner. Kör i Supabase → SQL Editor.
--
-- En egen tid för när platsens fasta info senast ändrades: namn, beskrivningar, öppettider, länkar,
-- kontakt, bilder, kategorier, bekvämligheter, hållplats och läge. Tiden sätts av databasen själv
-- när något av det ändras på riktigt (sparar man samma värde igen räknas det inte). Erbjudanden, berättelser och evenemang
-- ligger i egna tabeller och påverkar den inte, och inte heller interna fält som nivå eller QR-kod.
--
-- Befintliga platser får ingen tid förrän deras info ändras första gången — då visas raden.
-- Går att köra flera gånger.

alter table public.places add column if not exists info_updated_at timestamptz;

create or replace function public.places_touch_info_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.info_updated_at := coalesce(new.info_updated_at, now());
  elsif (new.name, new.description, new.short_description, new.opening_hours::text, new.website_url,
         new.book_url, new.phone, new.email, new.instagram_url, new.facebook_url, new.image_url,
         new.logo_url, new.categories, new.sub_category, new.nearest_town, new.lat, new.lng,
         new.price_level, new.amenities::text, new.transit_stop_name)
        is distinct from
        (old.name, old.description, old.short_description, old.opening_hours::text, old.website_url,
         old.book_url, old.phone, old.email, old.instagram_url, old.facebook_url, old.image_url,
         old.logo_url, old.categories, old.sub_category, old.nearest_town, old.lat, old.lng,
         old.price_level, old.amenities::text, old.transit_stop_name) then
    new.info_updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists places_info_updated_at on public.places;
create trigger places_info_updated_at
  before insert or update on public.places
  for each row execute function public.places_touch_info_updated_at();
