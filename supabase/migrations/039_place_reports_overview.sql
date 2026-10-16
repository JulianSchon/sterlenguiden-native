-- Tipsen från "Stämmer något inte?" (platssidan) som en lättläst lista. Kör i Supabase → SQL Editor.
--
-- Läs dem i Supabase → Table Editor → place_reports_overview: nyast först, med platsens namn, vad
-- tipset gäller på svenska, meddelandet och vem som skickade det. Själva tipsen ligger i
-- place_reports (där kan man bocka i "handled" när man rättat, eller ta bort raden).
--
-- Bara för den som är inloggad i Supabase: vyn följer tabellens regler (security_invoker), och
-- där får ingen i appen läsa — appen kan bara skicka tips.

create or replace view public.place_reports_overview
with (security_invoker = true) as
select
  r.created_at                                 as "Skickat",
  p.name                                       as "Plats",
  case r.kind
    when 'hours' then 'Öppettiderna'
    when 'contact' then 'Telefon eller länkar'
    when 'photos' then 'Bilderna'
    when 'description' then 'Beskrivningen'
    when 'closed' then 'Platsen har stängt'
    else 'Något annat'
  end                                          as "Gäller",
  r.message                                    as "Meddelande",
  coalesce(pr.username, pr.display_name)       as "Från",
  r.handled                                    as "Åtgärdat",
  r.place_id,
  r.id
from public.place_reports r
join public.places p on p.id = r.place_id
left join public.profiles pr on pr.user_id = r.user_id
order by r.created_at desc;

revoke all on public.place_reports_overview from anon, authenticated;
