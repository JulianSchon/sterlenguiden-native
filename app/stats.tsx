/**
 * Statistik ("Din progression") — KPI-rad, kategoriring, månadskurva, topkategori.
 * Spec: native-stats-spec.md
 *
 * Ett avsteg från spec, av tekniska skäl:
 * - "Minnen"-KPI:n är hårdkodad till 0 — ingen memories-tabell finns än i
 *   appen (samma platshållare som Mitt Österlen-remsan på profilen).
 *
 * "Utmaningar"-KPI:n delar räknemotor med app/challenges.tsx via
 * src/lib/achievements.ts (computeUserStats + buildTrophies) — 7 grupper
 * byggda på besök/favoriter/förmåner/svep, inte platskategorier längre
 * (nollställt 2026-09-16). Samma motor på båda sidorna, så de aldrig
 * kan visa olika siffror.
 */
import { useEffect, useMemo, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated, Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft, MapPin, Heart, Image as ImageIcon, Trophy, TrendingUp,
  UtensilsCrossed, Coffee, Hotel, ShoppingBag, TreePine, Target, Landmark, Palette,
} from "lucide-react-native";
import Svg, {
  Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect,
  Circle as SvgCircle, Path as SvgPath, Text as SvgText,
} from "react-native-svg";
import { useVisits } from "@/hooks/useVisits";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { useFavorites } from "@/hooks/useFavorites";
import { useTrophies } from "@/hooks/useTrophies";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const BG      = "#121212";
const CARD    = "#1C1C1C";
const FG      = "#F5F1E8";
const MUTED   = "rgba(245,241,232,0.55)";
const GOLD    = "#C5A059";
const GOLD_LT = "#E8C674";

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);
const AnimatedPath   = Animated.createAnimatedComponent(SvgPath);

// ─── Kategorier — samma dbValues som app/category/[categoryId].tsx ────────────
interface StatCategory {
  id: string;
  label: string;
  color: string;
  Icon: React.ComponentType<any>;
  dbValues: string[];
}

const STAT_CATEGORIES: StatCategory[] = [
  { id: "mat-dryck",          label: "Mat & Dryck",          color: "#8B5F46", Icon: UtensilsCrossed, dbValues: ["Mat", "Mat & Dryck"] },
  { id: "cafe-bageri",        label: "Café & Bageri",        color: "#A3814C", Icon: Coffee,          dbValues: ["Café & Bageri", "Cafe & Bageri"] },
  { id: "hotell-bb",          label: "Hotell & B&B",         color: "#5A6580", Icon: Hotel,           dbValues: ["Hotell & B&B", "Boende"] },
  { id: "butiker",            label: "Butiker",              color: "#9C5860", Icon: ShoppingBag,     dbValues: ["Butiker", "Gårdsbutik"] },
  { id: "natur-upplevelser",  label: "Natur & Upplevelser",  color: "#4C7659", Icon: TreePine,        dbValues: ["Natur", "Natur & Upplevelser"] },
  { id: "aktiviteter",        label: "Aktiviteter",          color: "#568495", Icon: Target,          dbValues: ["Aktiviteter"] },
  { id: "sevardheter",        label: "Sevärdheter",          color: "#6C5C95", Icon: Landmark,        dbValues: ["Sevärdheter", "Konst"] },
  { id: "hantverk-service",   label: "Design & Hantverk",    color: "#4F7D79", Icon: Palette,         dbValues: ["Hantverk & Service", "Hantverk"] },
];

interface CategoryStat extends StatCategory {
  total: number;
  visited: number;
  percentage: number;
}

function placeMatchesCategory(place: Place, dbValues: string[]): boolean {
  if (!place.categories) return false;
  const parts = place.categories.split(",").map((s) => s.trim().toLowerCase());
  return dbValues.some((v) => {
    const t = v.toLowerCase();
    return parts.some((p) => p === t || p.includes(t) || t.includes(p));
  });
}

// ─── Ringdiagram ────────────────────────────────────────────────────────────────
const RING_SIZE   = 120;
const RING_CENTER = 60;
const RING_R      = 52;
const RING_STROKE = 6;
const RING_CIRC   = 2 * Math.PI * RING_R;

function ProgressRing({ percent, centerValue }: { percent: number; centerValue: number }) {
  const anim = useRef(new Animated.Value(RING_CIRC)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: RING_CIRC * (1 - percent / 100),
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent]);

  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <SvgCircle
        cx={RING_CENTER} cy={RING_CENTER} r={RING_R}
        stroke="rgba(197,160,89,0.12)" strokeWidth={RING_STROKE} fill="none"
      />
      <AnimatedCircle
        cx={RING_CENTER} cy={RING_CENTER} r={RING_R}
        stroke={GOLD} strokeWidth={RING_STROKE} fill="none"
        strokeLinecap="round"
        strokeDasharray={RING_CIRC}
        strokeDashoffset={anim}
        transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
      />
      <SvgText
        x={RING_CENTER} y={RING_CENTER + 10} textAnchor="middle"
        fontSize={30} fontFamily="PlayfairDisplay_700Bold" fill={GOLD}
      >
        {centerValue}
      </SvgText>
    </Svg>
  );
}

// ─── Kategori-legendrad ─────────────────────────────────────────────────────────
function CategoryLegendRow({ cat }: { cat: CategoryStat }) {
  const Icon = cat.Icon;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={[lg.dot, { backgroundColor: cat.color }]}>
        <Icon size={12} color="#FFFFFF" strokeWidth={2} />
      </View>
      <Text style={lg.label} numberOfLines={1}>{cat.label}</Text>
      <Text style={lg.pct}>{cat.percentage}%</Text>
    </View>
  );
}

const lg = StyleSheet.create({
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Inter_400Regular", fontSize: 12, color: FG, flex: 1 },
  pct: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: FG },
});

// ─── Månadskurva (SVG line + area) ──────────────────────────────────────────────
const CHART_W = 280;
const CHART_H = 100;

function MonthlyLineChart({ data }: { data: { label: string; count: number }[] }) {
  const maxMonthly = Math.max(...data.map((d) => d.count), 1);
  const points = data.map((d, i) => ({
    ...d,
    x: (i / 5) * CHART_W,
    y: CHART_H - (d.count / maxMonthly) * 90 - 5,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  const totalLen = points.slice(1).reduce((sum, p, i) => {
    const prev = points[i];
    return sum + Math.hypot(p.x - prev.x, p.y - prev.y);
  }, 0) || 1;

  const drawAnim    = useRef(new Animated.Value(0)).current;
  const areaOpacity = useRef(new Animated.Value(0)).current;
  const pointAnims  = useRef(data.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(drawAnim, { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    Animated.timing(areaOpacity, { toValue: 1, duration: 800, useNativeDriver: false }).start();
    pointAnims.forEach((a, i) => {
      Animated.timing(a, { toValue: 1, duration: 250, delay: 500 + i * 100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    });
  }, []);

  const dashOffset = drawAnim.interpolate({ inputRange: [0, 1], outputRange: [totalLen, 0] });

  return (
    <Svg width="100%" height={140} viewBox="-10 -10 300 130">
      <Defs>
        <SvgGrad id="monthlyArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={GOLD} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={GOLD} stopOpacity={0}    />
        </SvgGrad>
      </Defs>
      <AnimatedPath d={areaPath} fill="url(#monthlyArea)" opacity={areaOpacity} />
      <AnimatedPath
        d={linePath} stroke={GOLD} strokeWidth={2.5} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={totalLen}
        strokeDashoffset={dashOffset}
      />
      {points.map((p, i) => (
        <AnimatedCircle
          key={`pt${i}`}
          cx={p.x} cy={p.y}
          r={pointAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, 3] })}
          fill={GOLD} stroke={CARD} strokeWidth={1.5}
        />
      ))}
      {points.map((p, i) => (
        <SvgText
          key={`lbl${i}`} x={p.x} y={118} textAnchor="middle"
          fontSize={9} fontFamily="Inter_400Regular" fill={MUTED}
        >
          {p.label}
        </SvgText>
      ))}
      {points.map((p, i) => p.count > 0 && (
        <SvgText
          key={`val${i}`} x={p.x} y={p.y - 10} textAnchor="middle"
          fontSize={9} fontFamily="Inter_600SemiBold" fill={FG}
        >
          {p.count}
        </SvgText>
      ))}
    </Svg>
  );
}

// ─── KPI-kort ─────────────────────────────────────────────────────────────────
function Kpi({
  Icon, value, label, delay,
}: {
  Icon: React.ComponentType<any>;
  value: number | string;
  label: string;
  delay: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration: 250, delay,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        kp.card,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] },
      ]}
    >
      <View pointerEvents="none" style={kp.innerHighlight} />
      <Icon size={14} color={GOLD} strokeWidth={1.5} />
      <Text style={kp.value}>{value}</Text>
      <Text style={kp.label}>{label}</Text>
    </Animated.View>
  );
}

const kp = StyleSheet.create({
  card: {
    flex: 1, borderRadius: 16, padding: 12,
    backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    alignItems: "flex-start", overflow: "hidden",
  },
  innerHighlight: {
    position: "absolute", top: 0, left: 0, right: 0, height: "45%",
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderLeftWidth: 1, borderColor: "rgba(255,255,255,0.03)",
  },
  value: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 20, color: FG, marginTop: 6, lineHeight: 20 },
  label: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 4, letterSpacing: 0.3 },
});

// ─── Topkategori-kort ───────────────────────────────────────────────────────────
function TopCategoryCard({ cat }: { cat: CategoryStat }) {
  const Icon = cat.Icon;
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: cat.percentage, duration: 1000,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [cat.percentage]);
  const fillWidth = fillAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

  return (
    <View style={ov.card}>
      <Text style={ov.title}>Mest besökta kategorin</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={[tc.icon, { backgroundColor: cat.color }]}>
          <Icon size={24} color="#FFFFFF" strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Text style={tc.name} numberOfLines={1}>{cat.label}</Text>
            <Text style={tc.count}>{cat.visited} besök</Text>
          </View>
          <View style={tc.track}>
            <Animated.View style={{ width: fillWidth, height: "100%" }}>
              <Svg width="100%" height="100%">
                <Defs>
                  <SvgGrad id="topCatFill" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%"   stopColor={GOLD} />
                    <Stop offset="100%" stopColor={GOLD_LT} />
                  </SvgGrad>
                </Defs>
                <SvgRect width="100%" height="100%" fill="url(#topCatFill)" />
              </Svg>
            </Animated.View>
          </View>
        </View>
      </View>
      <Text style={tc.footer}>
        {cat.visited} av {cat.total} besökta ({cat.percentage}%)
      </Text>
    </View>
  );
}

const tc = StyleSheet.create({
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG, flexShrink: 1 },
  count: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(197,160,89,0.15)", overflow: "hidden", marginTop: 10 },
  footer: { fontFamily: "Inter_400Regular", fontSize: 11, color: MUTED, marginTop: 6 },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: visits = [], isLoading: visitsLoading }   = useVisits();
  const { data: places = [], isLoading: placesLoading }   = usePlaces();
  const { data: favorites = [] }                          = useFavorites();
  const { trophies }                                      = useTrophies();
  const isLoading = visitsLoading || placesLoading;
  const safeTop = Math.max(insets.top, 44);

  // "Minnen" finns inte som funktion än — samma platshållare som Mitt Österlen-remsan på profilen
  const memoriesCount = 0;

  const visitedPlaceIds = useMemo(() => [...new Set(visits.map((v) => v.place_id))], [visits]);
  const totalVisitedUnique = visitedPlaceIds.length;
  const totalPlaces = places.length;
  const exploredPercent = totalPlaces > 0 ? Math.round((totalVisitedUnique / totalPlaces) * 100) : 0;

  // "Aktiv" = gruppens guldnivå inte klar än. 7 grupper (Kom igång/
  // Utforskaren/Samlaren/Förmånsjägaren/Mångsidig/Bläddraren/Österlenlegend),
  // inte platskategorier.
  const activeChallenges = trophies.filter((t) => t.tier === "gold" && !t.done).length;

  const categoryStats: CategoryStat[] = useMemo(() => {
    return STAT_CATEGORIES.map((cat) => {
      const total = places.filter((p) => placeMatchesCategory(p, cat.dbValues)).length;
      const visited = visitedPlaceIds.filter((pid) => {
        const p = places.find((pp) => pp.id === pid);
        return !!p && placeMatchesCategory(p, cat.dbValues);
      }).length;
      const percentage = total > 0 ? Math.round((visited / total) * 100) : 0;
      return { ...cat, total, visited, percentage };
    }).sort((a, b) => b.visited - a.visited);
  }, [places, visitedPlaceIds]);

  const topCategories = categoryStats.slice(0, 6);
  const topCategory = categoryStats[0];

  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, idx) => {
      const i = 5 - idx;
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = visits.filter((v) => {
        const vd = new Date(v.visited_at);
        return vd.getFullYear() === d.getFullYear() && vd.getMonth() === d.getMonth();
      }).length;
      return { label: format(d, "MMM", { locale: sv }), count };
    });
  }, [visits]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[hd.header, { paddingTop: safeTop }]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGrad id="statsHeaderFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={BG} stopOpacity={1}    />
              <Stop offset="55%"  stopColor={BG} stopOpacity={0.98} />
              <Stop offset="100%" stopColor={BG} stopOpacity={0.78} />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#statsHeaderFade)" />
        </Svg>
        <View style={hd.row}>
          <TouchableOpacity style={hd.iconBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={hd.title}>Din progression</Text>
            <Text style={hd.subtitle}>Detta har du upptäckt</Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED }}>Laddar statistik…</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 32, gap: 12 }}
        >
          {/* ── KPI-rad ── */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Kpi Icon={MapPin}    value={totalVisitedUnique} label="Besök"      delay={0} />
            <Kpi Icon={Heart}     value={favorites.length}   label="Favoriter"  delay={50} />
            <Kpi Icon={ImageIcon} value={memoriesCount}      label="Minnen"     delay={100} />
            <Kpi Icon={Trophy}    value={activeChallenges}   label="Utmaningar" delay={150} />
          </View>

          {/* ── Översikt ── */}
          <View style={ov.card}>
            <Text style={ov.title}>Översikt</Text>
            <View style={{ flexDirection: "row", gap: 20, alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <ProgressRing percent={exploredPercent} centerValue={totalVisitedUnique} />
                {totalVisitedUnique === 0 ? (
                  <>
                    <Text style={ov.caption}>Du har bara börjat 👀</Text>
                    <Text style={ov.caption}>{totalPlaces} platser väntar</Text>
                  </>
                ) : (
                  <>
                    <Text style={ov.caption}>{totalVisitedUnique} av {totalPlaces}</Text>
                    <Text style={ov.caption}>upptäckta platser</Text>
                  </>
                )}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                {topCategories.map((c) => <CategoryLegendRow key={c.id} cat={c} />)}
              </View>
            </View>
          </View>

          {/* ── Besök per månad ── */}
          <View style={ov.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <TrendingUp size={16} color={GOLD} strokeWidth={2} />
              <Text style={ov.title0}>Besök per månad</Text>
            </View>
            <MonthlyLineChart data={monthly} />
          </View>

          {/* ── Mest besökta kategorin ── */}
          {topCategory && topCategory.visited > 0 && <TopCategoryCard cat={topCategory} />}
        </ScrollView>
      )}
    </View>
  );
}

const hd = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  row: {
    flexDirection: "row", alignItems: "center",
    minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG, lineHeight: 24 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 0.3, marginTop: 4 },
});

const ov = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 20,
    backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  title:  { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG, marginBottom: 16 },
  title0: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
  caption: { fontFamily: "Inter_400Regular", fontSize: 11, color: MUTED, textAlign: "center", marginTop: 2 },
});
