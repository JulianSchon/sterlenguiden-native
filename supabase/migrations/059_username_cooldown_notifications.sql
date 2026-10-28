-- 059: Användarnamnet kan bytas en gång i månaden, notiserna är en enda på/av och gamla intressen städas bort.
--
-- Användarnamn: samma regel som namnet. Under onboardingen och första gången ett användarnamn sätts
-- är det fritt; därefter gäller 30 dagar mellan bytena. Databasen sätter tidsstämpeln själv.
--
-- Notiser: i stället för val per ämne och ort finns en enda brytare (enabled). Vad som skickas
-- bestämmer appen: dagens event, nya erbjudanden hos platser man gillat eller besökt och
-- inbjudningar till listor, högst en notis om dagen.
-- Går att köra flera gånger.

alter table public.profiles add column if not exists username_changed_at timestamptz;

create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
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

  -- Användarnamnet: samma regel som namnet
  if new.username is distinct from old.username then
    if old.onboarded_at is null or coalesce(old.username, '') = '' then
      new.username_changed_at := old.username_changed_at;
    else
      if old.username_changed_at is not null
         and old.username_changed_at > now() - interval '30 days' then
        raise exception 'username_cooldown';
      end if;
      new.username_changed_at := now();
    end if;
  else
    new.username_changed_at := old.username_changed_at;
  end if;

  if old.birth_date is not null and new.birth_date is distinct from old.birth_date then
    raise exception 'birth_date_locked';
  end if;

  return new;
end $$;

create or replace function public.profiles_insert_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.display_name_changed_at := null;
  new.username_changed_at := null;
  if new.onboarded_at is not null then
    new.onboarded_at := now();
  end if;
  return new;
end $$;

-- Notiser: en brytare. Den som stängt av alla ämnen tidigare har notiserna avstängda.
alter table public.notification_preferences add column if not exists enabled boolean not null default true;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notification_preferences' and column_name = 'events') then
    update public.notification_preferences set enabled = (events or offers or news or pass);
  end if;
end $$;
alter table public.notification_preferences
  drop column if exists events,
  drop column if exists offers,
  drop column if exists news,
  drop column if exists pass,
  drop column if exists scope,
  drop column if exists towns;
comment on table public.notification_preferences is 'Om användaren vill ha notiser (en brytare).';

-- Intressen: gamla värden från webbversionen ("food", "beach" …) är inga kategorier längre och tas bort
update public.profiles
set interests = array(
  select i from unnest(interests) as i
  where i in ('mat-dryck', 'hotell-bb', 'cafe-bageri', 'butiker', 'natur-upplevelser', 'aktiviteter', 'sevardheter', 'hantverk-service')
)
where interests is not null
  and not interests <@ array['mat-dryck', 'hotell-bb', 'cafe-bageri', 'butiker', 'natur-upplevelser', 'aktiviteter', 'sevardheter', 'hantverk-service'];
