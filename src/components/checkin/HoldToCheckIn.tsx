/**
 * "Jag är här!" som man HÅLLER inne i stället för att trycka på — en liten ritual i stället för
 * ett klick, och inga råkat-tryckta incheckningar.
 *
 * I vila: mörk knapp med guldig neonkant och glöd. Medan man håller fylls den med en guldgradient
 * från vänster (långsamt först, sedan allt snabbare), glöden tilltar, och texten byter färg exakt
 * där guldet passerar (en mörk kopia av texten ligger inuti fyllnaden). Telefonen tickar i takt
 * (allt tätare och starkare, en kraftig när den är full), och släpper man för tidigt glider den
 * tillbaka. `onStart` körs direkt vid tryck (positionen kan börja hämtas medan man håller —
 * väntan döljs i ritualen), `onComplete` när den är full.
 */
import { useRef, useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
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
  // Neonglöden tilltar medan man håller — knappen "laddas upp"
  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(progress.value, [0, 1], [0.55, 1]),
    shadowRadius: interpolate(progress.value, [0, 1], [10, 22]),
  }));
  const text = holding ? "Håll kvar…" : label;

  return (
    <Reanimated.View style={[s.glow, glowStyle, disabled && { opacity: 0.6 }]}>
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
      style={s.button}
    >
      {/* Guldtext på mörkt i vila */}
      <View style={s.labelWrap} pointerEvents="none">
        <Text style={s.label}>{text}</Text>
      </View>
      {/* Fyllnaden: guldgradient, med en MÖRK kopia av texten i full knappbredd inuti — så texten
          byter färg exakt där guldet har kommit, i stället för att guldtext försvinner i guld */}
      <Reanimated.View style={[s.fill, fillStyle]} pointerEvents="none">
        <Svg width={Math.max(width, 1)} height={HEIGHT} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="holdFill" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={GOLD_LT} />
              <Stop offset="0.55" stopColor={GOLD} />
              <Stop offset="1" stopColor="#A9822F" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={Math.max(width, 1)} height={HEIGHT} fill="url(#holdFill)" />
        </Svg>
        <View style={[s.labelWrap, { width: width - BORDER * 2, height: HEIGHT - BORDER * 2 }]}>
          <Text style={[s.label, s.labelOnGold]}>{text}</Text>
        </View>
      </Reanimated.View>
    </Pressable>
    </Reanimated.View>
  );
}

const HEIGHT = 54;
const BORDER = 1.5;

const s = StyleSheet.create({
  // Ytterlagret bär glöden (en skugga med guldfärg) — knappen själv klipper fyllnaden
  glow: {
    marginTop: 14, borderRadius: 14,
    shadowColor: "#F0C860", shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  button: {
    height: HEIGHT, borderRadius: 14, overflow: "hidden", justifyContent: "center",
    backgroundColor: "#16140F", borderWidth: BORDER, borderColor: "#E9C46A",
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" },
  labelWrap: { alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: "#F0D48A" },
  labelOnGold: { color: "#121212" },
});
