/**
 * Kurvan i statistiken (din egen under Profil och företagets under Mitt företag): en mjuk kurva med
 * fylld yta, den senaste punkten markerad och snittet streckat. Kurvan ritas fram när den visas
 * (Skia). Nudda kurvan: en lodrät linje och en punkt dyker upp under fingret och glider flytande
 * längs kurvan när man drar åt sidan (på animationstråden), och siffrorna överst visar närmaste
 * punkt, med en liten vibration för varje ny punkt. Sidan ska inte scrolla under tiden
 * (onScrubbing). Drar man uppåt eller nedåt scrollar sidan som vanligt. Släpper man visas den
 * senaste punkten igen.
 */
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Reanimated, {
  Easing, Extrapolation, interpolate, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { BlurMask, Canvas, Circle, DashPathEffect, LinearGradient, Path, Skia, vec } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export interface ChartPoint {
  /** Under kurvan ("maj", "12/10") */
  label: string;
  /** Överst när punkten är vald ("Maj", "12 oktober") */
  name: string;
  count: number;
}

/**
 * Mjuk kurva genom punkterna som aldrig skjuter över dem (monoton kubisk interpolation, som
 * d3:s curveMonotoneX) — en vanlig mjuk kurva kunde gå under nollan mellan två punkter och
 * klippas mot kanten.
 */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / dx[i]);
  const tan: number[] = new Array(n);
  tan[0] = slope[0];
  tan[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tan[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  // Begränsa lutningarna så kurvan inte svänger förbi punkterna (Fritsch–Carlson)
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tan[i] = 0; tan[i + 1] = 0; continue; }
    const a = tan[i] / slope[i];
    const b = tan[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tan[i] = t * a * slope[i];
      tan[i + 1] = t * b * slope[i];
    }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${pts[i].x + h} ${pts[i].y + tan[i] * h}, ${pts[i + 1].x - h} ${pts[i + 1].y - tan[i + 1] * h}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

// Kurvans yta: luft runt om så glöden och den valda punkten aldrig klipps mot kanterna
const CHART_H = 150;
const PAD_X = 18;
const PAD_TOP = 22;
const PAD_BOTTOM = 10;
/** Så många punkter längs kurvan som markeringen glider mellan */
const SAMPLES = 160;

export function ScrubChart({
  points, everyLabel = true, latestTitle, valueText, averageTitle, averageText, onScrubbing,
}: {
  points: ChartPoint[];
  /** En etikett under varje punkt (få punkter), annars bara första, mitten och sista */
  everyLabel?: boolean;
  /** Överst när inget är valt ("Den här månaden", "I dag") */
  latestTitle: string;
  valueText: (n: number) => string;
  averageTitle: string;
  averageText: (avg: number) => string;
  onScrubbing: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [w, setW] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const draw = useSharedValue(0);
  const max = Math.max(1, ...points.map((m) => m.count));
  const avg = points.reduce((sum, m) => sum + m.count, 0) / points.length;
  const lastIndex = points.length - 1;

  const geo = useMemo(() => {
    if (w === 0 || points.length < 2) return null;
    const yOf = (v: number) => PAD_TOP + (1 - v / max) * (CHART_H - PAD_TOP - PAD_BOTTOM);
    const step = (w - PAD_X * 2) / (points.length - 1);
    const pts = points.map((m, i) => ({ x: PAD_X + i * step, y: yOf(m.count) }));
    const line = monotonePath(pts);
    const linePath = Skia.Path.MakeFromSVGString(line)!;
    const bottom = CHART_H - PAD_BOTTOM;
    const area = `${line} L ${pts[lastIndex].x} ${bottom} L ${pts[0].x} ${bottom} Z`;
    // Kurvan som täta punkter, så att markeringen kan glida längs den mellan punkterna
    const xs: number[] = [];
    const ys: number[] = [];
    const contour = Skia.ContourMeasureIter(linePath, false, 1).next();
    if (contour) {
      const len = contour.length();
      for (let i = 0; i <= SAMPLES; i++) {
        const [pos] = contour.getPosTan((len * i) / SAMPLES);
        xs.push(pos.x);
        ys.push(pos.y);
      }
    }
    return {
      pts,
      step,
      xs,
      ys,
      line: linePath,
      area: Skia.Path.MakeFromSVGString(area)!,
      avg: Skia.Path.MakeFromSVGString(`M ${PAD_X} ${yOf(avg)} L ${w - PAD_X} ${yOf(avg)}`)!,
    };
  }, [w, points, max, avg, lastIndex]);

  // Ritas fram när bredden är känd, och igen när punkterna byts (en annan period)
  useEffect(() => {
    if (!geo) return;
    draw.value = 0;
    draw.value = withDelay(250, withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, points]);
  const areaOpacity = useDerivedValue(() => draw.value * 0.9);
  // Pricken (och glöden) växer fram i samma rörelse som kurvans sista bit, i stället för att
  // dyka upp på en gång när den är klar
  const dotR = useDerivedValue(() => interpolate(draw.value, [0.82, 1], [0, 6], Extrapolation.CLAMP));
  const glowR = useDerivedValue(() => interpolate(draw.value, [0.88, 1], [0, 13], Extrapolation.CLAMP));
  const glowOpacity = useDerivedValue(() => interpolate(draw.value, [0.88, 1], [0, 1], Extrapolation.CLAMP));

  // Hålla in och dra
  const select = (i: number | null) => {
    if (i !== null) Haptics.selectionAsync().catch(() => {});
    setSelected(i);
  };
  const lastPicked = useSharedValue(-1);
  const step = geo?.step ?? 1;
  const count = points.length;
  // Markeringen (lodrät linje + punkt) följer fingret flytande längs kurvan
  const xs = geo?.xs ?? [];
  const ys = geo?.ys ?? [];
  const markX = useSharedValue(0);
  const markY = useSharedValue(0);
  const markOn = useSharedValue(0);
  const moveMark = (fingerX: number) => {
    "worklet";
    if (xs.length === 0) return;
    const x = Math.min(xs[xs.length - 1], Math.max(xs[0], fingerX));
    // Närmaste punkterna på kurvan till vänster och höger om fingret (x växer längs kurvan)
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    const t = xs[hi] === xs[lo] ? 0 : (x - xs[lo]) / (xs[hi] - xs[lo]);
    markX.value = x;
    markY.value = ys[lo] + (ys[hi] - ys[lo]) * t;
  };
  const scrub = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-14, 14])
    // Redan vid beröringen, innan fingret rört sig
    .onBegin((e) => {
      moveMark(e.x);
      markOn.value = withTiming(1, { duration: 90 });
      const i = Math.min(count - 1, Math.max(0, Math.round((e.x - PAD_X) / step)));
      lastPicked.value = i;
      runOnJS(select)(i);
    })
    .onStart(() => {
      runOnJS(onScrubbing)(true);
    })
    .onUpdate((e) => {
      moveMark(e.x);
      const i = Math.min(count - 1, Math.max(0, Math.round((e.x - PAD_X) / step)));
      if (i !== lastPicked.value) {
        lastPicked.value = i;
        runOnJS(select)(i);
      }
    })
    .onFinalize(() => {
      markOn.value = withTiming(0, { duration: 160 });
      lastPicked.value = -1;
      runOnJS(select)(null);
      runOnJS(onScrubbing)(false);
    });

  const shown = selected ?? lastIndex;
  const guideStyle = useAnimatedStyle(() => ({ opacity: markOn.value, transform: [{ translateX: markX.value - 0.75 }] }));
  const pickStyle = useAnimatedStyle(() => ({
    opacity: markOn.value,
    transform: [{ translateX: markX.value - 8 }, { translateY: markY.value - 8 }, { scale: 0.6 + markOn.value * 0.4 }],
  }));
  // Med många punkter: första, mitten och sista — och medan man drar bara den valda, så de aldrig krockar
  const labelled = (i: number) => everyLabel
    || (selected !== null ? i === selected : i === 0 || i === lastIndex || i === Math.floor(lastIndex / 2));

  if (points.length < 2) return null;
  return (
    <View>
      <View style={s.head}>
        <View>
          <Text style={s.legendLabel}>
            <Text style={{ color: colors.goldText }}>●</Text> {selected === null ? latestTitle : points[selected].name}
          </Text>
          <Text style={s.legendValue}>{valueText(points[shown].count)}</Text>
        </View>
        <View>
          <Text style={s.legendLabel}><Text style={{ color: colors.muted }}>●</Text> {averageTitle}</Text>
          <Text style={[s.legendValue, { color: colors.muted }]}>{averageText(avg)}</Text>
        </View>
      </View>

      <GestureDetector gesture={scrub}>
        <View style={{ height: CHART_H }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
          {geo && (
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Path path={geo.area} opacity={areaOpacity}>
                <LinearGradient start={vec(0, 0)} end={vec(0, CHART_H)} colors={[colors.goldBorder, "rgba(197,160,89,0)"]} />
              </Path>
              <Path path={geo.avg} style="stroke" strokeWidth={1.5} color={colors.faint}>
                <DashPathEffect intervals={[5, 6]} />
              </Path>
              <Path path={geo.line} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" color={colors.goldText} start={0} end={draw} />
              {/* Den senaste punkten: en lysande prick i slutet av kurvan */}
              <Circle cx={geo.pts[lastIndex].x} cy={geo.pts[lastIndex].y} r={glowR} color="rgba(232,198,116,0.45)" opacity={glowOpacity}>
                <BlurMask blur={5} style="normal" />
              </Circle>
              <Circle cx={geo.pts[lastIndex].x} cy={geo.pts[lastIndex].y} r={dotR} color={colors.goldText} />
            </Canvas>
          )}
          {/* Markeringen medan man nuddar: lodrät linje och en punkt som glider längs kurvan */}
          <Reanimated.View pointerEvents="none" style={[s.guide, guideStyle]} />
          <Reanimated.View pointerEvents="none" style={[s.pick, pickStyle]} />
        </View>
      </GestureDetector>

      {/* Etiketterna, var och en mitt under sin punkt */}
      <View style={s.labelRow}>
        {geo && points.map((m, i) => (labelled(i) ? (
          <Text key={i} style={[s.label, { left: geo.pts[i].x - 24 }, i === shown && { color: colors.text, fontFamily: "Inter_700Bold" }]}>
            {m.label}
          </Text>
        ) : null))}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  head: { flexDirection: "row", gap: 28, marginBottom: 8 },
  legendLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.muted },
  legendValue: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: c.text, marginTop: 2 },
  guide: { position: "absolute", left: 0, top: PAD_TOP - 10, bottom: PAD_BOTTOM, width: 1.5, backgroundColor: c.faint },
  pick: {
    position: "absolute", left: 0, top: 0, width: 16, height: 16, borderRadius: 8,
    backgroundColor: c.goldText, borderWidth: 3, borderColor: c.card,
  },
  labelRow: { height: 18, marginTop: 4 },
  label: { position: "absolute", width: 48, textAlign: "center", fontFamily: "Inter_500Medium", fontSize: 12, color: c.muted, textTransform: "lowercase" },
});
