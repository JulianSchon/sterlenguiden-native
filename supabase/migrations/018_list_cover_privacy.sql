-- Migration 014 gjorde list-covers-bucketen läsbar av VEM SOM HELST, utan inloggning:
-- "using (bucket_id = 'list-covers')" har inget villkor alls. Det betydde inte bara att man
-- kunde gissa sig till en känd URL (det var det tänkta, accepterade läget, se 014:s kommentar)
-- — det gick dessutom att LISTA bucketens innehåll rakt av med bara appens publika anon-nyckel
-- (ingen inloggning krävs), t.ex:
--   POST /storage/v1/object/list/list-covers  { "prefix": "" }
-- ...vilket radade upp alla listors id:n (mapparna heter listans id) och sen filnamnen i varje.
-- I praktiken kunde vem som helst skörda alla listors omslagsbilder i hela appen. Verifierat
-- live mot databasen innan denna fix skrevs, inte en teoretisk risk.
--
-- Bucketen får vara kvar "public" (Storage-flaggan som avgör om en URL funkar utan Bearer-token)
-- — RLS på storage.objects körs ÄNDÄ för den publika läsvägen, det är den som saknade ett
-- villkor. Så detta räcker: inget behov av signerade URL:er eller att bygga om hur appen läser
-- cover_image_url. Kvar som tidigare: har man redan den exakta URL:en (t.ex. delad av en
-- medlem) går bilden fortfarande att se — det var redan det avsedda, accepterade läget för en
-- "public" bucket. Det nya är att ingen längre kan LETA UPP den URL:en utan att själv vara
-- ägare eller accepterad medlem i just den listan.

drop policy if exists "Anyone can view list covers" on storage.objects;
create policy "List members can view list covers"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'list-covers'
    and exists (
      select 1 from public.lists l
      where l.id::text = split_part(storage.objects.name, '/', 1)
        and (
          l.owner_id = auth.uid()
          or exists (
            select 1 from public.list_members lm
            where lm.list_id = l.id and lm.user_id = auth.uid() and lm.status = 'accepted'
          )
        )
    )
  );
