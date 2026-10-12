/**
 * Vilka profilringar användaren har låst upp — räknat ur riktig data varje gång (antal hittade
 * skatter, klarade utmaningar), aldrig sparat. Används av Utseende (låst/upplåst + vad som krävs)
 * och av belöningsvakten (TrophyHost), som firar en ring när den blir upplåst.
 */
import { useCallback } from "react";
import { useCollected } from "@/hooks/useCollectibles";
import { useTrophies } from "@/hooks/useTrophies";
import { AVATAR_RINGS, type AvatarRingDef } from "@/lib/avatarRings";

export function useRingUnlocks() {
  const { data: collected, isSuccess: collectedLoaded } = useCollected();
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

  /** Vad som krävs, kort: "6 skatter", "Alla utmaningar", "Kommer snart" */
  const requirement = (def: AvatarRingDef): string => {
    switch (def.rule.kind) {
      case "treasures": return `${def.rule.count} skatter`;
      case "allChallenges": return "Alla utmaningar";
      case "later": return "Kommer snart";
      default: return "";
    }
  };

  /** Hela meningen, för låst-rutan och firandet */
  const requirementSentence = (def: AvatarRingDef): string => {
    switch (def.rule.kind) {
      case "treasures": return `Hitta ${def.rule.count} av Österlens skatter för att låsa upp den här ringen. Du har ${treasures}.`;
      case "allChallenges": return `Klara alla ${trophies.length} utmaningar för att låsa upp den här ringen.`;
      case "later": return "Den här ringen låses upp längre fram.";
      default: return "";
    }
  };

  const unlocked = AVATAR_RINGS.filter(isUnlocked);
  return { isUnlocked, requirement, requirementSentence, unlocked, ready: collectedLoaded && allLoaded };
}
