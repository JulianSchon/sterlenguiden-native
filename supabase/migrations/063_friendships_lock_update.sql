-- 063: Vänförfrågan kan bara accepteras, inte skrivas om
--
-- Den som tar emot en vänförfrågan får uppdatera raden (för att acceptera den). Men rättigheten
-- gällde ALLA kolumner, så mottagaren kunde samtidigt byta requester_id till vem som helst och bli
-- "vän" med en person som aldrig skickat någon förfrågan — och då se det som bara vänner ser
-- (listor, besök, profilbild). Nu får man bara ändra status och när man svarade; vem som frågade
-- och vem som fick frågan går inte att ändra. Appen ändrar bara de två kolumnerna (useFriends.ts).

revoke update on public.friendships from authenticated;
grant update (status, responded_at) on public.friendships to authenticated;
