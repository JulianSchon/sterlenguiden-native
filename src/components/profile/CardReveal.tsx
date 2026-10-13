/**
 * Medlemskortet på Profil när man just valt "Använd kortet" i kortpresenten: kortet i den nya
 * designen faller ner på sin plats — lite större och snett ovanifrån — och landar med en smäll,
 * en studs och en vibration. Samma princip som ringen som faller ner över profilbilden (SnapRing).
 * Annars visas kortet som vanligt.
 *
 * Under kortet ligger en mjuk skugga på dess plats: svag och utspridd medan kortet är högt upp,
 * mörkast och tätast i smällen — så att man SER att kortet slår ner, inte bara känner det — och
 * sen tonar den bort (kortet har ingen skugga annars).
 *
 * Spelas när lagret skapas eller får designen medan signalen gäller (se profileReveal.ts). Profil
 * bygger om kortet när signalen kommer, så den spelas även om kortet redan hade designen.
 */
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { BlurMask, Canvas, RoundedRect } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { REVEAL_DELAY, revealAt } from "@/lib/profileReveal";
import { CARD_W } from "@/components/MemberCard";

/** Skuggans mjuka kant, och hur långt under kortet den ligger */
const SHADOW_BLUR = 14;
const SHADOW_PAD = SHADOW_BLUR * 2;
const SHADOW_DROP = 10;

export function CardReveal({ cardId, children }: { cardId?: string | null; children: ReactNode }) {
  // Dolt redan från första bilden om kortet ska landa — annars syns det en bildruta först
  const drop = useSharedValue(revealAt("card", cardId) != null ? 0 : 1);
  const squash = useSharedValue(0);
  const settle = useSharedValue(0);
  // Skuggan ritas bara när kortet faktiskt landar (sätts medan presenten ännu täcker skärmen)
  const [revealing, setRevealing] = useState(() => revealAt("card", cardId) != null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const landed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 140);
    squash.value = withSequence(withTiming(1, { duration: 70 }), withSpring(0, { damping: 9, stiffness: 260 }));
  };

  // Nyss vald i presenten: dölj kortet och låt det falla ner när presenten tonats bort
  useEffect(() => {
    const at = revealAt("card", cardId);
    if (at == null) return;
    setRevealing(true);
    drop.value = 0;
    settle.value = 0;
    const wait = Math.max(0, at + REVEAL_DELAY - Date.now());
    drop.value = withDelay(wait, withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (!fin) return;
      // Skuggan ligger kvar en stund efter smällen och tonar sen bort
      settle.value = withDelay(250, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
      runOnJS(landed)();
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
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drop.value, [0, 1], [0, 0.8]) * (1 - settle.value),
    transform: [{ scale: interpolate(drop.value, [0, 1], [1.12, 1]) + squash.value * 0.03 }],
  }));

  const radius = size ? 16 * (size.w / CARD_W) : 0;
  return (
    <View onLayout={(e) => !size && setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {revealing && size && (
        <Reanimated.View
          pointerEvents="none"
          style={[{
            position: "absolute", left: -SHADOW_PAD, top: -SHADOW_PAD + SHADOW_DROP,
            width: size.w + SHADOW_PAD * 2, height: size.h + SHADOW_PAD * 2,
          }, shadowStyle]}
        >
          <Canvas style={{ flex: 1 }}>
            <RoundedRect x={SHADOW_PAD} y={SHADOW_PAD} width={size.w} height={size.h} r={radius} color="#000000">
              <BlurMask blur={SHADOW_BLUR} style="normal" />
            </RoundedRect>
          </Canvas>
        </Reanimated.View>
      )}
      <Reanimated.View style={style}>{children}</Reanimated.View>
    </View>
  );
}
