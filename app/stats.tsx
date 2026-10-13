/**
 * Statistik — vad man upptäckt på Österlen. Samma mörka stil som Mitt Österlen och Historik:
 * header med rubriken i versaler, innehållet direkt mot bakgrunden och solida kort.
 *
 *  1. Hur mycket av Österlen man upptäckt: stort tal, en stapel och andel i procent.
 *  2. Sex rutor: besök, favoriter, minnen, skatter, utmaningar och längsta streak.
 *  3. Besök per månad (sex månader): en mjuk kurva med fylld yta under, den här månaden markerad
 *     och en streckad linje för snittet. Kurvan ritas fram när sidan öppnas (Skia).
 *  4. Dina dagar: besök per veckodag som staplar, den vanligaste dagen i guld.
 *  5. Kategorierna: alla åtta i sina egna färger, hur många man besökt av hur många som finns.
 *  6. Mest besökta platsen.
 *
 * Siffrorna kommer från samma källor som resten av appen (besök räknas som unika platser i
 * Utmaningar och topplistorna; här visas även alla besök).
 */
import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, type LayoutChangeEvent } from "react-native";
import Reanimated, {
  Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";
import { Canvas, Circle, DashPathEffect, LinearGradient, Path, Skia, vec, BlurMask } from "@shopify/react-native-skia";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, MapPin, Heart, Image as ImageIcon, Gem, Trophy, Flame } from "lucide-react-native";
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

const BG     = "#121212";
const CARD   = "#1A1A1D";
const FG     = "#F5F1E8";
const MUTED  = "rgba(245,241,232,0.55)";
const GOLD   = "#C5A059";
const GOLD_LT = "#E8C674";
const BORDER = "rgba(255,255,255,0.08)";
const TRACK  = "rgba(255,255,255,0.08)";

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const WEEKDAY_NAMES = ["måndagar", "tisdagar", "onsdagar", "torsdagar", "fredagar", "lördagar", "söndagar"];

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

  const stats = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, p]));
    const valid = visits.filter((v) => byId.has(v.place_id));
    const unique = [...new Set(valid.map((v) => v.place_id))];

    // Besök per månad, de senaste sex (äldst först)
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(now.getFullYear(), now.getMonth(), 1), 5 - i);
      const count = valid.filter((v) => {
        const vd = new Date(v.visited_at);
        return vd.getFullYear() === d.getFullYear() && vd.getMonth() === d.getMonth();
      }).length;
      return { label: format(d, "MMM", { locale: sv }).replace(".", ""), count };
    });

    // Besök per veckodag (måndag först)
    const weekdays = [0, 0, 0, 0, 0, 0, 0];
    valid.forEach((v) => { weekdays[(new Date(v.visited_at).getDay() + 6) % 7] += 1; });

    // Mest besökta platsen
    const perPlace = new Map<number, number>();
    valid.forEach((v) => perPlace.set(v.place_id, (perPlace.get(v.place_id) ?? 0) + 1));
    let topPlace: { id: number; count: number } | null = null;
    perPlace.forEach((count, id) => { if (!topPlace || count > topPlace.count) topPlace = { id, count }; });
    const top = topPlace as { id: number; count: number } | null;

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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 40 }]}>
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
            <Tile Icon={MapPin} value={stats.visitCount} label="Besök" />
            <Tile Icon={Heart} value={favorites.length} label="Favoriter" />
            <Tile Icon={ImageIcon} value={memories.length} label="Minnen" />
            <Tile Icon={Gem} value={`${treasures}/${collectibles.length || 24}`} label="Skatter" />
            <Tile Icon={Trophy} value={`${trophiesDone}/${trophies.length}`} label="Utmaningar" />
            <Tile Icon={Flame} value={longestStreak} label="Längsta streak" />
          </View>

          {/* 3. Besök per månad */}
          <Text style={s.sectionTitle}>Besök per månad</Text>
          <View style={s.card}>
            <MonthChart months={stats.months} />
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

/** En ruta: ikon, stort värde, etikett */
function Tile({ Icon, value, label }: { Icon: React.ComponentType<any>; value: number | string; label: string }) {
  return (
    <View style={s.tile}>
      <Icon size={18} color={GOLD} strokeWidth={2} />
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
    </View>
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

/** Mjuk kurva genom punkterna (Catmull-Rom som kubiska Bézier-kurvor) */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const CHART_H = 140;
const CHART_PAD_TOP = 14;

/** Besök per månad: mjuk kurva med fylld yta, den här månaden markerad, snittet streckat */
function MonthChart({ months }: { months: { label: string; count: number }[] }) {
  const [w, setW] = useState(0);
  const draw = useSharedValue(0);
  const max = Math.max(1, ...months.map((m) => m.count));
  const avg = months.reduce((sum, m) => sum + m.count, 0) / months.length;
  const current = months[months.length - 1]?.count ?? 0;

  const geo = useMemo(() => {
    if (w === 0) return null;
    const inset = 8;
    const yOf = (v: number) => CHART_PAD_TOP + (1 - v / max) * (CHART_H - CHART_PAD_TOP - 6);
    const pts = months.map((m, i) => ({ x: inset + (i / (months.length - 1)) * (w - inset * 2), y: yOf(m.count) }));
    const line = smoothPath(pts);
    const area = `${line} L ${pts[pts.length - 1].x} ${CHART_H} L ${pts[0].x} ${CHART_H} Z`;
    return {
      line: Skia.Path.MakeFromSVGString(line)!,
      area: Skia.Path.MakeFromSVGString(area)!,
      avg: Skia.Path.MakeFromSVGString(`M ${inset} ${yOf(avg)} L ${w - inset} ${yOf(avg)}`)!,
      last: pts[pts.length - 1],
    };
  }, [w, months, max, avg]);

  useEffect(() => {
    if (!geo) return;
    draw.value = 0;
    draw.value = withDelay(250, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [geo, draw]);
  const areaOpacity = useDerivedValue(() => draw.value * 0.9);
  const dotR = useDerivedValue(() => (draw.value > 0.97 ? 6 : 0));
  const glowR = useDerivedValue(() => (draw.value > 0.97 ? 14 : 0));

  return (
    <View>
      <View style={s.chartHead}>
        <View>
          <Text style={s.legendLabel}><Text style={{ color: GOLD }}>●</Text> Den här månaden</Text>
          <Text style={s.legendValue}>{current} besök</Text>
        </View>
        <View>
          <Text style={s.legendLabel}><Text style={{ color: MUTED }}>●</Text> Snitt</Text>
          <Text style={[s.legendValue, { color: MUTED }]}>{avg.toFixed(1).replace(".", ",")} besök</Text>
        </View>
      </View>
      <View style={{ height: CHART_H }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {geo && (
          <Canvas style={StyleSheet.absoluteFill}>
            <Path path={geo.area} opacity={areaOpacity}>
              <LinearGradient start={vec(0, 0)} end={vec(0, CHART_H)} colors={["rgba(197,160,89,0.35)", "rgba(197,160,89,0)"]} />
            </Path>
            <Path path={geo.avg} style="stroke" strokeWidth={1.5} color="rgba(245,241,232,0.3)">
              <DashPathEffect intervals={[5, 6]} />
            </Path>
            <Path path={geo.line} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" color={GOLD} start={0} end={draw} />
            <Circle cx={geo.last.x} cy={geo.last.y} r={glowR} color="rgba(232,198,116,0.45)">
              <BlurMask blur={6} style="normal" />
            </Circle>
            <Circle cx={geo.last.x} cy={geo.last.y} r={dotR} color={GOLD_LT} />
          </Canvas>
        )}
      </View>
      <View style={s.monthRow}>
        {months.map((m, i) => (
          <Text key={i} style={[s.monthLabel, i === months.length - 1 && { color: FG }]}>{m.label}</Text>
        ))}
      </View>
    </View>
  );
}

/** Besök per veckodag som staplar — den vanligaste dagen i guld */
function WeekdayBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const best = counts.indexOf(Math.max(...counts));
  return (
    <View>
      <Text style={s.weekText}>Du är mest ute på <Text style={{ color: GOLD }}>{WEEKDAY_NAMES[best]}</Text></Text>
      <View style={s.weekRow}>
        {counts.map((c, i) => (
          <View key={i} style={s.weekCol}>
            <Text style={[s.weekCount, i === best && { color: GOLD }]}>{c > 0 ? c : ""}</Text>
            <View style={s.weekTrack}>
              <WeekBar fraction={c / max} highlight={i === best} delay={150 + i * 50} />
            </View>
            <Text style={[s.weekLabel, i === best && { color: FG }]}>{WEEKDAYS[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeekBar({ fraction, highlight, delay }: { fraction: number; highlight: boolean; delay: number }) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(delay, withTiming(fraction, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [fraction, delay, grow]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));
  return (
    <Reanimated.View
      style={[StyleSheet.absoluteFill, { borderRadius: 8, backgroundColor: highlight ? GOLD : "rgba(245,241,232,0.22)", transformOrigin: "bottom" }, style]}
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
  tileValue: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: FG, marginTop: 2 },
  tileLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: MUTED },

  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, letterSpacing: -0.2, color: FG, marginTop: 30, marginBottom: 12 },
  card: { borderRadius: 18, padding: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },

  chartHead: { flexDirection: "row", gap: 28, marginBottom: 14 },
  legendLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: MUTED },
  legendValue: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: FG, marginTop: 2 },
  monthRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingHorizontal: 0 },
  monthLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: MUTED, textTransform: "lowercase" },

  weekText: { fontFamily: "Inter_500Medium", fontSize: 14.5, color: FG, marginBottom: 14 },
  weekRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  weekCol: { flex: 1, alignItems: "center", gap: 6 },
  weekCount: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: MUTED, height: 16 },
  weekTrack: { width: "100%", maxWidth: 30, height: 90, borderRadius: 8, backgroundColor: TRACK, overflow: "hidden" },
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
