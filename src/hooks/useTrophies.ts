import { useEffect, useMemo } from "react";
import { useVisits } from "@/hooks/useVisits";
import { usePlaces } from "@/hooks/usePlaces";
import { useFavorites } from "@/hooks/useFavorites";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useDiscoveryLikes, useDismissals } from "@/hooks/useDismissals";
import { useAuth } from "@/hooks/useAuth";
import { useLists } from "@/hooks/useLists";
import { useMemories } from "@/hooks/useMemories";
import { useAchievements, useGrantAchievement } from "@/hooks/useAchievements";
import { buildTrophies, computeUserStats, type Trophy } from "@/lib/achievements";

/**
 * Användarens siffror och alla 21 troféer, uträknade ur riktig data.
 * Samma motor (src/lib/achievements.ts) för Utmaningar, Statistik, Profil
 * och incheckningens belöningsskärm — så de aldrig kan visa olika saker.
 */
export function useTrophies() {
  const visitsQ = useVisits();
  const placesQ = usePlaces();
  const favoritesQ = useFavorites();
  const redemptionsQ = useOfferRedemptions();
  const dismissalsQ = useDismissals();
  const likesQ = useDiscoveryLikes();
  const achievementsQ = useAchievements();
  const { user } = useAuth();
  const listsQ = useLists();
  const memoriesQ = useMemories();
  const { data: visits = [] } = visitsQ;
  const { data: places = [], isLoading: placesLoading } = placesQ;
  const { data: favorites = [] } = favoritesQ;
  const { data: redemptions = [] } = redemptionsQ;
  const { data: dismissedIds = [] } = dismissalsQ;
  const { data: likedIds = [] } = likesQ;
  // Platser svepta åt något håll i Upptäck
  const swipedIds = useMemo(() => [...new Set([...dismissedIds, ...likedIds])], [dismissedIds, likedIds]);
  const { data: achievements = [], isLoading: achievementsLoading } = achievementsQ;
  const { data: lists = [] } = listsQ;
  const { data: memories = [] } = memoriesQ;
  // Allt som troféerna räknas ur har hämtats minst en gång. Loggen över klarade troféer måste ha
  // LYCKATS — misslyckas den ser alla klara troféer ut som nya. Misslyckas något annat räknas det
  // bara som tomt, vilket aldrig får något att se klart ut som inte är det.
  const allLoaded = achievementsQ.isSuccess
    && [visitsQ, placesQ, favoritesQ, redemptionsQ, dismissalsQ, likesQ, listsQ, memoriesQ].every((q) => q.isFetched);
  const listsCreated = lists.filter((l) => l.ownerId === user?.id).length;

  const stats = useMemo(
    () => computeUserStats(visits, places, favorites.length, redemptions, swipedIds, listsCreated, memories.length),
    [visits, places, favorites.length, redemptions, swipedIds, listsCreated, memories.length]
  );
  const trophies = useMemo(() => buildTrophies(stats, achievements), [stats, achievements]);

  return { stats, trophies, isLoading: placesLoading || achievementsLoading, allLoaded };
}

// Delas av alla skärmar som kallar useGrantNewTrophies, så samma trofé aldrig
// sparas två gånger även om två skärmar upptäcker den samtidigt.
const grantedKeys = new Set<string>();

/**
 * Sparar troféer som blivit klara men ännu inte finns i achievements-tabellen
 * (tabellen är bara en logg över NÄR något klarades — om det är klart räknas
 * alltid ut ur riktig data). Väntar tills allt laddats: medan achievements
 * fortfarande hämtas ser annars ALLA klara troféer ut som nya.
 */
export function useGrantNewTrophies(
  trophies: Trophy[],
  ready: boolean,
  onGranted?: (trophy: Trophy) => void
) {
  const grant = useGrantAchievement();
  useEffect(() => {
    if (!ready) return;
    trophies.forEach((t) => {
      if (t.done && !t.doneAt && !grantedKeys.has(t.key)) {
        grantedKeys.add(t.key);
        grant.mutate(
          { achievement_type: t.groupId, category: null, level: t.tier },
          { onSuccess: () => onGranted?.(t) }
        );
      }
    });
  }, [trophies, ready]);
}
