/**
 * Byggstenar för belöningsögonblicken: konfetti med tyngdkraft, en roterande strålkrans,
 * siffror som rullar, staplar som fylls, passtämpeln och guldknappen. Samlade här så alla
 * belöningar i appen (incheckningen nu, presenten och troféerna sen) får samma "saftighet" —
 * samma partiklar, samma rörelser, samma vibrationer, samma knapp — i stället för att varje
 * ögonblick uppfinner sina egna.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, StyleSheet, Text, View, type TextStyle, type StyleProp, type ViewStyle } from "react-native";
import Reanimated, {
  Easing, FadeInDown, FadeOutUp, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle,
  useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { PressableScale } from "@/components/PressableScale";
import { playSound } from "@/lib/sounds";

export const INK = "#EBC870";
export const GOLD = "#E9C46A";
const CONFETTI_COLORS = ["#FFF1C1", "#F5D88A", "#E9C46A", "#C9A24C", "#FFFFFF"];

// ─── Konfetti ──────────────────────────────────────────────────────────────────
/**
 * Konfetti som skjuts ut ur en punkt och faller med tyngdkraft — rundlar och små remsor i guld,
 * var och en med egen fart, rotation och snurr. Styrs av ett enda värde 0→1 (`progress`) som
 * föräldern animerar; ligger osynlig på 0. Lägg komponenten i den punkt den ska skjutas ut från.
 */
export function Confetti({
  progress, count = 30, power = 1, durationS = 1.3,
}: { progress: SharedValue<number>; count?: number; power?: number; durationS?: number }) {
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5; // mest uppåt, ut åt sidorna
      const speed = (260 + Math.random() * 320) * power;
      const strip = i % 3 === 0;
      return {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: strip ? 4 : 5 + Math.random() * 4,
        h: strip ? 10 + Math.random() * 4 : 0,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot0: Math.random() * 360,
        spin: (Math.random() - 0.5) * 900,
      };
    }),
    [count, power],
  );
  return (
    <View style={s.confettiOrigin} pointerEvents="none">
      {pieces.map((p, i) => <ConfettiPiece key={i} piece={p} progress={progress} durationS={durationS} />)}
    </View>
  );
}

function ConfettiPiece({
  piece, progress, durationS,
}: {
  piece: { vx: number; vy: number; w: number; h: number; color: string; rot0: number; spin: number };
  progress: SharedValue<number>;
  durationS: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value * durationS;
    return {
      opacity: interpolate(progress.value, [0, 0.02, 0.62, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: piece.vx * t },
        { translateY: piece.vy * t + 0.5 * 1100 * t * t },
        { rotate: `${piece.rot0 + piece.spin * progress.value}deg` },
      ],
    };
  });
  const round = piece.h === 0;
  return (
    <Reanimated.View
      style={[
        s.piece,
        {
          width: piece.w, height: round ? piece.w : piece.h, borderRadius: round ? piece.w / 2 : 1.5,
          backgroundColor: piece.color, marginLeft: -piece.w / 2, marginTop: -(round ? piece.w : piece.h) / 2,
        },
        style,
      ]}
    />
  );
}

// ─── Strålkrans ────────────────────────────────────────────────────────────────
/**
 * Mjuka guldstrålar som långsamt roterar bakom en belöning (som i spel) — tonar ut mot kanten med
 * en radiell gradient. `visible` 0→1 styrs av föräldern; själva rotationen går av sig själv.
 */
export function GoldRays({ size, visible, maxOpacity = 0.5 }: { size: number; visible: SharedValue<number>; maxOpacity?: number }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    turn.value = withRepeat(withTiming(1, { duration: 28000, easing: Easing.linear }), -1, false);
  }, [reduceMotion, turn]);
  const style = useAnimatedStyle(() => ({
    opacity: visible.value * maxOpacity,
    transform: [{ rotate: `${turn.value * 360}deg` }, { scale: interpolate(visible.value, [0, 1], [0.85, 1]) }],
  }));
  const rays = 14;
  const c = size / 2;
  const wedges = Array.from({ length: rays }, (_, i) => {
    const a = (i / rays) * Math.PI * 2;
    const w = (Math.PI / rays) * 0.42;
    const p1 = `${c + Math.cos(a - w) * c},${c + Math.sin(a - w) * c}`;
    const p2 = `${c + Math.cos(a + w) * c},${c + Math.sin(a + w) * c}`;
    return `${c},${c} ${p1} ${p2}`;
  });
  return (
    <Reanimated.View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="raysFade" cx={c} cy={c} r={c} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#F5D88A" stopOpacity={0.9} />
            <Stop offset="0.55" stopColor="#F5D88A" stopOpacity={0.25} />
            <Stop offset="1" stopColor="#F5D88A" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {wedges.map((pts, i) => <Polygon key={i} points={pts} fill="url(#raysFade)" />)}
      </Svg>
    </Reanimated.View>
  );
}

// ─── Rullande siffra ───────────────────────────────────────────────────────────
/**
 * En siffra som räknar sig fram från `from` till `to`: varje nytt tal glider upp underifrån medan
 * det gamla glider ut uppåt, med `onStep` vid varje steg (för vibration/klick-ljud). Stora hopp
 * räknas i högst 8 steg. `skip` hoppar direkt till slutet. Ett osynligt lager med det bredaste
 * talet håller bredden stilla medan siffrorna byts.
 */
export function RollingNumber({
  from, to, startAt, durationMs = 600, skip, style, align = "center", format = String, onStep,
}: {
  from: number; to: number; startAt: number; durationMs?: number; skip: boolean;
  style: StyleProp<TextStyle>; align?: "left" | "center" | "right";
  format?: (n: number) => string; onStep?: (step: number, steps: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(from);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (skip || from === to) {
      setShown(to);
      return;
    }
    const steps = Math.min(Math.abs(to - from), 8);
    const interval = durationMs / steps;
    for (let i = 1; i <= steps; i++) {
      timers.current.push(setTimeout(() => {
        setShown(Math.round(from + ((to - from) * i) / steps));
        onStepRef.current?.(i, steps);
      }, startAt + interval * (i - 1)));
    }
    return () => timers.current.forEach(clearTimeout);
  }, [from, to, startAt, durationMs, skip]);

  const widest = format(Math.abs(to) > Math.abs(from) ? to : from);
  const textAlign = align;
  return (
    <View>
      <Text style={[style, { opacity: 0 }]}>{widest}</Text>
      <Reanimated.Text
        key={shown}
        entering={reduceMotion || skip ? undefined : FadeInDown.duration(220)}
        exiting={reduceMotion || skip ? undefined : FadeOutUp.duration(200)}
        style={[style, StyleSheet.absoluteFillObject, { textAlign }]}
      >
        {format(shown)}
      </Reanimated.Text>
    </View>
  );
}

/** Ett tal som byts med samma lilla rullning (det nya glider upp underifrån, det gamla ut uppåt)
 * när `value` ändras — för siffror som ska bytas i exakt ett visst ögonblick, t.ex. när en stapel
 * når fram, i stället för efter en egen klocka som RollingNumber. */
export function FlipNumber({ value, style, animate = true }: { value: number | string; style: StyleProp<TextStyle>; animate?: boolean }) {
  const reduceMotion = useReducedMotion();
  const on = animate && !reduceMotion;
  return (
    <View>
      <Text style={[style, { opacity: 0 }]}>{value}</Text>
      <Reanimated.Text
        key={String(value)}
        entering={on ? FadeInDown.duration(220) : undefined}
        exiting={on ? FadeOutUp.duration(200) : undefined}
        style={[style, StyleSheet.absoluteFillObject]}
      >
        {value}
      </Reanimated.Text>
    </View>
  );
}

// ─── Stapel som fylls ──────────────────────────────────────────────────────────
const FILL_TICKS = 24;
const SPARK = 30;

/** Accelererande kurva: stapeln börjar röra sig direkt men tar sats och smäller in i sitt nya
 * läge — samma känsla som hålla-inne-knappen. (Rent kvadratisk stod den nästan still första
 * kvartssekunden, och då kom ingen vibration heller.) */
function easeIn(t: number) {
  "worklet";
  return t * (0.35 + 0.65 * t);
}

// Vibrationen följer stapeln: en tick för varje bit den växer, mjuk → lätt → medel
function rumble(k: number) {
  const f = k / FILL_TICKS;
  const style = f < 0.35 ? Haptics.ImpactFeedbackStyle.Soft : f < 0.7 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium;
  Haptics.impactAsync(style).catch(() => {});
}

/**
 * En stapel som fylls från `from` till `to` (andelar 0–1) med start efter `startAt` ms — och
 * telefonen vibrerar HELA vägen: en tick för varje bit stapeln växer, så takten följer farten
 * (glest i början, tätt mot slutet) samtidigt som styrkan ökar, och sist en tydlig duns när den
 * når fram (`onFull` anropas i samma ögonblick). En glödande gnista löper längst fram medan den
 * fylls. `celebrate` = stapeln klarade en nivå: den blixtrar till och en glans sveper över.
 *
 * Fyllnaden är en guldgradient med FAST bredd (hela stapelns) som skjuts in från vänster inuti
 * ett klipp. Den ändrar aldrig storlek — en SVG i en behållare vars bredd animeras ritas nämligen
 * inte om på alla telefoner (då flyttade sig bara den ljusa pricken medan stapeln stod still).
 */
export function FillBar({
  from, to, startAt, durationMs = 1200, skip, height = 12, celebrate = false, onFull,
}: {
  from: number; to: number; startAt: number; durationMs?: number; skip: boolean;
  height?: number; celebrate?: boolean; onFull?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const gradId = `fill${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [w, setW] = useState(0);
  const run = useSharedValue(0);
  const flash = useSharedValue(0);
  const shine = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onFullRef = useRef(onFull);
  onFullRef.current = onFull;
  const a = Math.max(0, Math.min(1, from));
  const b = Math.max(0, Math.min(1, to));

  const full = () => {
    Haptics.impactAsync(celebrate ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onFullRef.current?.();
  };

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (skip || reduceMotion) {
      run.value = 1;
      flash.value = celebrate ? 0.35 : 0;
      shine.value = 0;
      return;
    }
    timers.current.push(setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      playSound("fill");
    }, startAt));
    run.value = withDelay(startAt, withTiming(1, { duration: durationMs, easing: Easing.linear }, (fin) => {
      if (fin) runOnJS(full)();
    }));
    if (celebrate) {
      flash.value = withDelay(startAt + durationMs, withSequence(withTiming(1, { duration: 90 }), withTiming(0.35, { duration: 650 })));
      shine.value = withDelay(startAt + durationMs + 60, withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }));
    }
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  useAnimatedReaction(
    () => Math.floor(easeIn(run.value) * FILL_TICKS),
    (k, prev) => {
      if (prev !== null && k > prev && k < FILL_TICKS) runOnJS(rumble)(k);
    },
  );

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (a + (b - a) * easeIn(run.value) - 1) * w }],
  }));
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(run.value, [0, 0.04, 0.9, 1], [0, 1, 1, 0]),
    transform: [{ translateX: (a + (b - a) * easeIn(run.value)) * w - SPARK / 2 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shine.value, [0, 0.1, 0.85, 1], [0, 0.85, 0.85, 0]),
    transform: [{ translateX: interpolate(shine.value, [0, 1], [-40, w + 10]) }, { skewX: "-20deg" }],
  }));

  const r = height / 2;
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={[s.barTrack, { height, borderRadius: r }]}>
        {w > 0 && (
          <Reanimated.View style={[s.barFill, { width: w, borderRadius: r }, fillStyle]}>
            <Svg width={w} height={height}>
              <Defs>
                <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#8F6A24" />
                  <Stop offset="0.6" stopColor={GOLD} />
                  <Stop offset="1" stopColor="#FFE9A8" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={w} height={height} fill={`url(#${gradId})`} />
            </Svg>
            <Reanimated.View style={[StyleSheet.absoluteFill, s.barFlash, flashStyle]} />
            <View style={[s.barHead, { width: height, height, borderRadius: r }]} />
          </Reanimated.View>
        )}
        {celebrate && <Reanimated.View style={[s.barShine, shineStyle]} pointerEvents="none" />}
      </View>
      {w > 0 && (
        <Reanimated.View style={[s.spark, { top: (height - SPARK) / 2 }, sparkStyle]} pointerEvents="none">
          <Svg width={SPARK} height={SPARK}>
            <Defs>
              <RadialGradient id={`${gradId}s`} cx={SPARK / 2} cy={SPARK / 2} r={SPARK / 2} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                <Stop offset="0.35" stopColor="#FFE9A8" stopOpacity={0.75} />
                <Stop offset="1" stopColor="#FFE9A8" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={SPARK / 2} cy={SPARK / 2} r={SPARK / 2} fill={`url(#${gradId}s)`} />
          </Svg>
        </Reanimated.View>
      )}
    </View>
  );
}

// ─── Passtämpeln ───────────────────────────────────────────────────────────────
/** Passtämpeln: dubbel ring i guldbläck, Österlenappens logga, BESÖKT och datumet. */
export function PassStamp({ size, date }: { size: number; date: string }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 4} stroke={INK} strokeWidth={4.5} fill="rgba(14,12,8,0.45)" />
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 14} stroke={INK} strokeWidth={1.5} fill="none" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.stampInner]}>
        <Image
          source={require("../../../assets/Osterlenappen-logo.png")}
          style={{ width: size * 0.2, height: size * 0.23, tintColor: INK, marginBottom: 3 }}
          resizeMode="contain"
        />
        <Text style={[s.stampTitle, { fontSize: size * 0.135 }]}>BESÖKT</Text>
        <Text style={[s.stampDate, { fontSize: size * 0.072 }]}>{date}</Text>
      </View>
    </View>
  );
}

// ─── Knappar ───────────────────────────────────────────────────────────────────
/** Huvudknappen i belöningsögonblicken — solid guldgradient, samma tryck-krymper-känsla som resten av appen. */
export function GoldButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const [w, setW] = useState(0);
  return (
    <PressableScale style={[s.goldBtn, style]} scale={0.97} onPress={onPress}>
      <View style={StyleSheet.absoluteFill} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={56}>
            <Defs>
              <LinearGradient id="goldBtn" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#F5D88A" />
                <Stop offset="0.55" stopColor={GOLD} />
                <Stop offset="1" stopColor="#B88E36" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={56} fill="url(#goldBtn)" />
          </Svg>
        )}
      </View>
      <Text style={s.goldBtnText}>{label}</Text>
    </PressableScale>
  );
}

export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale style={s.ghostBtn} scale={0.97} onPress={onPress}>
      <Text style={s.ghostBtnText}>{label}</Text>
    </PressableScale>
  );
}

/** Ett lager som tonar in sitt innehåll underifrån när `show` blir sant (knappar, rubriker). */
export function Reveal({ show, delay = 0, children, style }: { show: boolean; delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (!show) return null;
  return (
    <Reanimated.View entering={FadeInDown.delay(delay).duration(420).easing(Easing.out(Easing.cubic))} style={style}>
      {children}
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  confettiOrigin: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0 },
  piece: { position: "absolute", left: 0, top: 0 },
  barTrack: { overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" },
  barFlash: { backgroundColor: "#FFF4D0" },
  barHead: { position: "absolute", right: 0, top: 0, backgroundColor: "rgba(255,248,225,0.9)" },
  barShine: { position: "absolute", top: -4, bottom: -4, width: 24, backgroundColor: "rgba(255,255,255,0.8)" },
  spark: { position: "absolute", left: 0, width: SPARK, height: SPARK },
  stampInner: { alignItems: "center", justifyContent: "center" },
  stampTitle: { fontFamily: "Montserrat_700Bold", letterSpacing: 3, color: INK },
  stampDate: { fontFamily: "Montserrat_600SemiBold", letterSpacing: 1.2, color: INK, marginTop: 2 },
  goldBtn: {
    height: 56, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center",
  },
  goldBtnText: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#16120A", letterSpacing: 0.2 },
  ghostBtn: {
    height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.16)",
  },
  ghostBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "rgba(245,241,232,0.8)" },
});
