-- Onboardingen: intressen och "kontot är klart". Kör i Supabase → SQL Editor.
--
--   1. interests: kategorierna man valt att man gillar (frivilligt). Hem och Kalender använder dem
--      för "Eftersom du gillar …" redan första dagen.
--   2. onboarded_at: när man gått igenom onboardingen. Saknas den skickas man tillbaka dit (t.ex.
--      om appen stängdes mitt i). Alla som redan har ett konto räknas som klara.
--   3. Namnregeln (en gång i månaden) gäller först när kontot är klart, så man kan rätta ett
--      felskrivet namn under onboardingen. Födelsedagen är låst så fort den sparats, som förut.
--      onboarded_at sätts av databasen (en gång) och kan inte tas bort.
--   4. Man får skapa sin egen profilrad om den saknas, aldrig någon annans.
-- Går att köra flera gånger.

alter table public.profiles add column if not exists interests text[];
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- Alla befintliga konton är redan igång
update public.profiles set onboarded_at = coalesce(created_at, now()) where onboarded_at is null;

create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- När kontot blev klart sätts av databasen, en gång, och kan aldrig ändras eller tas bort
  if old.onboarded_at is not null then
    new.onboarded_at := old.onboarded_at;
  elsif new.onboarded_at is not null then
    new.onboarded_at := now();
  end if;

  if new.display_name is distinct from old.display_name then
    if old.onboarded_at is null then
      -- Under onboardingen får namnet rättas fritt
      new.display_name_changed_at := old.display_name_changed_at;
    else
      -- Första gången man sätter ett namn är fritt; därefter gäller 30 dagar
      if coalesce(old.display_name, '') <> ''
         and old.display_name_changed_at is not null
         and old.display_name_changed_at > now() - interval '30 days' then
        raise exception 'display_name_cooldown';
      end if;
      new.display_name_changed_at := case
        when coalesce(old.display_name, '') = '' then old.display_name_changed_at
        else now() end;
    end if;
  else
    -- Klienten får inte skriva tidsstämpeln själv
    new.display_name_changed_at := old.display_name_changed_at;
  end if;

  if old.birth_date is not null and new.birth_date is distinct from old.birth_date then
    raise exception 'birth_date_locked';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- En ny profilrad: man kan inte skriva in att kontot redan är klart eller en egen namntid
create or replace function public.profiles_insert_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.display_name_changed_at := null;
  if new.onboarded_at is not null then
    new.onboarded_at := now();
  end if;
  return new;
end $$;

drop trigger if exists profiles_insert_guard on public.profiles;
create trigger profiles_insert_guard before insert on public.profiles
  for each row execute function public.profiles_insert_guard();

drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile"
  on public.profiles for insert to authenticated
  with check (user_id = auth.uid());

-- En profil per konto (läggs bara till om det inte redan finns dubbletter)
do $$
begin
  if not exists (select 1 from public.profiles group by user_id having count(*) > 1) then
    create unique index if not exists profiles_user_id_unique_idx on public.profiles (user_id);
  end if;
end $$;
