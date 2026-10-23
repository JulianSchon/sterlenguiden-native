/**
 * Vilka profilringar användaren har låst upp — räknat ur riktig data varje gång (antal hittade
 * skatter, klarade utmaningar), aldrig sparat. Används av Utseende (låst/upplåst + vad som krävs)
 * och av belöningsvakten (TrophyHost), som firar en ring när den blir upplåst.
 */
import { useCallback } from "react";
import { useCollected } from "@/hooks/useCollectibles";
import { useTrophies } from "@/hooks/useTrophies";
import { isFreshSinceStart } from "@/lib/queryClient";
import { AVATAR_RINGS, type AvatarRingDef } from "@/lib/avatarRings";
import i18n from "i18next";

export function useRingUnlocks() {
  const collectedQ = useCollected();
  const collected = collectedQ.data;
  // Sparad data från förra gången räknas först när den hämtats på nytt (se isFreshSinceStart)
  const collectedLoaded = isFreshSinceStart(collectedQ);
  const { trophies, allLoaded } = useTrophies();
  const treasures = collected?.size ?? 0;
  const allChallenges = trophies.length > 0 && trophies.every((t) => t.done);

  const isUnlocked = useCallback((def: AvatarRingDef) => {
    switch (def.rule.kind) {
      case "free": return true;
      case "treasures": return treasures >= def.rule.count;
      case "allChallenges": return allChallenges;
      default: return false;
    }
  }, [treasures, allChallenges]);

  /** Vad som krävs, kort: "6 skatter", "Alla utmaningar" */
  const requirement = (def: AvatarRingDef): string => {
    switch (def.rule.kind) {
      case "treasures": return i18n.t("rewards.ringReqTreasures", { count: def.rule.count });
      case "allChallenges": return i18n.t("rewards.ringReqChallenges");
      default: return "";
    }
  };

  const unlocked = AVATAR_RINGS.filter(isUnlocked);
  return { isUnlocked, requirement, unlocked, ready: collectedLoaded && allLoaded };
}
