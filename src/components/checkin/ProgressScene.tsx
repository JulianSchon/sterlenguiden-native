/**
 * Steg 2 i incheckningens belöning: vad besöket förde med sig, en sak i taget.
 *
 *  - Den stora siffran: antal platser du besökt på Österlen rullar upp (23 → 24) med en kraftig
 *    vibration och ett "+1". Vid milstolpar (10, 25, 50, 75, 100 …) skjuts konfetti ut.
 *  - Utmaningarna som besöket påverkade (alltid minst Utforskaren vid ett första besök, tills
 *    guld är nått): stapeln fylls från förra värdet till det nya medan telefonen tickar i takt,
 *    siffrorna rullar och ett "+1" poppar fram. Klarar besöket en nivå: stapeln blixtrar, en
 *    glans sveper över den, medaljen poppar fram i färg och "Silver upplåst!" dyker upp.
 *  - Månadens topplista: hur många platser du besökt den här månaden, och — om du syns i
 *    topplistorna — hur många placeringar du klättrade.
 *
 * Allt spelas i sekvens (en rad i taget), och `skip` hoppar direkt till slutläget. `onReady`
 * anropas när allt är klart, så föräldern kan visa knapparna.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, {
  Easing, interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Trophy as TrophyIcon } from "lucide-react-native";
import { TrophyMedal } from "@/components/trophies/TrophyMedal";
import type { Trophy } from "@/lib/achievements";
import { playSound } from "@/lib/sounds";
import { Confetti, GOLD, RollingNumber } from "./CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.58)";
const CARD = "#17171A";
const GREEN = "#4ADE80";
const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250];

export interface ProgressItem {
  key: string;
  /** Troféns läge EFTER besöket (namn, nivå, ikon) */
  trophy: Trophy;
  from: number;
  to: number;
  target: number;
  /** Besöket klarade den här nivån */
  unlocked: boolean;
}

export interface MonthStat { value: number; placement: number | null }

type Haptic = Haptics.ImpactFeedbackStyle;
const tap = (style: Haptic) => Haptics.impactAsync(style).catch(() => {});

export function ProgressScene({
  hero, items, month, monthName, skip, onReady,
}: {
  hero: { from: number; to: number } | null;
  items: ProgressItem[];
  month: { before: MonthStat | null; after: MonthStat } | null;
  monthName: string;
  skip: boolean;
  onReady: () => void;
}) {
  // Hela tidslinjen räknas ut i förväg — varje rad vet exakt när den ska börja
  const plan = useMemo(() => {
    const milestone = !!hero && MILESTONES.includes(hero.to);
    const heroRollAt = 800;
    let t = hero ? heroRollAt + 700 + (milestone ? 800 : 0) : 300;
    const rows = items.map((it) => {
      const appearAt = t;
      const fillAt = t + 360;
      t = fillAt + 1000 + 300 + (it.unlocked ? 900 : 0);
      return { appearAt, fillAt };
    });
    const monthPlan = month ? { appearAt: t, rollAt: t + 380 } : null;
    if (month) t += 380 + 900 + 200;
    return { milestone, heroRollAt, rows, monthPlan, readyAt: t + 250 };
  }, [hero, items, month]);

  const readied = useRef(false);
  useEffect(() => {
    const ready = () => {
      if (readied.current) return;
      readied.current = true;
      onReady();
    };
    if (skip) {
      ready();
      return;
    }
    const timer = setTimeout(ready, plan.readyAt);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <Text style={s.eyebrow}>DITT BESÖK</Text>
      {hero && <HeroCounter from={hero.from} to={hero.to} rollAt={plan.heroRollAt} milestone={plan.milestone} skip={skip} />}
      <View style={s.rows}>
        {items.map((it, i) => (
          <ProgressRow key={it.key} item={it} appearAt={plan.rows[i].appearAt} fillAt={plan.rows[i].fillAt} skip={skip} />
        ))}
        {month && plan.monthPlan && (
          <MonthRow month={month} monthName={monthName} appearAt={plan.monthPlan.appearAt} rollAt={plan.monthPlan.rollAt} skip={skip} />
        )}
      </View>
    </ScrollView>
  );
}

// ─── Den stora siffran ─────────────────────────────────────────────────────────
function HeroCounter({ from, to, rollAt, milestone, skip }: { from: number; to: number; rollAt: number; milestone: boolean; skip: boolean }) {
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(0);
  const plus = useSharedValue(0);
  const burst = useSharedValue(0);
  const chip = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (skip || reduceMotion) {
      timers.current.forEach(clearTimeout);
      plus.value = 1;
      chip.value = milestone ? 1 : 0;
      burst.value = milestone ? 1 : 0;
      return;
    }
    plus.value = withDelay(rollAt + 140, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) }));
    if (milestone) {
      timers.current.push(setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        playSound("milestone");
      }, rollAt + 300));
      burst.value = withDelay(rollAt + 300, withTiming(1, { duration: 1400, easing: Easing.linear }));
      chip.value = withDelay(rollAt + 420, withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.8)) }));
    }
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.16 }] }));
  const plusStyle = useAnimatedStyle(() => ({
    opacity: plus.value,
    transform: [{ scale: interpolate(plus.value, [0, 1], [0.4, 1]) }, { translateY: interpolate(plus.value, [0, 1], [10, 0]) }],
  }));
  const chipStyle = useAnimatedStyle(() => ({ opacity: chip.value, transform: [{ scale: interpolate(chip.value, [0, 1], [0.6, 1]) }] }));

  return (
    <View style={s.hero}>
      <View style={s.heroRow}>
        <Reanimated.View style={numberStyle}>
          <RollingNumber
            from={from}
            to={to}
            startAt={rollAt}
            durationMs={300}
            skip={skip}
            style={s.heroNumber}
            onStep={() => {
              tap(Haptics.ImpactFeedbackStyle.Heavy);
              playSound("tick");
              pop.value = withSequence(withTiming(1, { duration: 110 }), withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
            }}
          />
        </Reanimated.View>
        <Reanimated.View style={[s.plusBadge, plusStyle]}>
          <Text style={s.plusText}>+{to - from}</Text>
        </Reanimated.View>
        {milestone && <Confetti progress={burst} count={40} power={1.15} />}
      </View>
      <Text style={s.heroLabel}>{to === 1 ? "plats besökt på Österlen" : "platser besökta på Österlen"}</Text>
      {milestone && (
        <Reanimated.View style={[s.milestoneChip, chipStyle]}>
          <Text style={s.milestoneText}>Milstolpe — din {to}:e plats!</Text>
        </Reanimated.View>
      )}
    </View>
  );
}

// ─── En utmaning som fylls ─────────────────────────────────────────────────────
function ProgressRow({ item, appearAt, fillAt, skip }: { item: ProgressItem; appearAt: number; fillAt: number; skip: boolean }) {
  const reduceMotion = useReducedMotion();
  const [trackW, setTrackW] = useState(0);
  const [unlockedNow, setUnlockedNow] = useState(false);
  const inV = useSharedValue(0);
  const fill = useSharedValue(item.from / item.target);
  const plus = useSharedValue(0);
  const unlock = useSharedValue(0);
  const shine = useSharedValue(0);
  const medalPop = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const end = Math.min(1, item.to / item.target);

  useEffect(() => {
    if (skip || reduceMotion) {
      timers.current.forEach(clearTimeout);
      inV.value = 1; fill.value = end; plus.value = 1;
      if (item.unlocked) { unlock.value = 1; setUnlockedNow(true); }
      return;
    }
    inV.value = withDelay(appearAt, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
    fill.value = withDelay(fillAt, withTiming(end, { duration: 1000, easing: Easing.inOut(Easing.cubic) }));
    // Vibrationer under fyllnaden — tätare och starkare mot slutet, sedan en tydlig "klar"
    const ticks: [number, Haptic][] = [
      [0.12, Haptics.ImpactFeedbackStyle.Soft], [0.3, Haptics.ImpactFeedbackStyle.Soft],
      [0.46, Haptics.ImpactFeedbackStyle.Light], [0.6, Haptics.ImpactFeedbackStyle.Light],
      [0.72, Haptics.ImpactFeedbackStyle.Light], [0.83, Haptics.ImpactFeedbackStyle.Medium],
    ];
    ticks.forEach(([f, style]) => later(fillAt + 1000 * f, () => tap(style)));
    later(fillAt + 1000, () => { tap(Haptics.ImpactFeedbackStyle.Medium); playSound("tick"); });
    plus.value = withDelay(fillAt + 1000, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) }));

    if (item.unlocked) {
      const at = fillAt + 1150;
      later(at, () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        playSound("milestone");
        setUnlockedNow(true);
      });
      unlock.value = withDelay(at, withTiming(1, { duration: 450 }));
      shine.value = withDelay(at, withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }));
      medalPop.value = withDelay(at, withSequence(
        withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) }),
      ));
    }
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: inV.value,
    transform: [{ translateY: interpolate(inV.value, [0, 1], [22, 0]) }],
    borderColor: interpolateColor(unlock.value, [0, 1], ["rgba(255,255,255,0.08)", "rgba(233,196,106,0.75)"]),
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: Math.max(10, fill.value * trackW) }));
  const brightStyle = useAnimatedStyle(() => ({ opacity: unlock.value }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shine.value, [0, 0.1, 0.85, 1], [0, 0.9, 0.9, 0]),
    transform: [{ translateX: interpolate(shine.value, [0, 1], [-50, trackW + 20]) }, { skewX: "-20deg" }],
  }));
  const plusStyle = useAnimatedStyle(() => ({
    opacity: plus.value,
    transform: [{ scale: interpolate(plus.value, [0, 1], [0.4, 1]) }],
  }));
  const medalStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + medalPop.value * 0.28 }] }));
  const chipStyle = useAnimatedStyle(() => ({
    opacity: unlock.value,
    transform: [{ scale: interpolate(unlock.value, [0, 1], [0.7, 1]) }],
  }));

  const t = item.trophy;
  return (
    <Reanimated.View style={[s.card, cardStyle]}>
      <View style={s.cardTop}>
        <Reanimated.View style={medalStyle}>
          <TrophyMedal size={50} tier={t.tier} Icon={t.Icon} unlocked={unlockedNow} groupId={t.groupId} />
        </Reanimated.View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{t.identity}</Text>
          <Text style={s.cardSub} numberOfLines={1}>{t.levelLabel} · {t.levelName}</Text>
        </View>
        <View style={s.countWrap}>
          <Reanimated.View style={[s.plusSmall, plusStyle]}>
            <Text style={s.plusSmallText}>+{item.to - item.from}</Text>
          </Reanimated.View>
          <RollingNumber from={item.from} to={Math.min(item.to, item.target)} startAt={fillAt + 500} durationMs={400} skip={skip} style={s.count} align="right" />
          <Text style={s.countOf}> / {item.target}</Text>
        </View>
      </View>

      <View style={s.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <Reanimated.View style={[s.fill, fillStyle]}>
          <GradientFill id={`pf-${item.key}`} colors={["#B88E36", GOLD]} />
          <Reanimated.View style={[StyleSheet.absoluteFill, brightStyle]}>
            <GradientFill id={`pfb-${item.key}`} colors={["#F5D88A", "#FFF4D0"]} />
          </Reanimated.View>
          <View style={s.fillHead} />
        </Reanimated.View>
        <Reanimated.View style={[s.shine, shineStyle]} pointerEvents="none" />
      </View>

      {item.unlocked ? (
        <Reanimated.View style={[s.unlockChip, chipStyle]}>
          <Text style={s.unlockText}>{t.levelLabel} upplåst!</Text>
        </Reanimated.View>
      ) : (
        <Text style={s.req}>{item.target - Math.min(item.to, item.target)} kvar · {t.requirementText}</Text>
      )}
    </Reanimated.View>
  );
}

function GradientFill({ id, colors }: { id: string; colors: [string, string] }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

// ─── Månadens topplista ────────────────────────────────────────────────────────
function MonthRow({
  month, monthName, appearAt, rollAt, skip,
}: {
  month: { before: MonthStat | null; after: MonthStat };
  monthName: string;
  appearAt: number;
  rollAt: number;
  skip: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const inV = useSharedValue(0);
  const arrow = useSharedValue(0);
  const before = month.before;
  const after = month.after;
  const climbed = before?.placement != null && after.placement != null ? before.placement - after.placement : 0;

  useEffect(() => {
    if (skip || reduceMotion) {
      inV.value = 1;
      arrow.value = 1;
      return;
    }
    inV.value = withDelay(appearAt, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
    arrow.value = withDelay(rollAt + 900, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: inV.value,
    transform: [{ translateY: interpolate(inV.value, [0, 1], [22, 0]) }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({ opacity: arrow.value, transform: [{ scale: interpolate(arrow.value, [0, 1], [0.4, 1]) }] }));
  const tick = () => {
    Haptics.selectionAsync().catch(() => {});
    playSound("tick");
  };

  return (
    <Reanimated.View style={[s.card, cardStyle]}>
      <View style={s.cardTop}>
        <View style={s.monthIcon}><TrophyIcon size={22} color={GOLD} strokeWidth={2} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Topplistan</Text>
          <Text style={s.cardSub}>Hela appen · {monthName}</Text>
        </View>
      </View>

      <View style={s.monthLine}>
        <RollingNumber from={before?.value ?? after.value} to={after.value} startAt={rollAt} durationMs={350} skip={skip} style={s.monthValue} align="left" onStep={tick} />
        <Text style={s.monthLabel}> {after.value === 1 ? "besökt plats" : "besökta platser"} i {monthName}</Text>
      </View>

      {after.placement != null && (
        <View style={s.monthLine}>
          <Text style={s.monthLabel}>Plats </Text>
          {before?.placement != null ? (
            <RollingNumber from={before.placement} to={after.placement} startAt={rollAt + 450} durationMs={700} skip={skip} style={s.monthValue} align="left" onStep={tick} />
          ) : (
            <Text style={s.monthValue}>{after.placement}</Text>
          )}
          {climbed > 0 ? (
            <Reanimated.View style={[s.climb, arrowStyle]}>
              <Text style={s.climbText}>↑ {climbed}</Text>
            </Reanimated.View>
          ) : before?.placement == null ? (
            <Reanimated.View style={[s.climb, arrowStyle]}>
              <Text style={s.climbText}>Ny</Text>
            </Reanimated.View>
          ) : null}
        </View>
      )}
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 2.4, color: MUTED, textAlign: "center" },

  hero: { alignItems: "center", marginTop: 10 },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  heroNumber: {
    fontFamily: "Montserrat_700Bold", fontSize: 92, lineHeight: 104, color: GOLD,
    textShadowColor: "rgba(233,196,106,0.55)", textShadowRadius: 22, textShadowOffset: { width: 0, height: 0 },
  },
  plusBadge: {
    marginLeft: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: "rgba(74,222,128,0.16)", borderWidth: 1, borderColor: "rgba(74,222,128,0.5)",
  },
  plusText: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: GREEN },
  heroLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: MUTED, marginTop: -4 },
  milestoneChip: {
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "rgba(233,196,106,0.16)", borderWidth: 1, borderColor: "rgba(233,196,106,0.6)",
  },
  milestoneText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: GOLD },

  rows: { gap: 12, marginTop: 30 },
  card: {
    backgroundColor: CARD, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: FG },
  cardSub: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: MUTED, marginTop: 2 },
  countWrap: { flexDirection: "row", alignItems: "baseline" },
  count: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: FG, fontVariant: ["tabular-nums"] },
  countOf: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED },
  plusSmall: {
    marginRight: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    backgroundColor: "rgba(74,222,128,0.16)", alignSelf: "center",
  },
  plusSmallText: { fontFamily: "Montserrat_700Bold", fontSize: 12.5, color: GREEN },
  track: {
    height: 12, borderRadius: 6, marginTop: 14, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 6, overflow: "hidden" },
  // Ett ljust "huvud" längst fram i stapeln, så även en liten förflyttning syns tydligt
  fillHead: {
    position: "absolute", right: 0, top: 0, bottom: 0, width: 10, borderRadius: 6,
    backgroundColor: "#FFF4D0", opacity: 0.85,
  },
  shine: { position: "absolute", top: -4, bottom: -4, width: 26, backgroundColor: "rgba(255,255,255,0.75)" },
  req: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 9 },
  unlockChip: {
    alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "rgba(233,196,106,0.18)", borderWidth: 1, borderColor: "rgba(233,196,106,0.6)",
  },
  unlockText: { fontFamily: "Inter_700Bold", fontSize: 13, color: GOLD },

  monthIcon: {
    width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(233,196,106,0.12)", borderWidth: 1, borderColor: "rgba(233,196,106,0.35)",
  },
  monthLine: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  monthValue: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: FG, fontVariant: ["tabular-nums"] },
  monthLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED },
  climb: {
    marginLeft: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8,
    backgroundColor: "rgba(74,222,128,0.16)",
  },
  climbText: { fontFamily: "Montserrat_700Bold", fontSize: 13, color: GREEN },
});
