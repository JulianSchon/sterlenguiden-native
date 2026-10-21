/**
 * Kodrutorna i "Skriv in koden". Bara rutan man skriver i härnäst har en kant, i appens gul–orange
 * (STORY_GRADIENT). När sista siffran är skriven släcks alla kanter en kort stund, sedan snurrar en
 * kant runt alla sex samtidigt medan koden kontrolleras. Stämmer koden glider rutorna ihop till en,
 * som växer lite och lägger sig med en bock — sedan går flödet vidare (onOkShown). Stämmer den inte
 * skakar rutorna till i rött.
 *
 * Allt rör sig på UI-tråden; flödet säger bara vilken fas det är.
 */
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";
import { STORY_GRADIENT } from "@/theme/storyGradient";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export type CodePhase = "typing" | "checking" | "ok" | "wrong";

const GAP = 8;
const RADIUS = 14;
const STROKE = 2;
/** Ett varv runt rutan medan koden kontrolleras */
const LAP_MS = 820;
/** Snurret visas minst så här länge, även om svaret kommer fortare */
const MIN_SPIN_MS = 950;
/** Bocken får synas så här länge innan flödet går vidare */
const CHECK_HOLD_MS = 650;

const AnimatedRect = Reanimated.createAnimatedComponent(Rect);

export function CodeBoxes({
  code, length, width, focused, phase, onOkShown,
}: {
  code: string;
  length: number;
  /** Radens bredd */
  width: number;
  focused: boolean;
  phase: CodePhase;
  /** Rutorna har gått ihop och bocken syns: dags att gå vidare */
  onOkShown: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const boxW = Math.min(56, (width - GAP * (length - 1)) / length);
  const boxH = Math.round(boxW / 0.82);
  const rowW = boxW * length + GAP * (length - 1);
  const startX = (width - rowW) / 2;

  // lights: de vanliga kanterna (släcks innan snurret). spin: varvet. spinOn/fullOn: snurrande
  // respektive hel färgkant på alla rutor. merge: rutorna glider ihop. pop: den sammanslagna
  // rutans studs. check: bocken. wrong: röd kant. shake: skakningen.
  const lights = useSharedValue(1);
  const spin = useSharedValue(0);
  const spinOn = useSharedValue(0);
  const fullOn = useSharedValue(0);
  const merge = useSharedValue(0);
  const pop = useSharedValue(1);
  const check = useSharedValue(0);
  const wrong = useSharedValue(0);
  const shake = useSharedValue(0);
  const checkingSince = useRef(0);
  const okRef = useRef(onOkShown);
  okRef.current = onOkShown;

  useEffect(() => {
    if (phase === "typing") {
      cancelAnimation(spin);
      lights.value = withTiming(1, { duration: 160 });
      spinOn.value = 0;
      fullOn.value = 0;
      merge.value = 0;
      pop.value = 1;
      check.value = 0;
      wrong.value = withTiming(0, { duration: 400 });
      return;
    }
    if (phase === "checking") {
      checkingSince.current = Date.now();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      // Släcks en kort stund, sedan börjar kanten snurra runt alla rutor
      lights.value = withTiming(0, { duration: 140 });
      spin.value = 0;
      spinOn.value = withDelay(260, withTiming(1, { duration: 160 }));
      spin.value = withDelay(260, withRepeat(withTiming(1, { duration: LAP_MS, easing: Easing.linear }), -1, false));
      return;
    }
    if (phase === "wrong") {
      cancelAnimation(spin);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      spinOn.value = withTiming(0, { duration: 120 });
      lights.value = withTiming(1, { duration: 160 });
      wrong.value = withSequence(withTiming(1, { duration: 120 }), withDelay(900, withTiming(0, { duration: 400 })));
      shake.value = withSequence(
        withTiming(-10, { duration: 55 }), withTiming(10, { duration: 70 }), withTiming(-7, { duration: 65 }),
        withTiming(7, { duration: 60 }), withTiming(-3, { duration: 55 }), withTiming(0, { duration: 50 }),
      );
      return;
    }
    // Rätt kod: låt varvet gå klart en stund, sedan glider rutorna ihop
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - checkingSince.current));
    const timer = setTimeout(() => {
      const shown = () => setTimeout(() => okRef.current(), CHECK_HOLD_MS);
      const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      cancelAnimation(spin);
      spinOn.value = withTiming(0, { duration: 180 });
      fullOn.value = withTiming(1, { duration: 180 });
      merge.value = withTiming(1, { duration: 420, easing: Easing.inOut(Easing.cubic) }, (done) => {
        if (!done) return;
        runOnJS(success)();
        pop.value = withSequence(
          withTiming(1.16, { duration: 170, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 12, stiffness: 220 }),
        );
        check.value = withTiming(1, { duration: 220 }, (shownDone) => {
          if (shownDone) runOnJS(shown)();
        });
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }, { scale: pop.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: check.value, transform: [{ scale: 0.6 + check.value * 0.4 }] }));
  const values = useMemo(() => ({ lights, spin, spinOn, fullOn, merge, wrong }), [lights, spin, spinOn, fullOn, merge, wrong]);
  const active = focused && phase === "typing" ? Math.min(code.length, length - 1) : -1;

  return (
    <View style={{ width, height: boxH }}>
      <Reanimated.View style={[StyleSheet.absoluteFill, rowStyle]}>
        {Array.from({ length }, (_, i) => (
          <Box
            key={i}
            index={i}
            left={startX + i * (boxW + GAP)}
            shift={width / 2 - (startX + i * (boxW + GAP) + boxW / 2)}
            w={boxW}
            h={boxH}
            digit={code[i] ?? ""}
            active={i === active}
            caret={i === active && !code[i]}
            values={values}
          />
        ))}
        <Reanimated.View pointerEvents="none" style={[s.check, { left: width / 2 - 14, top: boxH / 2 - 14 }, checkStyle]}>
          <Check size={28} color={colors.text} strokeWidth={2.6} />
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

type Values = Record<"lights" | "spin" | "spinOn" | "fullOn" | "merge" | "wrong", SharedValue<number>>;

function Box({
  index, left, shift, w, h, digit, active, caret, values,
}: {
  index: number; left: number; shift: number; w: number; h: number; digit: string;
  active: boolean; caret: boolean; values: Values;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { lights, spin, spinOn, fullOn, merge, wrong } = values;
  // Kanten på rutan man skriver i tonas in och ut när man går vidare
  const lit = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    lit.value = withTiming(active ? 1 : 0, { duration: 140 });
  }, [active, lit]);

  const inner = { x: STROKE / 2, y: STROKE / 2, w: w - STROKE, h: h - STROKE, r: RADIUS - STROKE / 2 };
  const perimeter = 2 * (inner.w - 2 * inner.r) + 2 * (inner.h - 2 * inner.r) + 2 * Math.PI * inner.r;
  const dash = perimeter * 0.32;

  const boxStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift * merge.value }] }));
  const plainStyle = useAnimatedStyle(() => ({ opacity: lights.value * (1 - merge.value) }));
  const colorStyle = useAnimatedStyle(() => ({ opacity: Math.max(lit.value * lights.value, fullOn.value) }));
  const spinStyle = useAnimatedStyle(() => ({ opacity: spinOn.value }));
  const wrongStyle = useAnimatedStyle(() => ({ opacity: wrong.value }));
  const digitStyle = useAnimatedStyle(() => ({ opacity: 1 - merge.value }));
  const spinProps = useAnimatedProps(() => ({ strokeDashoffset: -spin.value * perimeter }));
  const gradientId = `code-${index}`;

  const ring = (id: string) => (
    <Defs>
      <LinearGradient id={id} x1={STORY_GRADIENT.x1} y1={STORY_GRADIENT.y1} x2={STORY_GRADIENT.x2} y2={STORY_GRADIENT.y2}>
        {STORY_GRADIENT.stops.map((stop) => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />)}
      </LinearGradient>
    </Defs>
  );

  return (
    <Reanimated.View style={[s.box, { left, width: w, height: h }, boxStyle]}>
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.plain, plainStyle]} />
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, colorStyle]}>
        <Svg width={w} height={h}>
          {ring(`${gradientId}-full`)}
          <Rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx={inner.r} fill="none" stroke={`url(#${gradientId}-full)`} strokeWidth={STROKE} />
        </Svg>
      </Reanimated.View>
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, spinStyle]}>
        <Svg width={w} height={h}>
          {ring(`${gradientId}-spin`)}
          <AnimatedRect
            x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx={inner.r} fill="none"
            stroke={`url(#${gradientId}-spin)`} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={[dash, perimeter - dash]}
            animatedProps={spinProps}
          />
        </Svg>
      </Reanimated.View>
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.wrong, { borderColor: colors.danger }, wrongStyle]} />
      <Reanimated.View style={digitStyle}>
        {digit ? <Text style={s.digit}>{digit}</Text> : caret ? <Caret /> : null}
      </Reanimated.View>
    </Reanimated.View>
  );
}

/** Den blinkande markören i rutan man skriver i härnäst */
function Caret() {
  const on = useSharedValue(1);
  useEffect(() => {
    on.value = withRepeat(withSequence(
      withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }),
      withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }),
    ), -1);
  }, [on]);
  const style = useAnimatedStyle(() => ({ opacity: on.value }));
  return <Reanimated.View style={[{ width: 2, height: 26, borderRadius: 1, backgroundColor: "#FFB000" }, style]} />;
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  box: {
    position: "absolute", top: 0, borderRadius: RADIUS, backgroundColor: c.raised,
    alignItems: "center", justifyContent: "center",
  },
  plain: { borderRadius: RADIUS, borderWidth: 1.5, borderColor: c.borderStrong },
  wrong: { borderRadius: RADIUS, borderWidth: STROKE },
  digit: { fontFamily: "Montserrat_700Bold", fontSize: 26, color: c.text },
  check: { position: "absolute", width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
