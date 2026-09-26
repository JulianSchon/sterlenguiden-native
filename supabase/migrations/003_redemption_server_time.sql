-- Aktiveringstiden ska alltid sättas av servern.
--
-- Personalen litar på att en aktivering är "just nu" och att 60-sekundersfönstret räknas från
-- den tid databasen skrev. Kolumnen har redan default now(), men RLS-policyn låter en klient
-- skicka in ett eget värde. Den här triggern skriver alltid över det med serverns tid, så ingen
-- kan backdatera en aktivering för att kringgå regeln "en gång per dag/vecka".

create or replace function public.offer_redemptions_set_time()
returns trigger
language plpgsql
as $$
begin
  new.activated_at := now();
  return new;
end;
$$;

drop trigger if exists offer_redemptions_set_time on public.offer_redemptions;

create trigger offer_redemptions_set_time
  before insert on public.offer_redemptions
  for each row execute function public.offer_redemptions_set_time();
