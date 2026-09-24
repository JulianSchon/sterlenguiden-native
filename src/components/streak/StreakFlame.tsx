/**
 * Den levande elden på streak-sidan. Ritad helt i Skia utan bilder.
 *
 * Lågan är en enda sammanhängande kontur (som en eld-emoji) med tre spetsar och
 * två skåror. Kontrollpunkterna svajar på egna, långsamma sinusvågor, så
 * spetsarna lutar, växer och sjunker i en evig loop utan bildrutor. Inuti ligger
 * ett ljusare eko av samma form och en blekgul låga, ovanpå kommer små flamdroppar
 * som lossnar och stiger samt gnistor med mjuk gloria. Lugn takt — det här är en
 * avkopplande app.
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
};

// Yttre kropp + ett mindre, ljusare eko av samma form inuti
const BODIES: Body[] = [
  { sx: 0.86, sy: 1, speed: 0.6, phase: 0, colors: ["#F2452F", "#F97A22", "#FF9A1F"] },
  { sx: 0.6, sy: 0.62, speed: 0.8, phase: 2.2, colors: ["#FF9A21", "#FFC24A"] },
];

type Inner = { width: number; height: number; lift: number; phase: number; speed: number; sway: number; colors: [string, string] };

// Den ljusa lågan i mitten, lyft en bit över botten
const INNERS: Inner[] = [
  { width: 38, height: 125, lift: 16, phase: 5.2, speed: 1.05, sway: 8, colors: ["#FFE082", "#FFF3C0"] },
  { width: 21, height: 72,  lift: 22, phase: 0.7, speed: 1.25, sway: 4, colors: ["#FFF4C4", "#FFFBEA"] },
];

const DROPLETS = 4;
const EMBERS = 16;

function BodyLayer({ t, body }: { t: SharedValue<number>; body: Body }) {
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    silhouette(p, (t.value / 1000) * body.speed + body.phase, body.sx, body.sy);
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

function InnerFlame({ t, inner }: { t: SharedValue<number>; inner: Inner }) {
  const { width, height, lift, phase, speed, sway } = inner;
  const path = useDerivedValue(() => {
    const a = (t.value / 1000) * speed + phase;
    const h = height * (1 + 0.1 * Math.sin(a * 1.6 + 1) + 0.04 * Math.sin(a * 2.7));
    const tipX = CX + Math.sin(a) * sway + Math.sin(a * 2.3) * sway * 0.35;
    const lean = Math.sin(a - 0.6) * sway * 0.7;
    const p = Skia.Path.Make();
    teardrop(p, CX, BASE - lift, width * (1 + 0.07 * Math.sin(a * 1.3 + 2)), h, tipX, lean);
    return p;
  });
  return (
    <Path path={path}>
      <LinearGradient start={vec(CX, BASE - lift - height)} end={vec(CX, BASE - lift)} colors={inner.colors} />
    </Path>
  );
}

/** Liten låga som lossnar från elden, stiger, krymper och slocknar. */
function Droplet({ t, index }: { t: SharedValue<number>; index: number }) {
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
  const opacity = useDerivedValue(() => Math.min(1, life.value * 6) * Math.min(1, (1 - life.value) * 2));
  return <Path path={path} color="#FF9F45" opacity={opacity} />;
}

/** Gnista med mjuk gloria som stiger, glider i sidled och tonar ut. */
function Ember({ t, index }: { t: SharedValue<number>; index: number }) {
  const life = useDerivedValue(() => ((t.value / 1000) * (0.08 + (index % 4) * 0.025) + index / EMBERS) % 1);
  const cx = useDerivedValue(
    () => CX + (index % 2 ? 1 : -1) * (10 + (index * 37) % 46) * (0.4 + life.value) + Math.sin(life.value * 6 + index * 2) * 16
  );
  const cy = useDerivedValue(() => BASE - 60 - life.value * 240);
  const r = useDerivedValue(() => (1.6 + (index % 3) * 1.1) * (1 - life.value * 0.6));
  const haloR = useDerivedValue(() => r.value * 3);
  const opacity = useDerivedValue(
    () => Math.min(1, (1 - life.value) * 1.8) * (0.75 + 0.25 * Math.sin(t.value / 300 + index * 3))
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

const VIEW_FULL = { x: 0, y: TOP_CROP, w: W, h: H };
const VIEW_COMPACT = { x: 40, y: 58, w: 220, h: 296 };

type StreakFlameProps = {
  /** Bredd i pixlar; höjden följer av formen */
  size?: number;
  /** Liten variant utan gnistor och flamdroppar, beskuren tätt runt lågan */
  compact?: boolean;
  /** Förskjuter animationen (ms) så flera lågor bredvid varandra inte rör sig i takt */
  timeOffset?: number;
};

export function StreakFlame({ size = 215, compact = false, timeOffset = 0 }: StreakFlameProps) {
  const clock = useClock();
  const t = useDerivedValue(() => clock.value + timeOffset);
  const view = compact ? VIEW_COMPACT : VIEW_FULL;
  const scale = size / view.w;

  return (
    <Canvas style={{ width: size, height: view.h * scale }} pointerEvents="none">
      <Group transform={[{ scale }, { translateX: -view.x }, { translateY: -view.y }]}>
        {BODIES.map((b, i) => (
          <BodyLayer key={i} t={t} body={b} />
        ))}
        {INNERS.map((n, i) => (
          <InnerFlame key={i} t={t} inner={n} />
        ))}
        {!compact && Array.from({ length: DROPLETS }, (_, i) => (
          <Droplet key={i} t={t} index={i} />
        ))}
        {!compact && Array.from({ length: EMBERS }, (_, i) => (
          <Ember key={i} t={t} index={i} />
        ))}
      </Group>
    </Canvas>
  );
}
