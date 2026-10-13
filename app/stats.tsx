/**
 * Statistik — vad man upptäckt på Österlen. Samma mörka stil som Mitt Österlen och Historik:
 * header med rubriken i versaler, innehållet direkt mot bakgrunden och solida kort.
 *
 *  1. Hur mycket av Österlen man upptäckt: stort tal, en stapel och andel i procent.
 *  2. Sex rutor, var och en med appens egen symbol i färg: besök (kartans gröna nål), favoriter
 *     (det röda hjärtat), minnen (ett litet polaroidkort), skatter (skatternas lila nål med guld-
 *     stjärna), utmaningar (Österlenlegendens guldtrofé) och längsta streak (den riktiga elden).
 *  3. Besök per månad (sex månader): en mjuk kurva med fylld yta under, den här månaden markerad
 *     och en streckad linje för snittet. Kurvan ritas fram när sidan öppnas (Skia). Nudda kurvan
 *     och dra åt sidan för att se varje månads besök.
 *  4. Dina dagar: besök per veckodag som staplar, den vanligaste dagen i guld.
 *  5. Kategorierna: alla åtta i sina egna färger, hur många man besökt av hur många som finns.
 *  6. Mest besökta platsen.
 *
 * Siffrorna kommer från samma källor som resten av appen (besök räknas som unika platser i
 * Utmaningar och topplistorna; här visas även alla besök).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, type LayoutChangeEvent } from "react-native";
import Reanimated, {
  Easing, Extrapolation, interpolate, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas, Circle, DashPathEffect, LinearGradient, Path, Skia, vec, BlurMask } from "@shopify/react-native-skia";
import Svg, { Path as SvgPath, Polygon, Rect, Circle as SvgCircle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Heart } from "lucide-react-native";
import { format, subMonths } from "date-fns";
import { sv } from "date-fns/locale";
import { useVisits } from "@/hooks/useVisits";
import { usePlaces, firstImageUrl } from "@/hooks/usePlaces";
import { useFavorites } from "@/hooks/useFavorites";
import { useTrophies } from "@/hooks/useTrophies";
import { useMemories } from "@/hooks/useMemories";
import { useCollected, useCollectibles } from "@/hooks/useCollectibles";
import { useAppDays } from "@/hooks/useAppDays";
import { computeStreak } from "@/lib/streak";
import { computeCategoryStats, type CategoryStat } from "@/lib/categories";
import { pushOnce } from "@/lib/navigateOnce";
import { POLAROID_PAPER, POLAROID_TAPE } from "@/lib/polaroid";
import { StreakFlame } from "@/components/streak/StreakFlame";
import { PlacePin } from "@/components/PlacePin";

// Österlenlegendens guldtrofé — den man får för att klara allt
const TROPHY_ART = require("../assets/badges/osterlenlegend-gold.png");

const BG     = "#121212";
const CARD   = "#1A1A1D";
const FG     = "#F5F1E8";
const MUTED  = "rgba(245,241,232,0.55)";
const GOLD   = "#C5A059";
const GOLD_LT = "#E8C674";
const BORDER = "rgba(255,255,255,0.08)";
const TRACK  = "rgba(255,255,255,0.08)";
// Samma röda som hjärtat på Favoriter
const HEART_RED = "#EF4444";

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const WEEKDAY_NAMES = ["måndagar", "tisdagar", "onsdagar", "torsdagar", "fredagar", "lördagar", "söndagar"];

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

interface MonthPoint { label: string; name: string; count: number }

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: visits = [], isLoading: visitsLoading } = useVisits();
  const { data: places = [], isLoading: placesLoading } = usePlaces();
  const { data: favorites = [] } = useFavorites();
  const { trophies } = useTrophies();
  const { data: memories = [] } = useMemories();
  const { data: collected } = useCollected();
  const { data: collectibles = [] } = useCollectibles();
  const { data: days = [] } = useAppDays();
  const isLoading = visitsLoading || placesLoading;
  // Medan man håller in på kurvan ska sidan inte scrolla
  const [scrubbing, setScrubbing] = useState(false);

  const stats = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, p]));
    const valid = visits.filter((v) => byId.has(v.place_id));
    const unique = [...new Set(valid.map((v) => v.place_id))];

    // Besök per månad, de senaste sex (äldst först)
    const now = new Date();
    const months: MonthPoint[] = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(now.getFullYear(), now.getMonth(), 1), 5 - i);
      const count = valid.filter((v) => {
        const vd = new Date(v.visited_at);
        return vd.getFullYear() === d.getFullYear() && vd.getMonth() === d.getMonth();
      }).length;
      return {
        label: format(d, "MMM", { locale: sv }).replace(".", ""),
        name: capitalize(format(d, "LLLL", { locale: sv })),
        count,
      };
    });

    // Besök per veckodag (måndag först)
    const weekdays = [0, 0, 0, 0, 0, 0, 0];
    valid.forEach((v) => { weekdays[(new Date(v.visited_at).getDay() + 6) % 7] += 1; });

    // Mest besökta platsen
    const perPlace = new Map<number, number>();
    valid.forEach((v) => perPlace.set(v.place_id, (perPlace.get(v.place_id) ?? 0) + 1));
    let top: { id: number; count: number } | null = null;
    for (const [id, count] of perPlace) if (!top || count > top.count) top = { id, count };

    return {
      visitCount: valid.length,
      uniqueCount: unique.length,
      months,
      weekdays,
      categories: computeCategoryStats(places, unique),
      topPlace: top ? { place: byId.get(top.id)!, count: top.count } : null,
    };
  }, [visits, places]);

  const percent = places.length > 0 ? Math.round((stats.uniqueCount / places.length) * 100) : 0;
  const trophiesDone = trophies.filter((t) => t.done).length;
  const longestStreak = useMemo(() => computeStreak(days).longest, [days]);
  const treasures = collected?.size ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>STATISTIK</Text>
        </View>
      </View>

      {isLoading ? (
        <Text style={[s.muted, { textAlign: "center", marginTop: 40 }]}>Laddar statistik…</Text>
      ) : (
        <ScrollView
          scrollEnabled={!scrubbing}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 40 }]}
        >
          {/* 1. Hur mycket av Österlen */}
          <View style={s.hero}>
            <Text style={s.eyebrow}>UPPTÄCKT AV ÖSTERLEN</Text>
            <View style={s.heroRow}>
              <Text style={s.heroValue}>{stats.uniqueCount}</Text>
              <Text style={s.heroOf}>av {places.length} platser</Text>
            </View>
            <Bar fraction={places.length > 0 ? stats.uniqueCount / places.length : 0} color={GOLD} height={10} delay={150} />
            <Text style={s.heroPercent}>{percent} % av Österlen</Text>
          </View>

          {/* 2. Rutorna */}
          <View style={s.tiles}>
            <Tile icon={<PlacePin height={25} />} value={stats.visitCount} label="Besök" />
            <Tile icon={<Heart size={21} color={HEART_RED} fill={HEART_RED} strokeWidth={2} />} value={favorites.length} label="Favoriter" />
            <Tile icon={<MiniPolaroid />} value={memories.length} label="Minnen" />
            <Tile icon={<TreasurePin />} value={`${treasures}/${collectibles.length || 24}`} label="Skatter" />
            <Tile icon={<Image source={TROPHY_ART} style={{ width: 27, height: 27 }} resizeMode="contain" />} value={`${trophiesDone}/${trophies.length}`} label="Utmaningar" />
            <Tile icon={<View style={{ marginTop: -4 }}><StreakFlame compact size={22} /></View>} value={longestStreak} label="Längsta streak" />
          </View>

          {/* 3. Besök per månad */}
          <Text style={s.sectionTitle}>Besök per månad</Text>
          <View style={s.card}>
            <MonthChart months={stats.months} onScrubbing={setScrubbing} />
          </View>

          {/* 4. Dina dagar */}
          {stats.visitCount > 0 && (
            <>
              <Text style={s.sectionTitle}>Dina dagar</Text>
              <View style={s.card}>
                <WeekdayBars counts={stats.weekdays} />
              </View>
            </>
          )}

          {/* 5. Kategorierna */}
          <Text style={s.sectionTitle}>Kategorier</Text>
          <View style={[s.card, { gap: 16 }]}>
            {stats.categories.map((c, i) => <CategoryRow key={c.id} cat={c} delay={200 + i * 60} />)}
          </View>

          {/* 6. Mest besökta platsen */}
          {stats.topPlace && (
            <>
              <Text style={s.sectionTitle}>Mest besökta platsen</Text>
              <TouchableOpacity style={[s.card, s.topPlace]} activeOpacity={0.8} onPress={() => pushOnce(router, `/place/${stats.topPlace!.place.id}`)}>
                <View style={s.topThumb}>
                  {firstImageUrl(stats.topPlace.place.image_url)
                    ? <Image source={{ uri: firstImageUrl(stats.topPlace.place.image_url)! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.topName} numberOfLines={2}>{stats.topPlace.place.name}</Text>
                  <Text style={s.topCount}>
                    {stats.topPlace.count === 1 ? "Besökt 1 gång" : `Besökt ${stats.topPlace.count} gånger`}
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** En ruta: symbol, stort värde, etikett */
function Tile({ icon, value, label }: { icon: ReactNode; value: number | string; label: string }) {
  return (
    <View style={s.tile}>
      <View style={s.tileIcon}>{icon}</View>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Ett litet polaroidkort, lite snett, med tejp — samma papper som minnenas polaroider */
function MiniPolaroid() {
  return (
    <Svg width={24} height={26} viewBox="0 0 24 26">
      <Rect x={3} y={3} width={18} height={21} rx={1.5} fill={POLAROID_PAPER} transform="rotate(-7 12 13)" />
      <Rect x={5.2} y={5.4} width={13.6} height={12} fill="#7FA7C9" transform="rotate(-7 12 13)" />
      <SvgPath d="M5.2 14.2 L9.5 10.6 L13 13.6 L15.6 11.6 L18.8 14.2 L18.8 17.4 L5.2 17.4 Z" fill="#4F7A52" transform="rotate(-7 12 13)" />
      <SvgCircle cx={15.6} cy={8.4} r={1.4} fill="#F6E7A8" transform="rotate(-7 12 13)" />
      <Rect x={8.5} y={1} width={7} height={3.6} fill={POLAROID_TAPE} transform="rotate(-7 12 13)" />
    </Svg>
  );
}

/** Skatternas kartnål: lila med guldstjärna (samma form som StickerPin på kartan) */
const STAR = "12,5.8 13.5,9.2 17.2,9.6 14.4,12.1 15.2,15.8 12,13.9 8.8,15.8 9.6,12.1 6.8,9.6 10.5,9.2";
function TreasurePin() {
  return (
    <Svg width={19} height={25} viewBox="0 0 24 32">
      <SvgPath
        d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z"
        fill="#5B21B6" stroke="rgba(0,0,0,0.25)" strokeWidth={1}
      />
      <Polygon points={STAR} fill="#FDE68A" />
    </Svg>
  );
}

/** En stapel som fylls från vänster när sidan öppnas */
function Bar({ fraction, color, height = 8, delay = 0 }: { fraction: number; color: string; height?: number; delay?: number }) {
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(delay, withTiming(Math.max(0, Math.min(1, fraction)), { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [fraction, delay, fill]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: height / 2, transformOrigin: "left center" }, style]} />
    </View>
  );
}

/** Kategorirad: rund ikon i kategorins färg, namn, "3 av 45" och en stapel i samma färg */
function CategoryRow({ cat, delay }: { cat: CategoryStat; delay: number }) {
  const Icon = cat.Icon;
  const none = cat.visited === 0;
  return (
    <View style={[s.catRow, none && { opacity: 0.55 }]}>
      <View style={[s.catDot, { backgroundColor: cat.color }]}>
        <Icon size={16} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 7 }}>
        <View style={s.catTop}>
          <Text style={s.catName} numberOfLines={1}>{cat.label}</Text>
          <Text style={s.catCount}>{cat.visited} av {cat.total}</Text>
        </View>
        <Bar fraction={cat.total > 0 ? cat.visited / cat.total : 0} color={cat.color} delay={delay} />
      </View>
    </View>
  );
}

/**
 * Mjuk kurva genom punkterna som aldrig skjuter över dem (monoton kubisk interpolation, som
 * d3:s curveMonotoneX) — en vanlig mjuk kurva kunde gå under nollan mellan två månader och
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

/**
 * Besök per månad: mjuk kurva med fylld yta, den här månaden markerad, snittet streckat.
 * Nudda kurvan: månaden under fingret väljs direkt — en lodrät linje och en punkt, och siffrorna
 * överst visar den månaden. Drar man åt sidan följer den med från månad till månad, med en liten
 * vibration för varje (sidan scrollar inte under tiden). Drar man uppåt eller nedåt scrollar
 * sidan som vanligt. Släpper man visas den här månaden igen.
 */
function MonthChart({ months, onScrubbing }: { months: MonthPoint[]; onScrubbing: (on: boolean) => void }) {
  const [w, setW] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const draw = useSharedValue(0);
  const max = Math.max(1, ...months.map((m) => m.count));
  const avg = months.reduce((sum, m) => sum + m.count, 0) / months.length;
  const lastIndex = months.length - 1;

  const geo = useMemo(() => {
    if (w === 0) return null;
    const yOf = (v: number) => PAD_TOP + (1 - v / max) * (CHART_H - PAD_TOP - PAD_BOTTOM);
    const step = (w - PAD_X * 2) / (months.length - 1);
    const pts = months.map((m, i) => ({ x: PAD_X + i * step, y: yOf(m.count) }));
    const line = monotonePath(pts);
    const bottom = CHART_H - PAD_BOTTOM;
    const area = `${line} L ${pts[lastIndex].x} ${bottom} L ${pts[0].x} ${bottom} Z`;
    return {
      pts,
      step,
      line: Skia.Path.MakeFromSVGString(line)!,
      area: Skia.Path.MakeFromSVGString(area)!,
      avg: Skia.Path.MakeFromSVGString(`M ${PAD_X} ${yOf(avg)} L ${w - PAD_X} ${yOf(avg)}`)!,
    };
  }, [w, months, max, avg, lastIndex]);

  useEffect(() => {
    if (!geo) return;
    draw.value = 0;
    draw.value = withDelay(250, withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);
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
  const count = months.length;
  const scrub = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-14, 14])
    // Redan vid beröringen, innan fingret rört sig
    .onBegin((e) => {
      const i = Math.min(count - 1, Math.max(0, Math.round((e.x - PAD_X) / step)));
      lastPicked.value = i;
      runOnJS(select)(i);
    })
    .onStart(() => {
      runOnJS(onScrubbing)(true);
    })
    .onUpdate((e) => {
      const i = Math.min(count - 1, Math.max(0, Math.round((e.x - PAD_X) / step)));
      if (i !== lastPicked.value) {
        lastPicked.value = i;
        runOnJS(select)(i);
      }
    })
    .onFinalize(() => {
      lastPicked.value = -1;
      runOnJS(select)(null);
      runOnJS(onScrubbing)(false);
    });

  const shown = selected ?? lastIndex;
  const point = geo?.pts[shown];

  return (
    <View>
      <View style={s.chartHead}>
        <View>
          <Text style={s.legendLabel}>
            <Text style={{ color: GOLD }}>●</Text> {selected === null ? "Den här månaden" : months[selected].name}
          </Text>
          <Text style={s.legendValue}>{months[shown].count} besök</Text>
        </View>
        <View>
          <Text style={s.legendLabel}><Text style={{ color: MUTED }}>●</Text> Snitt</Text>
          <Text style={[s.legendValue, { color: MUTED }]}>{avg.toFixed(1).replace(".", ",")} besök</Text>
        </View>
      </View>

      <GestureDetector gesture={scrub}>
        <View style={{ height: CHART_H }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
          {geo && (
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Path path={geo.area} opacity={areaOpacity}>
                <LinearGradient start={vec(0, 0)} end={vec(0, CHART_H)} colors={["rgba(197,160,89,0.35)", "rgba(197,160,89,0)"]} />
              </Path>
              <Path path={geo.avg} style="stroke" strokeWidth={1.5} color="rgba(245,241,232,0.3)">
                <DashPathEffect intervals={[5, 6]} />
              </Path>
              <Path path={geo.line} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" color={GOLD} start={0} end={draw} />
              {/* Den här månaden: en lysande prick i slutet av kurvan */}
              <Circle cx={geo.pts[lastIndex].x} cy={geo.pts[lastIndex].y} r={glowR} color="rgba(232,198,116,0.45)" opacity={glowOpacity}>
                <BlurMask blur={5} style="normal" />
              </Circle>
              <Circle cx={geo.pts[lastIndex].x} cy={geo.pts[lastIndex].y} r={dotR} color={GOLD_LT} />
            </Canvas>
          )}
          {/* Den valda månaden medan man håller in: lodrät linje och en punkt på kurvan */}
          {selected !== null && point && (
            <>
              <View pointerEvents="none" style={[s.guide, { left: point.x - 0.75 }]} />
              <View pointerEvents="none" style={[s.pick, { left: point.x - 8, top: point.y - 8 }]} />
            </>
          )}
        </View>
      </GestureDetector>

      {/* Månaderna, var och en mitt under sin punkt */}
      <View style={s.monthRow}>
        {geo && months.map((m, i) => (
          <Text
            key={i}
            style={[s.monthLabel, { left: geo.pts[i].x - 20 }, i === shown && { color: FG, fontFamily: "Inter_700Bold" }]}
          >
            {m.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const WEEK_H = 90;

/** Besök per veckodag som staplar — höjden efter antalet, den vanligaste dagen i guld */
function WeekdayBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const best = counts.indexOf(Math.max(...counts));
  return (
    <View>
      <Text style={s.weekText}>Du är mest ute på <Text style={{ color: GOLD }}>{WEEKDAY_NAMES[best]}</Text></Text>
      <View style={s.weekRow}>
        {counts.map((c, i) => (
          <View key={i} style={s.weekCol}>
            <Text style={[s.weekCount, i === best && { color: GOLD }]}>{c}</Text>
            <View style={s.weekArea}>
              <WeekBar fraction={c / max} highlight={i === best && c > 0} delay={150 + i * 50} />
            </View>
            <Text style={[s.weekLabel, i === best && { color: FG }]}>{WEEKDAYS[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** En stapel som växer upp från botten. En dag utan besök blir en låg stump, inte en tom stapel. */
function WeekBar({ fraction, highlight, delay }: { fraction: number; highlight: boolean; delay: number }) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [delay, grow]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));
  const h = fraction > 0 ? Math.max(10, fraction * WEEK_H) : 5;
  return (
    <Reanimated.View
      style={[
        s.weekBar,
        { height: h, backgroundColor: highlight ? GOLD : fraction > 0 ? "rgba(245,241,232,0.35)" : TRACK },
        style,
      ]}
    />
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG },
  muted: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED },

  body: { paddingHorizontal: 16, paddingTop: 8 },

  hero: { gap: 10, marginBottom: 22 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 2.2, color: GOLD },
  heroRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  heroValue: { fontFamily: "Montserrat_700Bold", fontSize: 56, letterSpacing: -1.5, color: FG, lineHeight: 62 },
  heroOf: { fontFamily: "Inter_500Medium", fontSize: 16, color: MUTED },
  heroPercent: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD },
  track: { backgroundColor: TRACK, overflow: "hidden" },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "31.6%", flexGrow: 1, borderRadius: 16, padding: 14, gap: 6,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
  },
  // Lika hög plats för alla symboler, så värdena hamnar i linje
  tileIcon: { height: 26, justifyContent: "center", alignItems: "flex-start" },
  tileValue: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: FG, marginTop: 2 },
  tileLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: MUTED },

  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, letterSpacing: -0.2, color: FG, marginTop: 30, marginBottom: 12 },
  card: { borderRadius: 18, padding: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },

  chartHead: { flexDirection: "row", gap: 28, marginBottom: 8 },
  legendLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: MUTED },
  legendValue: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: FG, marginTop: 2 },
  guide: { position: "absolute", top: PAD_TOP - 10, bottom: PAD_BOTTOM, width: 1.5, backgroundColor: "rgba(245,241,232,0.35)" },
  pick: {
    position: "absolute", width: 16, height: 16, borderRadius: 8,
    backgroundColor: GOLD_LT, borderWidth: 3, borderColor: CARD,
  },
  monthRow: { height: 18, marginTop: 4 },
  monthLabel: { position: "absolute", width: 40, textAlign: "center", fontFamily: "Inter_500Medium", fontSize: 12, color: MUTED, textTransform: "lowercase" },

  weekText: { fontFamily: "Inter_500Medium", fontSize: 14.5, color: FG, marginBottom: 14 },
  weekRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  weekCol: { flex: 1, alignItems: "center", gap: 6 },
  weekCount: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: MUTED },
  weekArea: { width: "100%", maxWidth: 30, height: WEEK_H, justifyContent: "flex-end" },
  weekBar: { width: "100%", borderRadius: 8, transformOrigin: "bottom" },
  weekLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: MUTED },

  catRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  catDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  catTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  catName: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: FG },
  catCount: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED },

  topPlace: { flexDirection: "row", alignItems: "center", gap: 14 },
  topThumb: { width: 72, height: 72, borderRadius: 14, overflow: "hidden", backgroundColor: "#2A2A2A" },
  topName: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: FG },
  topCount: { fontFamily: "Inter_500Medium", fontSize: 14, color: GOLD, marginTop: 4 },
});
