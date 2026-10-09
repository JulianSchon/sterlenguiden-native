/**
 * Byggstenar för belöningsögonblicken: konfetti med tyngdkraft, en roterande strålkrans,
 * siffror som rullar, passtämpeln och guldknappen. Samlade här så alla belöningar i appen
 * (incheckningen nu, presenten och troféerna sen) får samma "saftighet" — samma partiklar, samma
 * rörelser, samma knapp — i stället för att varje ögonblick uppfinner sina egna.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, StyleSheet, Text, View, type TextStyle, type StyleProp, type ViewStyle } from "react-native";
import Reanimated, {
  Easing, FadeInDown, FadeOutUp, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withTiming, type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { PressableScale } from "@/components/PressableScale";

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
