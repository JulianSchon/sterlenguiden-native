/**
 * Steg 3 i incheckningens belöning: klättringen i månadens topplista (hela appen). Visas bara för
 * den som valt att synas i topplistorna, och bara när besöket ändrade månadens siffra.
 *
 * Som ligorna i Duolingo: din rad får "+1", lyfts och glider upp förbi dem du just gick om — en
 * vibration för varje — medan placeringen överst rullar. Sen: hur långt det är till nästa
 * placering och hur många dagar som är kvar av månaden, så man vet exakt vad nästa besök gör.
 *
 * Bara grannarna visas: den närmast ovanför (den du jagar), du själv och högst två du gick om.
 * Har du klättrat längre syns det på placeringen som rullar. `skip` hoppar till slutläget.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, {
  Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import { LeaderboardRow, ROW_H } from "@/components/leaderboard/LeaderboardRow";
import { playSound } from "@/lib/sounds";
import { GOLD, RollingNumber } from "./CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.58)";
const GREEN = "#4ADE80";
const ROW_GAP = 8;
const SLOT = ROW_H + ROW_GAP;
/** Tiden det tar att gå om en person */
const PASS_MS = 440;
/** Så många av dem man gick om som visas */
export const MAX_PASSED = 2;
const T_VALUE = 850;
const T_MOVE = 1450;

export interface ClimbData {
  /** Min rad före besöket */
  before: LeaderboardEntry;
  /** Min rad efter besöket (placering och radnummer satta) */
  after: LeaderboardEntry;
  /** Grannarna efter besöket i listans ordning, min egen rad inräknad */
  rows: LeaderboardEntry[];
}

const firstName = (name: string) => name.trim().split(/\s+/)[0];

function daysLeftText(monthName: string): string {
  const now = new Date();
  const left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  if (left === 0) return `Sista dagen i ${monthName}!`;
  return `${left} ${left === 1 ? "dag" : "dagar"} kvar av ${monthName}`;
}

export function ClimbScene({
  data, monthName, skip, onReady,
}: {
  data: ClimbData;
  monthName: string;
  skip: boolean;
  onReady: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const instant = skip || reduceMotion;
  const { before, after } = data;

  const view = useMemo(() => {
    const meIdx = data.rows.findIndex((r) => r.userId === after.userId);
    const above = meIdx > 0 ? data.rows[meIdx - 1] : null;
    const below = data.rows.slice(meIdx + 1);
    // Fanns jag inte på listan förut (inget besök än i månaden) "går jag om" alla under mig
    const wasOn = before.rowPos != null;
    const passedTotal = wasOn ? Math.max(0, before.rowPos! - after.rowPos!) : below.length;
    const passed = below.slice(0, Math.min(passedTotal, MAX_PASSED));
    // Utan klättring visas en rad under mig, som sammanhang
    const tail = passed.length > 0 ? [] : below.slice(0, 1);
    const gained = wasOn && before.placement != null ? before.placement - after.placement! : 0;

    let chip: string | null = null;
    if (!wasOn) chip = "Ny på topplistan!";
    else if (gained > 0) chip = `↑ ${gained} ${gained === 1 ? "placering" : "placeringar"}`;
    else if (passedTotal === 1 && passed[0]) chip = `Du gick om ${firstName(passed[0].name)}!`;
    else if (passedTotal > 1) chip = `Du gick om ${passedTotal} personer!`;

    // Vad nästa besök gör
    let gap: string | null = null;
    if (after.placement === 1) {
      const shared = above?.placement === 1 || [...passed, ...tail].some((r) => r.placement === 1);
      gap = shared ? "Du delar förstaplatsen — 1 besök till så leder du ensam" : `Du leder ${monthName}!`;
    } else if (above) {
      const need = above.value - after.value;
      gap = need > 0
        ? `${need} besök till så når du plats ${above.placement}`
        : `1 besök till så går du om ${firstName(above.name)}`;
    }
    return { above, passed, tail, wasOn, chip, gap };
  }, [data, before, after, monthName]);

  const { above, passed, tail, wasOn } = view;
  const P = passed.length;
  const base = above ? 1 : 0;
  const moveMs = P * PASS_MS;
  const tDone = T_MOVE + moveMs;
  const tInfo = tDone + 350;
  const slots = base + 1 + (P > 0 ? P : tail.length);

  const [passedNow, setPassedNow] = useState(0);
  const [valueIn, setValueIn] = useState(false);
  const [done, setDone] = useState(false);
  const listIn = useSharedValue(0);
  const chip = useSharedValue(0);
  const info = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const readied = useRef(false);

  useEffect(() => {
    const ready = () => {
      if (readied.current) return;
      readied.current = true;
      onReady();
    };
    const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (instant) {
      listIn.value = 1;
      chip.value = 1;
      info.value = 1;
      setPassedNow(P);
      setValueIn(true);
      setDone(true);
      ready();
      return;
    }
    listIn.value = withDelay(100, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    later(T_VALUE, () => {
      setValueIn(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      playSound("tick");
    });
    // En vibration i samma ögonblick som min rad passerar var och en
    for (let k = 0; k < P; k++) {
      later(T_MOVE + k * PASS_MS + PASS_MS / 2, () => {
        setPassedNow(k + 1);
        Haptics.impactAsync(k === 0 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        playSound("climb");
      });
    }
    later(tDone, () => {
      setDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
    chip.value = withDelay(tDone, withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.8)) }));
    info.value = withDelay(tInfo, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
    later(tInfo + 500, ready);
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instant]);

  const listStyle = useAnimatedStyle(() => ({
    opacity: listIn.value,
    transform: [{ translateY: interpolate(listIn.value, [0, 1], [14, 0]) }],
  }));
  const chipStyle = useAnimatedStyle(() => ({ opacity: chip.value, transform: [{ scale: interpolate(chip.value, [0, 1], [0.6, 1]) }] }));
  const infoStyle = useAnimatedStyle(() => ({
    opacity: info.value,
    transform: [{ translateY: interpolate(info.value, [0, 1], [10, 0]) }],
  }));

  const me: LeaderboardEntry = {
    ...after,
    placement: done ? after.placement : before.placement,
    value: valueIn ? after.value : before.value,
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Text style={s.eyebrow}>TOPPLISTAN · {monthName.toUpperCase()}</Text>
        <View style={s.placeRow}>
          <Text style={s.placeLabel}>Plats </Text>
          <RollingNumber
            from={before.placement ?? after.placement!}
            to={after.placement!}
            startAt={T_MOVE}
            durationMs={Math.max(300, moveMs)}
            skip={instant}
            style={s.placeValue}
            align="left"
          />
        </View>
        <Text style={s.scope}>Hela appen</Text>
        {view.chip && (
          <Reanimated.View style={[s.chip, chipStyle]}>
            <Text style={s.chipText}>{view.chip}</Text>
          </Reanimated.View>
        )}
      </View>

      <Reanimated.View style={[{ height: slots * SLOT - ROW_GAP }, listStyle]}>
        {above && <SlotRow entry={above} fromSlot={0} toSlot={0} moveAt={0} instant={instant} />}
        {passed.map((r, j) => {
          // Den närmast ovanför mig passeras först
          const k = P - 1 - j;
          // Före besöket låg de jag gick om, med lika många som jag hade då, en placering högre
          const earlier = r.placement != null && r.value < after.value ? r.placement - 1 : r.placement;
          return (
            <SlotRow
              key={r.userId}
              entry={{ ...r, placement: passedNow > k ? r.placement : earlier }}
              fromSlot={base + j}
              toSlot={base + j + 1}
              moveAt={T_MOVE + k * PASS_MS}
              instant={instant}
            />
          );
        })}
        {tail.map((r) => <SlotRow key={r.userId} entry={r} fromSlot={base + 1} toSlot={base + 1} moveAt={0} instant={instant} />)}
        <MeRow
          entry={me}
          plus={after.value - before.value}
          fromSlot={base + P}
          toSlot={base}
          fadeIn={!wasOn}
          instant={instant}
        />
      </Reanimated.View>

      <Reanimated.View style={[s.info, infoStyle]}>
        {view.gap && <Text style={s.gap}>{view.gap}</Text>}
        <Text style={s.days}>{daysLeftText(monthName)}</Text>
      </Reanimated.View>
    </ScrollView>
  );
}

/** En annan persons rad — står still, eller glider ner ett steg när jag går om den. */
function SlotRow({ entry, fromSlot, toSlot, moveAt, instant }: {
  entry: LeaderboardEntry; fromSlot: number; toSlot: number; moveAt: number; instant: boolean;
}) {
  const y = useSharedValue((instant ? toSlot : fromSlot) * SLOT);
  useEffect(() => {
    if (instant) {
      y.value = toSlot * SLOT;
      return;
    }
    if (fromSlot !== toSlot) {
      y.value = withDelay(moveAt, withTiming(toSlot * SLOT, { duration: PASS_MS, easing: Easing.inOut(Easing.cubic) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instant]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Reanimated.View style={[s.slot, style]}>
      <LeaderboardRow entry={entry} metric="visits" />
    </Reanimated.View>
  );
}

/** Min egen rad: "+1" flyter upp, raden lyfts och glider upp ett steg i taget förbi dem jag går om. */
function MeRow({ entry, plus, fromSlot, toSlot, fadeIn, instant }: {
  entry: LeaderboardEntry; plus: number; fromSlot: number; toSlot: number; fadeIn: boolean; instant: boolean;
}) {
  const y = useSharedValue((instant ? toSlot : fromSlot) * SLOT);
  const lift = useSharedValue(0);
  const appear = useSharedValue(fadeIn && !instant ? 0 : 1);
  const float = useSharedValue(0);
  const steps = fromSlot - toSlot;

  useEffect(() => {
    if (instant) {
      y.value = toSlot * SLOT;
      lift.value = 0;
      appear.value = 1;
      float.value = 0;
      return;
    }
    if (fadeIn) appear.value = withDelay(T_VALUE - 300, withTiming(1, { duration: 300 }));
    float.value = withDelay(T_VALUE, withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) }));
    lift.value = withDelay(T_MOVE - 160, withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withDelay(steps * PASS_MS, withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) })),
    ));
    if (steps > 0) {
      const moves = Array.from({ length: steps }, (_, i) =>
        withTiming((fromSlot - 1 - i) * SLOT, { duration: PASS_MS, easing: Easing.inOut(Easing.cubic) }));
      y.value = withDelay(T_MOVE, withSequence(...moves));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instant]);

  const style = useAnimatedStyle(() => ({
    opacity: appear.value,
    shadowOpacity: lift.value * 0.55,
    transform: [{ translateY: y.value }, { scale: 1 + lift.value * 0.035 }],
  }));
  const floatStyle = useAnimatedStyle(() => ({
    opacity: interpolate(float.value, [0, 0.12, 0.7, 1], [0, 1, 1, 0]),
    transform: [{ translateY: interpolate(float.value, [0, 1], [4, -30]) }],
  }));

  return (
    <Reanimated.View style={[s.slot, s.meSlot, style]}>
      <LeaderboardRow entry={entry} metric="visits" highlight />
      <Reanimated.Text style={[s.plusFloat, floatStyle]}>+{plus}</Reanimated.Text>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 20 },
  header: { alignItems: "center", marginBottom: 22 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 2.4, color: MUTED, textAlign: "center" },
  placeRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  placeLabel: { fontFamily: "Montserrat_700Bold", fontSize: 44, lineHeight: 52, color: FG },
  placeValue: {
    fontFamily: "Montserrat_700Bold", fontSize: 44, lineHeight: 52, color: GOLD, fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(233,196,106,0.5)", textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 },
  },
  scope: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: MUTED, marginTop: 2 },
  chip: {
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: "rgba(74,222,128,0.14)", borderWidth: 1, borderColor: "rgba(74,222,128,0.5)",
  },
  chipText: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: GREEN },
  slot: { position: "absolute", left: 0, right: 0, top: 0 },
  // Ogenomskinlig botten under min (halvgenomskinligt guldtonade) rad, så raderna jag glider förbi
  // inte lyser igenom
  meSlot: {
    zIndex: 2, borderRadius: 14, backgroundColor: "#0B0A08",
    shadowColor: GOLD, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  plusFloat: { position: "absolute", right: 18, top: -6, fontFamily: "Montserrat_700Bold", fontSize: 16, color: GREEN },
  info: { alignItems: "center", marginTop: 22, gap: 6 },
  gap: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: GOLD, textAlign: "center" },
  days: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: MUTED, textAlign: "center" },
});
