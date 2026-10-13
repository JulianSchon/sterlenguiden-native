/**
 * "Ny månad på topplistan" (visas av belöningsvakten TrophyHost, en gång per ny månad — se
 * useMonthReset): hur det gick förra månaden i topplistan "Flest besök", och att en ny månad
 * börjat där alla börjar om från noll. I januari även hela förra året.
 *
 *  - Plats 1: "Du vann oktober!" med strålkrans och konfetti — kortet delas ut när Viktor
 *    kontrollerat vinnaren, därav "Ditt kort kommer snart".
 *  - Annars: "Oktober är slut!", placeringen poppar fram (guld/silver/brons för 1–3), antal besök
 *    och deltagare, och en uppmaning inför den nya månaden.
 *
 * Till topplistan / Stäng. Allt finns från start och tonas bara fram.
 */
import { useRef } from "react";
import { Modal, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { formatDate } from "@/i18n/dates";
import { useOnModalShown } from "@/hooks/useOnModalShown";
import type { MonthReset, PeriodResult } from "@/hooks/useMonthReset";
import { Confetti, GOLD, GhostButton, GoldButton, GoldRays } from "@/components/checkin/CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.72)";
// Samma metallfärger som topplistans prispall
const PLACE_COLORS: Record<number, string> = { 1: "#E8C674", 2: "#C9CED6", 3: "#C98A5A" };

const monthName = (periodStart: string) => formatDate(`${periodStart}T12:00:00`, "MMMM");
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function MonthResetMoment({ reset, onOpenLeaderboard, onClose }: {
  reset: MonthReset;
  /** Öppna topplistorna — anropas medan ögonblicket fortfarande täcker skärmen */
  onOpenLeaderboard: () => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ready = useRef(false);
  const leaving = useRef(false);
  const main: PeriodResult | null = reset.lastMonth ?? reset.lastYear;
  const isYearOnly = !reset.lastMonth;
  const won = main?.placement === 1;
  const newMonth = capital(formatDate(`${reset.month}-01T12:00:00`, "MMMM"));
  const periodLabel = main ? (isYearOnly ? main.periodStart.slice(0, 4) : monthName(main.periodStart)) : "";

  const backdrop = useSharedValue(0);
  const cardIn = useSharedValue(0);
  const placeIn = useSharedValue(0);
  const restIn = useSharedValue(0);
  const rays = useSharedValue(0);
  const burst = useSharedValue(0);
  const buttonsIn = useSharedValue(0);
  const leave = useSharedValue(0);

  const onShow = useOnModalShown(() => {
    backdrop.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
    cardIn.value = withDelay(150, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
    placeIn.value = withDelay(650, withSpring(1, { damping: 10, stiffness: 170 }));
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      if (won) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 680);
    if (won) {
      rays.value = withDelay(650, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
      burst.value = withDelay(650, withTiming(1, { duration: 1600, easing: Easing.linear }));
    }
    restIn.value = withDelay(1100, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
    buttonsIn.value = withDelay(1600, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    setTimeout(() => { ready.current = true; }, 1600);
  });

  const exit = (open: boolean) => {
    if (leaving.current) return;
    if (!ready.current && open) return;
    leaving.current = true;
    const after = () => {
      if (open) onOpenLeaderboard();
      backdrop.value = withDelay(open ? 500 : 40, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }, (fin) => {
        if (fin) runOnJS(onClose)();
      }));
    };
    rays.value = withTiming(0, { duration: 260 });
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(after)();
    });
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 24 }] }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardIn.value, transform: [{ translateY: interpolate(cardIn.value, [0, 1], [30, 0]) }] }));
  const placeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, placeIn.value * 2),
    transform: [{ scale: interpolate(placeIn.value, [0, 1], [0.4, 1]) }],
  }));
  const restStyle = useAnimatedStyle(() => ({ opacity: restIn.value, transform: [{ translateY: interpolate(restIn.value, [0, 1], [12, 0]) }] }));
  const buttonsStyle = useAnimatedStyle(() => ({ opacity: buttonsIn.value, transform: [{ translateY: interpolate(buttonsIn.value, [0, 1], [14, 0]) }] }));

  if (!main) return null;
  const placeColor = PLACE_COLORS[main.placement] ?? FG;
  const raysSize = Math.hypot(width, height) * 1.05;
  const bottomPad = Math.max(insets.bottom, 16) + 8;
  const year = reset.lastMonth ? reset.lastYear : null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onShow={onShow} onRequestClose={() => exit(false)}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        {won && (
          <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
            <View style={[s.anchor, { top: height * 0.36 - raysSize / 2, left: (width - raysSize) / 2, width: raysSize, height: raysSize }]}>
              <GoldRays size={raysSize} visible={rays} maxOpacity={0.5} />
            </View>
          </Reanimated.View>
        )}
        <Reanimated.View style={[s.root, contentStyle]}>
          <View style={s.center}>
            <Reanimated.View style={[s.texts, cardStyle]}>
              <Text style={s.eyebrow}>TOPPLISTAN · FLEST BESÖK</Text>
              <Text style={s.title}>
                {won ? `Du vann ${periodLabel}!` : `${capital(periodLabel)} är slut!`}
              </Text>
            </Reanimated.View>

            <Reanimated.View style={[s.placeBox, placeStyle]}>
              <Text style={[s.placeLabel, { color: placeColor }]}>PLATS</Text>
              <Text style={[s.placeValue, { color: placeColor }]}>{main.placement}</Text>
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={s.confettiOrigin}><Confetti progress={burst} count={50} power={1.4} /></View>
              </View>
            </Reanimated.View>

            <Reanimated.View style={[s.texts, restStyle]}>
              <Text style={s.stats}>
                {main.visits} besök · {main.participants} deltagare
              </Text>
              {won && <Text style={s.cardNote}>Ditt kort kommer snart.</Text>}
              {year && (
                <Text style={s.yearLine}>
                  Hela {year.periodStart.slice(0, 4)}: plats {year.placement} med {year.visits} besök{year.placement === 1 ? " — du vann året!" : ""}
                </Text>
              )}
              <View style={s.divider} />
              <Text style={s.next}>{newMonth} har börjat — alla börjar om från noll.</Text>
              <Text style={s.nextStrong}>{won ? "Kan du ta förstaplatsen igen?" : "Kan du ta förstaplatsen?"}</Text>
            </Reanimated.View>
          </View>

          <Reanimated.View style={[s.buttons, { paddingBottom: bottomPad }, buttonsStyle]}>
            <GoldButton label="Till topplistan" onPress={() => exit(true)} />
            <GhostButton label="Stäng" onPress={() => exit(false)} />
          </Reanimated.View>
        </Reanimated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#0B0A08" },
  anchor: { position: "absolute", alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  texts: { alignItems: "center", alignSelf: "stretch" },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2.6, color: GOLD, textAlign: "center" },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 28, color: FG, marginTop: 8, textAlign: "center" },
  placeBox: { alignItems: "center", marginTop: 26, marginBottom: 18 },
  placeLabel: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 3 },
  placeValue: { fontFamily: "Montserrat_700Bold", fontSize: 84, lineHeight: 96, fontVariant: ["tabular-nums"] },
  confettiOrigin: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0 },
  stats: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: FG, textAlign: "center" },
  cardNote: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: GOLD, marginTop: 8, textAlign: "center" },
  yearLine: { fontFamily: "Inter_500Medium", fontSize: 14.5, color: MUTED, marginTop: 10, textAlign: "center" },
  divider: { alignSelf: "stretch", height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.14)", marginVertical: 22 },
  next: { fontFamily: "Inter_500Medium", fontSize: 15.5, color: MUTED, textAlign: "center", lineHeight: 22 },
  nextStrong: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: FG, marginTop: 8, textAlign: "center" },
  buttons: { paddingHorizontal: 20, gap: 10 },
});
