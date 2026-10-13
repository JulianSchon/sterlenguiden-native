/**
 * Den levande elden på streak-sidan. Ritad helt i Skia utan bilder.
 *
 * Lågan är en enda sammanhängande kontur (som en eld-emoji) med tre spetsar och
 * två skåror. Kontrollpunkterna svajar på egna, långsamma sinusvågor, så
 * spetsarna lutar, växer och sjunker i en evig loop utan bildrutor. Inuti ligger
 * ett ljusare eko av samma form och en blekgul låga, ovanpå kommer små flamdroppar
 * som lossnar och stiger samt gnistor med mjuk gloria. Lugn takt — det här är en
 * avkopplande app.
 *
 * Med `ignite` tänds elden: en liten blå gaslåga vid foten, sen swooshar lågan upp nerifrån,
 * lite för högt först, och sätter sig. Den ljusa kärnan kommer strax efter, gnistorna sist.
 */
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import {
  Canvas, Path, Circle, Group, Skia, LinearGradient, BlurMask, useClock, vec,
  type SkPath,
} from "@shopify/react-native-skia";

// Ritytan är 300 × 332 enheter. Den stora elden visar hela ytan; den kompakta
// (veckoraden, milstolpar) beskärs tätt runt själva lågan.
const W = 300;
const H = 332;
const CX = 150;
const BASE = 350;
// Övre delen av ritytan är tom sedan lågan sänktes — den beskärs bort
const TOP_CROP = 48;

/**
 * Lågans yttre kontur som EN sammanhängande form (som en eld-emoji): rund botten,
 * tre spetsar — en hög i mitten och två små på sidorna — med en skåra mellan.
 * Bara spetsar och skåror rör sig, så formen hänger ihop och känns som en låga.
 * `sx`/`sy` skalar formen mot foten, för de inre lagren.
 */
function silhouette(p: SkPath, a: number, sx: number, sy: number) {
  "worklet";
  const X = (x: number) => CX + (x - CX) * sx;
  const Y = (y: number) => BASE - (BASE - y) * sy;
  const mtx = 154 + Math.sin(a) * 10 + Math.sin(a * 2.3) * 4 + Math.sin(a * 5.7) * 1.5;
  const mty = 78 + Math.sin(a * 1.6 + 1) * 12 + Math.sin(a * 4.9) * 2;
  const ltx = 68 + Math.sin(a * 0.9 + 2) * 5;
  const lty = 184 + Math.sin(a * 1.3 + 2) * 10 + Math.sin(a * 6.1) * 2;
  const rtx = 236 + Math.sin(a * 1.1 + 4) * 5;
  const rty = 190 + Math.sin(a * 1.5 + 4) * 10 + Math.sin(a * 5.3 + 1) * 2;
  const lny = 238 + Math.sin(a * 1.2 + 1) * 6;
  const rny = 226 + Math.sin(a * 1.4 + 3) * 6;
  p.moveTo(X(150), Y(350));
  p.cubicTo(X(90), Y(350), X(48), Y(320), X(48), Y(262));
  p.cubicTo(X(48), Y(228), X(56), Y(204), X(ltx), Y(lty));
  p.cubicTo(X(ltx + 18), Y(lty + 30), X(92), Y(lny - 22), X(100), Y(lny));
  p.cubicTo(X(96), Y(190), X(mtx - 24), Y(mty + 85), X(mtx), Y(mty));
  p.cubicTo(X(mtx + 20), Y(mty + 45), X(216), Y(150), X(204), Y(rny));
  p.cubicTo(X(212), Y(rny - 12), X(rtx - 6), Y(rty + 30), X(rtx), Y(rty));
  p.cubicTo(X(rtx + 12), Y(rty + 28), X(252), Y(232), X(252), Y(262));
  p.cubicTo(X(252), Y(320), X(210), Y(350), X(150), Y(350));
  p.close();
}

/** Hur långt ett lager kommit i tändningen (0–1), inom sitt eget fönster [from, to] av den */
export function stage(p: number, from: number, to: number) {
  "worklet";
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

/** Skjuter förbi målet (~13 %) och sätter sig — lågan swooshar upp lite för högt först */
function overshoot(q: number) {
  "worklet";
  const c = 2.0;
  const x = q - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

function easeOut(q: number) {
  "worklet";
  return 1 - (1 - q) * (1 - q) * (1 - q);
}

/** Liten droppformad låga (inre ljus låga, flamdroppar): rund botten, böjd spets. */
function teardrop(p: SkPath, cx: number, base: number, w: number, h: number, tipX: number, lean: number) {
  "worklet";
  const tipY = base - h;
  const rb = Math.min(w, h * 0.4);
  p.moveTo(cx, base);
  p.cubicTo(cx - w * 0.55, base, cx - w * 1.02, base - rb * 0.45, cx - w * 1.02, base - rb);
  p.cubicTo(cx - w * 0.95 + lean * 0.4, base - h * 0.52, tipX - w * 0.12, tipY + h * 0.22, tipX, tipY);
  p.cubicTo(tipX + w * 0.4 + lean * 0.2, tipY + h * 0.26, cx + w * 1.0 + lean * 0.5, base - h * 0.5, cx + w * 1.02, base - rb);
  p.cubicTo(cx + w * 1.02, base - rb * 0.45, cx + w * 0.55, base, cx, base);
  p.close();
}

type Body = {
  sx: number;
  sy: number;
  speed: number;
  phase: number;
  /** Färger uppifrån och ned — eld är rödast i toppen och hetast nedtill */
  colors: string[];
  /** När lagret swooshar upp under tändningen (del av tändningen, 0–1) */
  rise: [number, number];
};

// Yttre kropp + ett mindre, ljusare eko av samma form inuti
const BODIES: Body[] = [
  { sx: 0.86, sy: 1, speed: 0.6, phase: 0, colors: ["#F2452F", "#F97A22", "#FF9A1F"], rise: [0.14, 0.6] },
  { sx: 0.6, sy: 0.62, speed: 0.8, phase: 2.2, colors: ["#FF9A21", "#FFC24A"], rise: [0.2, 0.66] },
];

type Inner = {
  width: number; height: number; lift: number; phase: number; speed: number; sway: number; colors: [string, string];
  rise: [number, number];
};

// Den ljusa lågan i mitten, lyft en bit över botten
const INNERS: Inner[] = [
  { width: 38, height: 125, lift: 16, phase: 5.2, speed: 1.05, sway: 8, colors: ["#FFE082", "#FFF3C0"], rise: [0.28, 0.74] },
  { width: 21, height: 72,  lift: 22, phase: 0.7, speed: 1.25, sway: 4, colors: ["#FFF4C4", "#FFFBEA"], rise: [0.33, 0.8] },
];

const DROPLETS = 4;
const EMBERS = 16;

type Ignite = SharedValue<number> | undefined;

function BodyLayer({ t, body, ignite }: { t: SharedValue<number>; body: Body; ignite: Ignite }) {
  const path = useDerivedValue(() => {
    const g = ignite ? ignite.value : 1;
    const [from, to] = body.rise;
    const gy = overshoot(stage(g, from, to));
    const gx = 0.4 + 0.6 * easeOut(stage(g, from, to + 0.12));
    const p = Skia.Path.Make();
    silhouette(p, (t.value / 1000) * body.speed + body.phase, body.sx * gx, body.sy * gy);
    return p;
  });
  return (
    <Path path={path}>
      <LinearGradient
        start={vec(CX, BASE - (BASE - 78) * body.sy)}
        end={vec(CX, BASE)}
        colors={body.colors}
      />
    </Path>
  );
}

function InnerFlame({ t, inner, ignite }: { t: SharedValue<number>; inner: Inner; ignite: Ignite }) {
  const { width, height, lift, phase, speed, sway } = inner;
  const path = useDerivedValue(() => {
    const g = ignite ? ignite.value : 1;
    const q = stage(g, inner.rise[0], inner.rise[1]);
    const a = (t.value / 1000) * speed + phase;
    const h = height * overshoot(q) * (1 + 0.1 * Math.sin(a * 1.6 + 1) + 0.04 * Math.sin(a * 2.7));
    const tipX = CX + Math.sin(a) * sway + Math.sin(a * 2.3) * sway * 0.35;
    const lean = Math.sin(a - 0.6) * sway * 0.7;
    const p = Skia.Path.Make();
    teardrop(p, CX, BASE - lift, width * (0.5 + 0.5 * easeOut(q)) * (1 + 0.07 * Math.sin(a * 1.3 + 2)), h, tipX, lean);
    return p;
  });
  return (
    <Path path={path}>
      <LinearGradient start={vec(CX, BASE - lift - height)} end={vec(CX, BASE - lift)} colors={inner.colors} />
    </Path>
  );
}

/** Liten låga som lossnar från elden, stiger, krymper och slocknar. */
function Droplet({ t, index, ignite }: { t: SharedValue<number>; index: number; ignite: Ignite }) {
  const life = useDerivedValue(() => ((t.value / 1000) * 0.11 + index / DROPLETS) % 1);
  const path = useDerivedValue(() => {
    const l = life.value;
    const side = index % 2 ? 1 : -1;
    const cx = CX + side * (10 + index * 8) * (0.5 + l) + Math.sin(l * 6 + index * 2) * 10;
    const base = BASE - 150 - l * 140;
    const size = 1 - l * 0.75;
    const p = Skia.Path.Make();
    teardrop(p, cx, base, 9 * size, 44 * size, cx + side * 3, side * 4);
    return p;
  });
  const opacity = useDerivedValue(
    () => Math.min(1, life.value * 6) * Math.min(1, (1 - life.value) * 2) * (ignite ? stage(ignite.value, 0.5, 0.9) : 1)
  );
  return <Path path={path} color="#FF9F45" opacity={opacity} />;
}

/** Gnista med mjuk gloria som stiger, glider i sidled och tonar ut. */
function Ember({ t, index, ignite }: { t: SharedValue<number>; index: number; ignite: Ignite }) {
  const life = useDerivedValue(() => ((t.value / 1000) * (0.08 + (index % 4) * 0.025) + index / EMBERS) % 1);
  const cx = useDerivedValue(
    () => CX + (index % 2 ? 1 : -1) * (10 + (index * 37) % 46) * (0.4 + life.value) + Math.sin(life.value * 6 + index * 2) * 16
  );
  const cy = useDerivedValue(() => BASE - 60 - life.value * 240);
  const r = useDerivedValue(() => (1.6 + (index % 3) * 1.1) * (1 - life.value * 0.6));
  const haloR = useDerivedValue(() => r.value * 3);
  const opacity = useDerivedValue(
    () => Math.min(1, (1 - life.value) * 1.8) * (0.75 + 0.25 * Math.sin(t.value / 300 + index * 3))
      * (ignite ? stage(ignite.value, 0.5, 0.9) : 1)
  );
  const haloOpacity = useDerivedValue(() => opacity.value * 0.45);
  const color = index % 3 ? "#FFD98A" : "#FF9A4A";
  return (
    <>
      <Circle cx={cx} cy={cy} r={haloR} color={color} opacity={haloOpacity}>
        <BlurMask blur={3} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={r} color={color} opacity={opacity} />
    </>
  );
}

/**
 * Den blå gaslågan vid foten som tänder elden: tänds direkt, växer lite, och tonar bort medan
 * den orange lågan swooshar upp över den.
 */
function GasFlame({ ignite }: { ignite: SharedValue<number> }) {
  const path = useDerivedValue(() => {
    const g = ignite.value;
    const grow = easeOut(stage(g, 0, 0.14));
    const p = Skia.Path.Make();
    teardrop(p, CX, BASE - 8, 14 + 10 * grow, 26 + 50 * grow, CX + Math.sin(g * 80) * 2, 0);
    return p;
  });
  const opacity = useDerivedValue(() => stage(ignite.value, 0, 0.03) * (1 - stage(ignite.value, 0.22, 0.42)));
  return (
    <Group opacity={opacity}>
      <Path path={path}>
        <LinearGradient start={vec(CX, BASE - 84)} end={vec(CX, BASE - 8)} colors={["#BFE3FF", "#4A8BFF", "#2557F0"]} />
        <BlurMask blur={5} style="solid" />
      </Path>
    </Group>
  );
}

const VIEW_FULL = { x: 0, y: TOP_CROP, w: W, h: H };
// Lågans botten ligger fast vid y=350 (BASE) — 296 gav bara ~4 enheter marginal ner till kant 354,
// vilket i småformat (kompakta lågor ner mot ~15px bredd) blir under en bildpunkt: avrundningen av
// canvasens pixelhöjd kunde då nypa av lågans understa, antialiserade kant. Mer marginal (20 enheter
// till) håller kanten ordentligt innanför duken oavsett storlek, utan att flytta eller skala lågan.
const VIEW_COMPACT = { x: 40, y: 58, w: 220, h: 316 };
// Under tändningen skjuter lågan upp lite för högt (se overshoot) — ritytan växer så här mycket
// uppåt så toppen inte klipps, utan att lågan flyttar sig på sidan (negativ marginal tar ut den)
const IGNITE_HEADROOM = 30;

type StreakFlameProps = {
  /** Bredd i pixlar; höjden följer av formen */
  size?: number;
  /** Liten variant utan gnistor och flamdroppar, beskuren tätt runt lågan */
  compact?: boolean;
  /** Förskjuter animationen (ms) så flera lågor bredvid varandra inte rör sig i takt */
  timeOffset?: number;
  /** Tändningen, 0 = släckt → 1 = brinner (linjärt i tid, se stage). Utelämnad = brinner redan */
  ignite?: SharedValue<number>;
};

export function StreakFlame({ size = 215, compact = false, timeOffset = 0, ignite }: StreakFlameProps) {
  const clock = useClock();
  const t = useDerivedValue(() => clock.value + timeOffset);
  const view = compact ? VIEW_COMPACT : VIEW_FULL;
  const scale = size / view.w;
  const head = ignite && !compact ? IGNITE_HEADROOM : 0;

  return (
    <Canvas style={{ width: size, height: (view.h + head) * scale, marginTop: -head * scale }} pointerEvents="none">
      <Group transform={[{ scale }, { translateX: -view.x }, { translateY: -view.y + head }]}>
        {ignite && <GasFlame ignite={ignite} />}
        {BODIES.map((b, i) => (
          <BodyLayer key={i} t={t} body={b} ignite={ignite} />
        ))}
        {INNERS.map((n, i) => (
          <InnerFlame key={i} t={t} inner={n} ignite={ignite} />
        ))}
        {!compact && Array.from({ length: DROPLETS }, (_, i) => (
          <Droplet key={i} t={t} index={i} ignite={ignite} />
        ))}
        {!compact && Array.from({ length: EMBERS }, (_, i) => (
          <Ember key={i} t={t} index={i} ignite={ignite} />
        ))}
      </Group>
    </Canvas>
  );
}
