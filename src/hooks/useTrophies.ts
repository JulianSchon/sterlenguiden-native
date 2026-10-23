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
import { isFreshSinceStart } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";

/** Kontot vars data hämtats på nytt sedan appen startade (se allLoaded) */
let freshFor: string | null = null;

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
  // Vid start kan datan vara sparad från förra gången: då räknas den först när den hämtats på nytt
  // (loggen måste vara ny, resten ny eller misslyckad), och sen gäller det resten av körningen
  const freshNow = !!user && isFreshSinceStart(achievementsQ)
    && [visitsQ, placesQ, favoritesQ, redemptionsQ, dismissalsQ, likesQ, listsQ, memoriesQ].every((q) => q.isError || isFreshSinceStart(q));
  if (freshNow) freshFor = user.id;
  const allLoaded = !!user && freshFor === user.id
    && [visitsQ, placesQ, favoritesQ, redemptionsQ, dismissalsQ, likesQ, listsQ, memoriesQ].every((q) => q.isFetched);
  const listsCreated = lists.filter((l) => l.ownerId === user?.id).length;

  const stats = useMemo(
    () => computeUserStats(visits, places, favorites.length, redemptions, swipedIds, listsCreated, memories.length),
    [visits, places, favorites.length, redemptions, swipedIds, listsCreated, memories.length]
  );
  // Texterna (namn, krav) skrivs om när språket byts
  const { i18n: { language } } = useTranslation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trophies = useMemo(() => buildTrophies(stats, achievements), [stats, achievements, language]);

  // Sidor som VISAR troféerna väntar tills allt de räknas ur hämtats (och vem man är är känt) —
  // annars syntes t.ex. "Första listan" först som låst och låste sedan upp sig när listorna kom
  const inputsLoaded = !!user
    && [visitsQ, placesQ, favoritesQ, redemptionsQ, dismissalsQ, likesQ, listsQ, memoriesQ, achievementsQ].every((q) => q.isFetched);

  return { stats, trophies, isLoading: placesLoading || achievementsLoading || !inputsLoaded, allLoaded };
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
          { achievement_type: t.groupId, level: t.tier },
          { onSuccess: () => onGranted?.(t) }
        );
      }
    });
  }, [trophies, ready]);
}
