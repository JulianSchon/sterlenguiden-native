/**
 * Ringlagret på Profilens medlemskort: som AvatarRing, men när man just valt "Använd ringen" i
 * ringfirandet faller ringen ner över profilbilden och sätter sig — stor och lite vriden in, en
 * smäll, en studs och en vibration (en mindre version av firandet, som skatten i samlingen).
 * Annars ritas ringen som vanligt.
 */
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { RING_SNAP_DELAY, claimSnapBuzz, ringSnapAt } from "@/lib/ringSnap";
import { AvatarRing } from "./AvatarRing";

export function SnapRing({ ring, size, children }: { ring?: string | null; size: number; children: ReactNode }) {
  // Dold redan från första bilden om ringen ska smälla fast — annars syns den en bildruta först
  const drop = useSharedValue(ringSnapAt(ring) != null ? 0 : 1);
  const squash = useSharedValue(0);

  const landed = (at: number) => {
    if (claimSnapBuzz(at)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 140);
    }
    squash.value = withSequence(withTiming(1, { duration: 70 }), withSpring(0, { damping: 9, stiffness: 260 }));
  };

  // Nyss vald i ringfirandet: dölj ringen och låt den falla ner när firandet tonats bort
  useEffect(() => {
    const at = ringSnapAt(ring);
    if (at == null) return;
    drop.value = 0;
    const wait = Math.max(0, at + RING_SNAP_DELAY - Date.now());
    drop.value = withDelay(wait, withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(landed)(at);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drop.value, [0, 0.25], [0, 1], "clamp"),
    transform: [
      { scale: interpolate(drop.value, [0, 1], [2.2, 1]) * (1 + squash.value * 0.06) },
      { rotate: `${interpolate(drop.value, [0, 1], [-30, 0])}deg` },
    ],
  }));

  return (
    <View style={{ width: size, height: size }}>
      {children}
      <Reanimated.View style={[StyleSheet.absoluteFill, ringStyle]} pointerEvents="none">
        <AvatarRing ring={ring} size={size}><View style={{ width: size, height: size }} /></AvatarRing>
      </Reanimated.View>
    </View>
  );
}
