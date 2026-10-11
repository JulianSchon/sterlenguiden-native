/**
 * Helskärmsfirandet vid streakens milstolpar (7, 30, 100 och 365 dagar i rad) — samma språk som
 * utmaningsögonblicket, men i eldfärger: en stor slocknad låga fladdrar allt mer medan
 * vibrationerna tätnar, tänds med en smäll (blixt, strålkrans, gnistor), siffran rullar upp och
 * "7 dagar i rad!" tonar in. Avslutas med en påminnelse om att komma tillbaka imorgon.
 * Ett tryck under animationen spolar fram den.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { playSound } from "@/lib/sounds";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { Confetti, FlipNumber, GhostButton, GoldRays, Reveal } from "@/components/checkin/CelebrationFx";
import { Flame, FLAME_COLORS } from "./Flame";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.7)";
const EMBERS = ["#FFE08A", "#FFB23E", "#FF7A1A", "#FF5A1F", "#FFFFFF"];
const T_IN = 200;
const T_BUILD = 650;
const T_IMPACT = 1550;
const T_TEXT = T_IMPACT + 450;
const T_READY = T_IMPACT + 1500;
const BUILD_TICKS: [number, Haptics.ImpactFeedbackStyle][] = [
  [650, Haptics.ImpactFeedbackStyle.Soft], [830, Haptics.ImpactFeedbackStyle.Soft], [980, Haptics.ImpactFeedbackStyle.Light],
  [1100, Haptics.ImpactFeedbackStyle.Light], [1200, Haptics.ImpactFeedbackStyle.Light], [1290, Haptics.ImpactFeedbackStyle.Medium],
  [1370, Haptics.ImpactFeedbackStyle.Medium], [1440, Haptics.ImpactFeedbackStyle.Medium], [1500, Haptics.ImpactFeedbackStyle.Medium],
];

const HEADLINES: Record<number, string> = {
  7: "En hel vecka i rad!",
  30: "En hel månad i rad!",
  100: "Hundra dagar i rad!",
  365: "Ett helt år i rad!",
};

export function StreakMilestone({ days, onClose }: { days: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(days - 1);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const impacted = useRef(false);

  const backdrop = useSharedValue(0);
  const leave = useSharedValue(0);
  const flameIn = useSharedValue(0);
  const flicker = useSharedValue(0);
  const lit = useSharedValue(0);
  const pop = useSharedValue(0);
  const glow = useSharedValue(0);
  const flash = useSharedValue(0);
  const rays = useSharedValue(0);
  const burst = useSharedValue(0);
  const text = useSharedValue(0);

  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const impact = () => {
    if (impacted.current) return;
    impacted.current = true;
    setCount(days);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    playSound("milestone");
    later(130, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}));
  };

  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    if (reduceMotion) {
      flameIn.value = 1; lit.value = 1; glow.value = 0.6; rays.value = 1; text.value = 1;
      impact();
      setReady(true);
      return;
    }
    flameIn.value = withDelay(T_IN, withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.5)) }));
    // Lågan fladdrar allt mer fram till smällen
    flicker.value = withDelay(T_BUILD, withSequence(
      ...Array.from({ length: 12 }, (_, i) => withTiming(i % 2 === 0 ? 0.25 + i * 0.06 : -(0.25 + i * 0.06), { duration: 75 - i * 3 })),
      withTiming(0, { duration: 40 }),
    ));
    glow.value = withDelay(T_BUILD, withTiming(0.45, { duration: T_IMPACT - T_BUILD, easing: Easing.in(Easing.quad) }));
    BUILD_TICKS.forEach(([at, style]) => later(at, () => Haptics.impactAsync(style).catch(() => {})));
    later(T_IMPACT, impact);
    lit.value = withDelay(T_IMPACT, withTiming(1, { duration: 160 }));
    pop.value = withDelay(T_IMPACT, withSequence(
      withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) }),
    ));
    flash.value = withDelay(T_IMPACT, withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 380 })));
    rays.value = withDelay(T_IMPACT, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    burst.value = withDelay(T_IMPACT, withTiming(1, { duration: 1400, easing: Easing.linear }));
    glow.value = withDelay(T_IMPACT, withSequence(withTiming(1, { duration: 140 }), withTiming(0.65, { duration: 900 })));
    text.value = withDelay(T_TEXT, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    later(T_READY, () => setReady(true));
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tapToSkip = () => {
    if (ready) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    flameIn.value = 1; flicker.value = 0; pop.value = 0; flash.value = 0; lit.value = 1;
    glow.value = 0.65; rays.value = 1; burst.value = 1; text.value = 1;
    impact();
    setReady(true);
  };

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) });
    rays.value = withTiming(0, { duration: 260 });
    backdrop.value = withDelay(140, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
    setTimeout(onClose, 480);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 24 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.18 }));
  const flameStyle = useAnimatedStyle(() => ({
    opacity: flameIn.value,
    transform: [
      { scale: interpolate(flameIn.value, [0, 1], [0.5, 1]) * (1 + pop.value * 0.3) },
      { rotate: `${flicker.value * 7}deg` },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateY: interpolate(text.value, [0, 1], [16, 0]) }],
  }));

  const flameSize = Math.min(170, Math.round(height * 0.2));
  const raysSize = width * 1.9;
  const glowSize = width * 1.2;
  const lightY = height * 0.36;
  const bottomPad = Math.max(insets.bottom, 16) + 8;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          <View style={[s.anchor, { top: lightY - raysSize / 2, left: (width - raysSize) / 2, width: raysSize, height: raysSize }]}>
            <GoldRays size={raysSize} visible={rays} color={FLAME_COLORS.warm} />
          </View>
          <Reanimated.View style={[s.anchor, { top: lightY - glowSize / 2, left: (width - glowSize) / 2, width: glowSize, height: glowSize }, glowStyle]}>
            <RadialGlow size={glowSize} color={FLAME_COLORS.hot} opacity={0.36} radiusRatio={0.55} />
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.View style={[s.root, contentStyle]} pointerEvents={leaving ? "none" : "auto"}>
          <Pressable style={[s.stage, { paddingTop: Math.max(0, lightY - flameSize / 2) }]} onPress={tapToSkip}>
            <View style={{ height: flameSize, alignItems: "center", justifyContent: "center" }}>
              <Reanimated.View style={flameStyle}>
                <Flame size={flameSize} lit={lit} compact={false} />
              </Reanimated.View>
              <Confetti progress={burst} count={34} power={1.1} colors={EMBERS} />
            </View>

            <Reanimated.View style={[s.texts, textStyle]}>
              <View style={s.countRow}>
                <FlipNumber value={count} style={s.count} animate={!reduceMotion} />
                <Text style={s.countLabel}> dagar i rad</Text>
              </View>
              <Text style={s.headline}>{HEADLINES[days] ?? `${days} dagar i rad!`}</Text>
              <Text style={s.sub}>Öppna appen imorgon för att hålla elden vid liv.</Text>
            </Reanimated.View>
          </Pressable>

          <View style={[s.buttons, { height: 52 + bottomPad, paddingBottom: bottomPad }]}>
            {ready && (
              <Reveal show>
                <GhostButton label="Fortsätt" onPress={close} />
              </Reveal>
            )}
          </View>
        </Reanimated.View>

        <Reanimated.View style={[StyleSheet.absoluteFill, s.flash, flashStyle]} pointerEvents="none" />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#0B0A08" },
  flash: { backgroundColor: "#FFF1DE" },
  anchor: { position: "absolute", alignItems: "center", justifyContent: "center" },
  stage: { flex: 1, alignItems: "center", paddingHorizontal: 24 },
  texts: { alignItems: "center", marginTop: 22 },
  countRow: { flexDirection: "row", alignItems: "flex-end" },
  count: { fontFamily: "Montserrat_700Bold", fontSize: 44, lineHeight: 50, color: FLAME_COLORS.warm, fontVariant: ["tabular-nums"] },
  countLabel: { fontFamily: "Montserrat_700Bold", fontSize: 22, lineHeight: 40, color: FG },
  headline: { fontFamily: "Montserrat_700Bold", fontSize: 26, color: FG, marginTop: 10, textAlign: "center" },
  sub: { fontFamily: "Inter_500Medium", fontSize: 15.5, color: MUTED, marginTop: 10, textAlign: "center" },
  buttons: { paddingHorizontal: 20, justifyContent: "flex-end" },
});
