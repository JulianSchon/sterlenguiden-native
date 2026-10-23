-- 056: Profilen — användaren får bara ändra det som ska gå att ändra
--
-- Medlemskapet (is_member, member_until …) låses redan av triggern profiles_membership_guard.
-- Nu får appen dessutom bara skriva de kolumner den faktiskt använder: namn, användarnamn,
-- födelsedag, stad, intressen, språk, färger, bilder och topplistans val. Allt annat — medlemskapet,
-- created_at ("Medlem sedan"), id, user_id och tidsstämplarna — kan bara databasen själv ändra.
-- Databasens egna funktioner (inlösen av presentkod, nytt konto, radera konto) körs som databasen
-- och påverkas inte.

revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated, anon;

-- Nytt konto (onboardingen skapar raden om den inte redan finns)
grant insert (
  user_id, display_name, username, birth_date, birth_year, city, lives_in_osterlen,
  interests, preferred_language, onboarded_at, circle_color
) on public.profiles to authenticated;

-- Det man kan ändra under Konto, Utseende, språket och topplistan
grant update (
  display_name, username, birth_date, birth_year, city, lives_in_osterlen, interests,
  preferred_language, onboarded_at, circle_color, card_color, avatar_ring, avatar_url,
  profile_image_url, show_in_leaderboard, show_leaderboard_avatar
) on public.profiles to authenticated;
