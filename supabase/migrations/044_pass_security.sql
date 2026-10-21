-- Österlenpasset: ingen ska kunna ändra priser, skapa köp eller koder, eller ge sig själv passet.
-- Kör i Supabase → SQL Editor.
--
--   1. pass_products (priserna): alla får läsa, ingen kan ändra från appen. Du ändrar fortfarande
--      priserna som vanligt i Table Editor (där är du inloggad som ägare).
--   2. pass_purchases (köpen): man ser bara sina egna. Köp skrivs bara av servern när
--      betalningen är klar (Stripe, senare) — aldrig av appen.
--   3. pass_gifts (gåvokoderna): köparen och den som löst in ser gåvan. Koder skapas bara av
--      servern efter betalning, och löses in med redeem_pass_code — ingen kan lista andras koder.
--   4. profiles: medlemskapet (is_member, member_until …) kan bara ändras av servern och av
--      databasens egna funktioner (t.ex. inlösen av kod). Appen själv kan aldrig sätta det.
-- Går att köra flera gånger.

-- Alla gamla regler på de tre tabellerna tas bort, så bara reglerna nedan gäller
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('pass_products', 'pass_purchases', 'pass_gifts')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 1. Priserna
alter table public.pass_products enable row level security;
create policy "Anyone can read pass products"
  on public.pass_products for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.pass_products from anon, authenticated;

-- 2. Köpen
alter table public.pass_purchases enable row level security;
create policy "Users read own purchases"
  on public.pass_purchases for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.pass_purchases from anon, authenticated;

-- 3. Gåvokoderna
alter table public.pass_gifts enable row level security;
create policy "Buyer and recipient read gift"
  on public.pass_gifts for select to authenticated using (buyer_id = auth.uid() or claimed_by = auth.uid());
revoke insert, update, delete, truncate on public.pass_gifts from anon, authenticated;

-- 4. Medlemskapet. current_user är 'authenticated' när appen skriver själv, men databasens ägare
-- inne i funktioner som redeem_pass_code (security definer) och 'service_role' för servern.
create or replace function public.profiles_membership_guard() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_member := false;
    new.member_until := null;
    new.member_started_at := null;
    new.member_period := null;
    new.member_auto_renew := false;
    new.member_bonus_days := 0;
    return new;
  end if;
  if (new.is_member, new.member_until, new.member_started_at, new.member_period, new.member_auto_renew, new.member_bonus_days)
     is distinct from
     (old.is_member, old.member_until, old.member_started_at, old.member_period, old.member_auto_renew, old.member_bonus_days) then
    raise exception 'membership_locked';
  end if;
  return new;
end $$;

drop trigger if exists profiles_membership_guard on public.profiles;
create trigger profiles_membership_guard before insert or update on public.profiles
  for each row execute function public.profiles_membership_guard();
