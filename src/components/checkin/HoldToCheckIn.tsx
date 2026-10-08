/**
 * "Jag är här!" som man HÅLLER inne i stället för att trycka på — en liten ritual i stället för
 * ett klick, och inga råkat-tryckta incheckningar. En ljusare guldyta sveper över knappen (långsamt
 * först, sedan allt snabbare) medan
 * man håller, telefonen tickar i takt (lätta vibrationer på vägen, en kraftig när den är full),
 * och släpper man för tidigt glider den snabbt tillbaka. `onStart` körs direkt vid tryck (så
 * positionen kan börja hämtas medan man håller — väntan döljs i ritualen), `onComplete` när den
 * är full.
 */
import { useRef, useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { playSound } from "@/lib/sounds";

const GOLD = "#C9A24C";
const GOLD_LT = "#F0D48A";
// 1,5 s — kortare än så hann man inte bygga upp någon spänning, det var över innan det började
const HOLD_MS = 1500;
// Jämnt fördelade i FYLLNAD, men fyllnaden accelererar (ease-in) — så vibrationerna kommer
// tätare och tätare mot slutet, och blir starkare: ett crescendo som laddar upp till smällen
const TICKS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

export function HoldToCheckIn({
  onStart, onComplete, disabled = false, label = "Håll inne — Jag är här!",
}: { onStart?: () => void; onComplete: () => void; disabled?: boolean; label?: string }) {
  const progress = useSharedValue(0);
  const [width, setWidth] = useState(0);
  const [holding, setHolding] = useState(false);
  const lastTick = useRef(0);

  const tick = (step: number) => {
    if (step <= lastTick.current) return;
    lastTick.current = step;
    const style = step <= 4 ? Haptics.ImpactFeedbackStyle.Soft : step <= 7 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium;
    Haptics.impactAsync(style).catch(() => {});
  };

  const finish = () => {
    setHolding(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    playSound("holdComplete");
    onComplete();
  };

  // Vibrationerna följer fyllnaden — räknas ut på UI-tråden, så de alltid ligger i takt
  useAnimatedReaction(
    () => TICKS.filter((t) => progress.value >= t).length,
    (step, prev) => {
      if (prev !== null && step > prev) runOnJS(tick)(step);
    },
  );

  const fillStyle = useAnimatedStyle(() => ({ width: progress.value * width }));

  return (
    <Pressable
      disabled={disabled}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPressIn={() => {
        lastTick.current = 0;
        setHolding(true);
        Haptics.selectionAsync().catch(() => {});
        onStart?.();
        progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) runOnJS(finish)();
        });
      }}
      onPressOut={() => {
        if (progress.value >= 1) return;
        cancelAnimation(progress);
        setHolding(false);
        progress.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      }}
      style={[s.button, disabled && { opacity: 0.6 }]}
    >
      <Reanimated.View style={[s.fill, fillStyle]} pointerEvents="none" />
      <View style={s.labelWrap} pointerEvents="none">
        <Text style={s.label}>{holding ? "Håll kvar…" : label}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    marginTop: 14, height: 54, borderRadius: 14, overflow: "hidden",
    backgroundColor: GOLD, justifyContent: "center",
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: GOLD_LT },
  labelWrap: { alignItems: "center" },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: "#121212" },
});
