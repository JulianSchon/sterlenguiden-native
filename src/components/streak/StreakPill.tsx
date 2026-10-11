/**
 * Streaken på Hem: en pill med lågan och antal dagar i rad, till vänster om profilbilden.
 *
 * Första gången Hem visas en ny dag tänds den: pillen visar först gårdagens siffra med en slocknad
 * låga, sen tickar vibrationerna, lågan växer, fladdrar och tänds med gnistor, och siffran rullar
 * upp (11 → 12) med en duns. Spelas en gång per dag (sparat på telefonen) — resten av dagen brinner
 * lågan bara lugnt. Har man missat en dag börjar den om på 1 utan något negativt meddelande.
 *
 * Vid 7, 30, 100 och 365 dagar följs tändningen av ett helskärmsfirande (StreakMilestone). Det
 * väntar om något viktigare visas (personalskärmen för ett aktivt erbjudande) och håller själv
 * undan utmaningsfirandet medan det visas, så två helskärmar aldrig krockar.
 */
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Reanimated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import { useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/hooks/useAuth";
import { useAppDays } from "@/hooks/useAppDays";
import { computeStreak, swedishDay } from "@/lib/streak";
import { holdTrophyMoments, useTrophyMomentsHeld } from "@/lib/trophyMoments";
import { Confetti, FlipNumber } from "@/components/checkin/CelebrationFx";
import { Flame } from "./Flame";
import { StreakMilestone } from "./StreakMilestone";

const MILESTONES = [7, 30, 100, 365];
const EMBERS = ["#FFE08A", "#FFB23E", "#FF7A1A", "#FFFFFF"];
const FLAME = 20;
const T_IGNITE = 900;
const seenKey = (userId: string) => `streak-lit:v1:${userId}`;

export function StreakPill() {
  const { user } = useAuth();
  const focused = useIsFocused();
  const { data: days = [], isSuccess } = useAppDays();
  const today = swedishDay();
  const hasToday = days.includes(today);
  const current = computeStreak(days, today).current;
  // Gårdagens siffra: streaken räknad utan idag (0 om man missade igår)
  const before = computeStreak(days.filter((d) => d !== today), today).current;

  // "idle" = brinner lugnt, "waiting" = slocknad med gårdagens siffra, "igniting" = tänds just nu
  const [phase, setPhase] = useState<"unknown" | "waiting" | "igniting" | "idle">("unknown");
  const [shown, setShown] = useState<number | null>(null);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [showMilestone, setShowMilestone] = useState(false);
  const held = useTrophyMomentsHeld();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);
  // Timrarna rensas bara när Hem försvinner — inte när fasen byts mitt i tändningen
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const lit = useSharedValue(1);
  const pop = useSharedValue(0);
  const flicker = useSharedValue(0);
  const burst = useSharedValue(0);

  // Ny dag medan appen legat öppen (t.ex. i bakgrunden över midnatt): kolla och tänd igen
  const lastDay = useRef(today);
  useEffect(() => {
    if (lastDay.current === today) return;
    lastDay.current = today;
    started.current = false;
    setShown(null);
    setPhase("unknown");
  }, [today]);

  // Har lågan redan tänts idag?
  useEffect(() => {
    if (!user || !isSuccess || phase !== "unknown") return;
    AsyncStorage.getItem(seenKey(user.id))
      .catch(() => null)
      .then((day) => setPhase(day === today ? "idle" : "waiting"));
  }, [user, isSuccess, phase, today]);

  // Väntar: slocknad låga med gårdagens siffra
  useEffect(() => {
    if (phase !== "waiting") return;
    lit.value = 0;
    setShown(before);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Tänd när dagens öppning är sparad och Hem faktiskt syns
  useEffect(() => {
    if (phase !== "waiting" || !hasToday || !focused || !user || started.current) return;
    started.current = true;
    setPhase("igniting");
    AsyncStorage.setItem(seenKey(user.id), today).catch(() => {});
    const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
    const ticks: [number, Haptics.ImpactFeedbackStyle][] = [
      [T_IGNITE - 420, Haptics.ImpactFeedbackStyle.Soft], [T_IGNITE - 260, Haptics.ImpactFeedbackStyle.Light],
      [T_IGNITE - 130, Haptics.ImpactFeedbackStyle.Light],
    ];
    ticks.forEach(([at, style]) => later(at, () => Haptics.impactAsync(style).catch(() => {})));
    flicker.value = withDelay(T_IGNITE - 420, withSequence(
      ...Array.from({ length: 6 }, (_, i) => withTiming(i % 2 === 0 ? 0.4 + i * 0.1 : -(0.4 + i * 0.1), { duration: 70 })),
      withTiming(0, { duration: 60 }),
    ));
    lit.value = withDelay(T_IGNITE, withTiming(1, { duration: 220 }));
    pop.value = withDelay(T_IGNITE, withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) }),
    ));
    burst.value = withDelay(T_IGNITE, withTiming(1, { duration: 1000, easing: Easing.linear }));
    later(T_IGNITE + 120, () => {
      setShown(null); // visa dagens siffra
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    });
    later(T_IGNITE + 900, () => {
      setPhase("idle");
      if (MILESTONES.includes(current)) setMilestone(current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hasToday, focused, user]);

  // Milstolpen visas när inget viktigare pågår — och håller själv undan utmaningsfirandet
  useEffect(() => {
    if (milestone != null && !showMilestone && !held) setShowMilestone(true);
  }, [milestone, showMilestone, held]);
  useEffect(() => (showMilestone ? holdTrophyMoments() : undefined), [showMilestone]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.45 }, { rotate: `${flicker.value * 10}deg` }],
  }));

  if (phase === "unknown" || (current === 0 && phase === "idle")) return null;
  const value = shown ?? current;

  return (
    <>
      <View style={s.pill}>
        <View style={s.flameBox}>
          <Reanimated.View style={flameStyle}>
            <Flame size={FLAME} lit={lit} id="streakPillFlame" />
          </Reanimated.View>
          <Confetti progress={burst} count={10} power={0.32} durationS={0.9} colors={EMBERS} />
        </View>
        <FlipNumber value={value} style={s.count} animate={phase === "igniting"} />
      </View>
      {showMilestone && milestone != null && (
        <StreakMilestone
          days={milestone}
          onClose={() => {
            setShowMilestone(false);
            setMilestone(null);
          }}
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  // Solid botten och stora siffror — ska gå lätt att läsa ovanpå hero-bilden
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingLeft: 10, paddingRight: 13,
    borderRadius: 19, backgroundColor: "#1C1A15", borderWidth: 1, borderColor: "rgba(255,178,62,0.55)",
  },
  flameBox: { width: FLAME, height: FLAME, alignItems: "center", justifyContent: "center" },
  count: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: "#F5F1E8", fontVariant: ["tabular-nums"] },
});
