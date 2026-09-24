import { useEffect, useMemo } from "react";
import { useVisits } from "@/hooks/useVisits";
import { usePlaces } from "@/hooks/usePlaces";
import { useFavorites } from "@/hooks/useFavorites";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useDismissals } from "@/hooks/useDismissals";
import { useAchievements, useGrantAchievement } from "@/hooks/useAchievements";
import { buildTrophies, computeUserStats, type Trophy } from "@/lib/achievements";

/**
 * Användarens siffror och alla 21 troféer, uträknade ur riktig data.
 * Samma motor (src/lib/achievements.ts) för Utmaningar, Statistik, Profil
 * och incheckningens belöningsskärm — så de aldrig kan visa olika saker.
 */
export function useTrophies() {
  const { data: visits = [] } = useVisits();
  const { data: places = [], isLoading: placesLoading } = usePlaces();
  const { data: favorites = [] } = useFavorites();
  const { data: redemptions = [] } = useOfferRedemptions();
  const { data: dismissedIds = [] } = useDismissals();
  const { data: achievements = [], isLoading: achievementsLoading } = useAchievements();

  const stats = useMemo(
    () => computeUserStats(visits, places, favorites.length, redemptions, dismissedIds),
    [visits, places, favorites.length, redemptions, dismissedIds]
  );
  const trophies = useMemo(() => buildTrophies(stats, achievements), [stats, achievements]);

  return { stats, trophies, isLoading: placesLoading || achievementsLoading };
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
