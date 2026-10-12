/**
 * Medlemskortet på Profil när man just valt "Använd kortet" i kortpresenten: kortet i den nya
 * designen faller ner på sin plats — lite större och snett ovanifrån — och landar med en smäll,
 * en studs och en vibration. Samma princip som ringen som faller ner över profilbilden (SnapRing).
 * Annars visas kortet som vanligt.
 *
 * Spelas när lagret skapas eller får designen medan signalen gäller (se profileReveal.ts). Profil
 * bygger om kortet när signalen kommer, så den spelas även om kortet redan hade designen.
 */
import { useEffect, type ReactNode } from "react";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { REVEAL_DELAY, revealAt } from "@/lib/profileReveal";

export function CardReveal({ cardId, children }: { cardId?: string | null; children: ReactNode }) {
  // Dolt redan från första bilden om kortet ska landa — annars syns det en bildruta först
  const drop = useSharedValue(revealAt("card", cardId) != null ? 0 : 1);
  const squash = useSharedValue(0);

  const landed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 140);
    squash.value = withSequence(withTiming(1, { duration: 70 }), withSpring(0, { damping: 9, stiffness: 260 }));
  };

  // Nyss vald i presenten: dölj kortet och låt det falla ner när presenten tonats bort
  useEffect(() => {
    const at = revealAt("card", cardId);
    if (at == null) return;
    drop.value = 0;
    const wait = Math.max(0, at + REVEAL_DELAY - Date.now());
    drop.value = withDelay(wait, withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(landed)();
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(drop.value, [0, 0.25], [0, 1], "clamp"),
    transform: [
      { translateY: interpolate(drop.value, [0, 1], [-70, 0]) },
      { scale: interpolate(drop.value, [0, 1], [1.18, 1]) },
      { rotate: `${interpolate(drop.value, [0, 1], [-5, 0])}deg` },
      { scaleX: 1 + squash.value * 0.03 },
      { scaleY: 1 - squash.value * 0.04 },
    ],
  }));

  return <Reanimated.View style={style}>{children}</Reanimated.View>;
}
