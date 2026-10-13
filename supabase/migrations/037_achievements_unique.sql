-- Samma trofé (utmaning + nivå) får bara finnas en gång per konto. Kör efter 036.
--
-- Appen försöker redan bara spara en ny trofé en gång, men databasen stoppade inte dubbletter —
-- t.ex. om appen startades om precis när en trofé sparades kunde samma rad hamna där två gånger,
-- och vänners profiler visade då samma trofé flera gånger. Nu: dubbletterna tas bort (den äldsta
-- raden, alltså när troféen först klarades, behålls) och en regel gör att det inte kan hända igen.

delete from public.achievements a
using public.achievements b
where a.user_id = b.user_id
  and a.achievement_type = b.achievement_type
  and a.level = b.level
  and (a.unlocked_at, a.id) > (b.unlocked_at, b.id);

create unique index if not exists achievements_one_per_user
  on public.achievements (user_id, achievement_type, level);
