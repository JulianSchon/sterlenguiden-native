/**
 * Utmaningsögonblicket: helskärmsfirandet när man klarar en utmaning, var man än är i appen
 * (visas av TrophyHost). Samma språk som incheckningens stämpel, men kortare — det avbryter något
 * man håller på med:
 *
 *  1. Förväntan: medaljens mörka siluett dyker upp, skakar allt mer och börjar glöda medan
 *     telefonen tickar tätare och starkare (som hålla-inne-knappen).
 *  2. Smällen: blixt över hela skärmen, medaljen tänds i full färg, strålkransen tänds, konfetti
 *     och en kraftig vibration följd av en "klar"-vibration.
 *  3. "Utmaning klarad!", utmaningen och nivån.
 *  4. Nästa mål direkt, med en stapel som visar hur långt man redan har kommit.
 *  5. "Se i Utmaningar" (öppnar sidan bakom den mörka bakgrunden, där trofén sen placeras) eller
 *     "Fortsätt".
 *
 * Ett tryck under animationen spolar fram den. Avslutet tonar ut som incheckningens belöning.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { Tier, Trophy } from "@/lib/achievements";
import { playSound } from "@/lib/sounds";
import { RadialGlow, TrophyMedal } from "@/components/trophies/TrophyMedal";
import { Confetti, FillBar, GOLD, GhostButton, GoldButton, GoldRays, Reveal } from "@/components/checkin/CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.62)";
const MEDAL = 190;

/** Ljuset följer nivån: brons glöder kopparrött, silver vitt, guld guld — så varje nivå känns
 * som sin egen och guld blir det stora. */
const TIER_LIGHT: Record<Tier, { light: string; ink: string; confetti: string[] }> = {
  bronze: { light: "#E0A374", ink: "#E6A97A", confetti: ["#F6D2B4", "#E0A374", "#C47A45", "#8E4F24", "#FFFFFF"] },
  silver: { light: "#E4E8EE", ink: "#DDE2EA", confetti: ["#FFFFFF", "#E9ECF1", "#C6CCD5", "#9AA2AE", "#F4F4F4"] },
  gold: { light: "#F5D88A", ink: GOLD, confetti: ["#FFF1C1", "#F5D88A", "#E9C46A", "#C9A24C", "#FFFFFF"] },
};
const T_MEDAL = 200;
const T_BUILD = 700;
const T_IMPACT = 1650;
const T_TITLE = T_IMPACT + 400;
const T_NEXT = T_IMPACT + 950;
const T_READY = T_IMPACT + 2000;
// Förväntans tickar: tätare och starkare fram till smällen
const BUILD_TICKS: [number, Haptics.ImpactFeedbackStyle][] = [
  [700, Haptics.ImpactFeedbackStyle.Soft], [880, Haptics.ImpactFeedbackStyle.Soft], [1030, Haptics.ImpactFeedbackStyle.Soft],
  [1160, Haptics.ImpactFeedbackStyle.Light], [1270, Haptics.ImpactFeedbackStyle.Light], [1360, Haptics.ImpactFeedbackStyle.Light],
  [1440, Haptics.ImpactFeedbackStyle.Medium], [1505, Haptics.ImpactFeedbackStyle.Medium], [1560, Haptics.ImpactFeedbackStyle.Medium],
  [1605, Haptics.ImpactFeedbackStyle.Medium],
];

export function TrophyCelebration({
  trophy, next, position, onNavigate, onClose,
}: {
  trophy: Trophy;
  /** Nästa nivå i samma utmaning, null om det här var guld */
  next: Trophy | null;
  /** "1 av 2" när flera klarades samtidigt */
  position: { index: number; total: number } | null;
  /** Öppna Utmaningar — anropas medan firandet fortfarande täcker skärmen */
  onNavigate: () => void;
  /** Firandet har tonat ut helt */
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const tierLight = TIER_LIGHT[trophy.tier];
  const [lit, setLit] = useState(false);
  const [ready, setReady] = useState(false);
  const [skip, setSkip] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const impacted = useRef(false);

  const backdrop = useSharedValue(0);
  const leave = useSharedValue(0);
  const medalIn = useSharedValue(0);
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);
  const pop = useSharedValue(0);
  const flash = useSharedValue(0);
  const rays = useSharedValue(0);
  const burst = useSharedValue(0);
  const title = useSharedValue(0);
  const nextIn = useSharedValue(0);

  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const impact = () => {
    if (impacted.current) return;
    impacted.current = true;
    setLit(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    playSound("milestone");
    later(130, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}));
  };

  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    if (reduceMotion) {
      medalIn.value = 1; glow.value = 0.6; rays.value = 1; title.value = 1; nextIn.value = 1;
      impact();
      setReady(true);
      return;
    }
    medalIn.value = withDelay(T_MEDAL, withTiming(1, { duration: 450, easing: Easing.out(Easing.back(1.5)) }));
    // Skakningen växer fram till smällen
    shake.value = withDelay(T_BUILD, withSequence(
      ...Array.from({ length: 12 }, (_, i) => withTiming(i % 2 === 0 ? 0.3 + i * 0.06 : -(0.3 + i * 0.06), { duration: 80 - i * 3 })),
      withTiming(0, { duration: 40 }),
    ));
    glow.value = withDelay(T_BUILD, withTiming(0.55, { duration: T_IMPACT - T_BUILD, easing: Easing.in(Easing.quad) }));
    BUILD_TICKS.forEach(([at, style]) => later(at, () => Haptics.impactAsync(style).catch(() => {})));
    // Smällen
    later(T_IMPACT, impact);
    pop.value = withDelay(T_IMPACT, withSequence(
      withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) }),
    ));
    flash.value = withDelay(T_IMPACT, withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 380 })));
    rays.value = withDelay(T_IMPACT, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    burst.value = withDelay(T_IMPACT, withTiming(1, { duration: 1400, easing: Easing.linear }));
    glow.value = withDelay(T_IMPACT, withSequence(withTiming(1, { duration: 140 }), withTiming(0.65, { duration: 900 })));
    title.value = withDelay(T_TITLE, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    nextIn.value = withDelay(T_NEXT, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
    later(T_READY, () => setReady(true));
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tryck under animationen: hoppa till slutläget (men smällen ska ändå kännas en gång)
  const tapToSkip = () => {
    if (ready || skip) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSkip(true);
    medalIn.value = 1; shake.value = 0; pop.value = 0; flash.value = 0;
    glow.value = 0.65; rays.value = 1; burst.value = 1; title.value = 1; nextIn.value = 1;
    impact();
    setReady(true);
  };

  const exitTo = (toChallenges: boolean) => {
    if (leaving) return;
    setLeaving(true);
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) });
    rays.value = withTiming(0, { duration: 260 });
    const fadeAt = toChallenges ? 900 : 140;
    if (toChallenges) setTimeout(onNavigate, 300);
    backdrop.value = withDelay(fadeAt, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
    setTimeout(onClose, fadeAt + 340);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 24 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.18 }));
  const medalStyle = useAnimatedStyle(() => ({
    opacity: medalIn.value,
    transform: [
      { scale: interpolate(medalIn.value, [0, 1], [0.5, 1]) * (1 + pop.value * 0.28) },
      { rotate: `${shake.value * 6}deg` },
    ],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: title.value,
    transform: [{ translateY: interpolate(title.value, [0, 1], [16, 0]) }],
  }));
  const nextStyle = useAnimatedStyle(() => ({
    opacity: nextIn.value,
    transform: [{ translateY: interpolate(nextIn.value, [0, 1], [18, 0]) }],
  }));

  const raysSize = width * 1.9;
  const glowSize = width * 1.2;
  const lightY = height * 0.36;
  const bottomPad = Math.max(insets.bottom, 16) + 8;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => exitTo(false)}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          <View style={[s.anchor, { top: lightY - raysSize / 2, left: (width - raysSize) / 2, width: raysSize, height: raysSize }]}>
            <GoldRays size={raysSize} visible={rays} color={tierLight.light} />
          </View>
          <Reanimated.View style={[s.anchor, { top: lightY - glowSize / 2, left: (width - glowSize) / 2, width: glowSize, height: glowSize }, glowStyle]}>
            <RadialGlow size={glowSize} color={tierLight.light} opacity={0.34} radiusRatio={0.55} />
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.View style={[s.root, contentStyle]} pointerEvents={leaving ? "none" : "auto"}>
          <Pressable style={[s.stage, { paddingTop: insets.top + 12 }]} onPress={tapToSkip}>
            {position && position.total > 1 && (
              <Text style={s.position}>{position.index} av {position.total}</Text>
            )}
            <View style={[s.medalBox, { marginTop: Math.max(0, lightY - insets.top - 12 - MEDAL / 2 - (position && position.total > 1 ? 24 : 0)) }]}>
              <Reanimated.View style={medalStyle}>
                <TrophyMedal size={MEDAL} tier={trophy.tier} Icon={trophy.Icon} unlocked={lit} groupId={trophy.groupId} />
              </Reanimated.View>
              <Confetti progress={burst} count={36} power={1.1} colors={tierLight.confetti} />
            </View>

            <Reanimated.View style={[s.texts, titleStyle]}>
              <Text style={[s.eyebrow, { color: tierLight.ink }]}>UTMANING KLARAD!</Text>
              <Text style={s.title}>{trophy.identity}</Text>
              <View style={s.levelPill}>
                <Text style={s.levelText}>{trophy.levelLabel} · {trophy.levelName}</Text>
              </View>
            </Reanimated.View>

            <Reanimated.View style={[s.next, nextStyle]}>
              {next ? (
                <>
                  <View style={s.nextTop}>
                    <TrophyMedal size={40} tier={next.tier} Icon={next.Icon} unlocked={false} groupId={next.groupId} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.nextLabel}>NÄSTA MÅL</Text>
                      <Text style={s.nextTitle} numberOfLines={1}>{next.levelLabel} · {next.levelName}</Text>
                    </View>
                    <Text style={s.nextCount}>{next.progress} / {next.target}</Text>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <FillBar from={0} to={next.target > 0 ? next.progress / next.target : 0} startAt={T_NEXT + 250} durationMs={900} skip={skip || !!reduceMotion} />
                  </View>
                  <Text style={s.nextReq}>{next.requirementText}</Text>
                </>
              ) : (
                <Text style={s.allDone}>Alla tre nivåer klara — hela utmaningen är din!</Text>
              )}
            </Reanimated.View>
          </Pressable>

          <View style={[s.buttons, { height: 118 + bottomPad, paddingBottom: bottomPad }]}>
            {ready && (
              <>
                <Reveal show>
                  <GoldButton label="Se i Utmaningar" onPress={() => exitTo(true)} />
                </Reveal>
                <Reveal show delay={100}>
                  <GhostButton label="Fortsätt" onPress={() => exitTo(false)} />
                </Reveal>
              </>
            )}
          </View>
        </Reanimated.View>

        {/* Smällens blixt över hela skärmen */}
        <Reanimated.View style={[StyleSheet.absoluteFill, s.flash, flashStyle]} pointerEvents="none" />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#0B0A08" },
  flash: { backgroundColor: "#FFF6DE" },
  anchor: { position: "absolute", alignItems: "center", justifyContent: "center" },
  stage: { flex: 1, alignItems: "center", paddingHorizontal: 20 },
  position: { fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 1.5, color: MUTED },
  medalBox: { width: MEDAL, height: MEDAL, alignItems: "center", justifyContent: "center" },
  texts: { alignItems: "center", marginTop: 18 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2.6, color: GOLD },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 32, color: FG, marginTop: 6, textAlign: "center" },
  // Solid botten — strålkransen snurrar bakom
  levelPill: {
    marginTop: 10, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "#1C1A15", borderWidth: 1, borderColor: "rgba(233,196,106,0.55)",
  },
  levelText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  next: {
    alignSelf: "stretch", marginTop: 26, padding: 14, borderRadius: 18,
    backgroundColor: "#17171A", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  nextTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  nextLabel: { fontFamily: "Inter_700Bold", fontSize: 11.5, letterSpacing: 1.8, color: MUTED },
  nextTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: FG, marginTop: 2 },
  nextCount: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: FG, fontVariant: ["tabular-nums"] },
  nextReq: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: MUTED, marginTop: 9 },
  allDone: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: GOLD, textAlign: "center" },
  buttons: { paddingHorizontal: 20, gap: 10, justifyContent: "flex-end" },
});
