/**
 * Statistik – SVG ring chart + KPI cards + monthly bars
 * Spec: native-subpages-spec.md §4
 */
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import Svg, {
  G, Circle, Text as SvgText, Rect, Defs, LinearGradient, Stop,
} from "react-native-svg";
import { useVisits } from "@/hooks/useVisits";
import { useAchievements } from "@/hooks/useAchievements";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";
import { sv } from "date-fns/locale";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";

const SW = Dimensions.get("window").width;

// ─── Ring chart ───────────────────────────────────────────────────────────────
const RING_R   = 90;
const RING_W   = 22;
const RING_CIRC= 2 * Math.PI * RING_R;

const CATEGORY_COLORS = [
  "#C5A059", "#8B6FCF", "#5DA8E8", "#71C894", "#E86A5E",
];

interface Slice { label: string; value: number; color: string }

function RingChart({ slices, total }: { slices: Slice[]; total: number }) {
  const SIZE = RING_R * 2 + RING_W + 20;
  let cumPct  = 0;
  const GAP   = 0.015; // gap fraction

  return (
    <View style={{ alignItems: "center", gap: 20 }}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Defs>
          <LinearGradient id="goldRing" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#F0D080" />
            <Stop offset="1" stopColor="#C5A059" />
          </LinearGradient>
        </Defs>
        <G transform={`translate(${SIZE / 2}, ${SIZE / 2}) rotate(-90)`}>
          {/* Background track */}
          <Circle r={RING_R} stroke="rgba(255,255,255,0.07)" strokeWidth={RING_W} fill="none" />
          {total === 0 ? (
            <Circle
              r={RING_R} stroke="url(#goldRing)" strokeWidth={RING_W} fill="none"
              strokeDasharray={`${RING_CIRC * 0.12} ${RING_CIRC * 0.88}`} strokeLinecap="round"
            />
          ) : (
            slices.map((sl, i) => {
              const pct      = (sl.value / total) * (1 - GAP * slices.length);
              const offset   = cumPct * RING_CIRC;
              cumPct        += pct + GAP;
              const dashArr  = `${pct * RING_CIRC} ${(1 - pct) * RING_CIRC}`;
              return (
                <Circle
                  key={i}
                  r={RING_R} stroke={sl.color} strokeWidth={RING_W} fill="none"
                  strokeDasharray={dashArr}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
              );
            })
          )}
        </G>
        {/* Centre text — can't use position:absolute inside SVG, so use SvgText */}
        <SvgText
          x={SIZE / 2} y={SIZE / 2 - 10}
          textAnchor="middle" fill={FG}
          fontSize="36" fontFamily="PlayfairDisplay_700Bold"
        >{total}</SvgText>
        <SvgText
          x={SIZE / 2} y={SIZE / 2 + 16}
          textAnchor="middle" fill="rgba(245,241,232,0.55)"
          fontSize="12" fontFamily="Inter_400Regular"
        >besök totalt</SvgText>
      </Svg>
      {/* Legend */}
      <View style={{ gap: 8, width: "100%" }}>
        {slices.map((sl) => (
          <View key={sl.label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: sl.color }} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, flex: 1 }}>{sl.label}</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: FG }}>{sl.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Monthly bars ─────────────────────────────────────────────────────────────
const BAR_W = 28;
const BAR_MAX_H = 100;

function MonthlyBars({ visits }: { visits: { visited_at: string }[] }) {
  const now    = new Date();
  const months = eachMonthOfInterval({ start: subMonths(now, 5), end: now });

  const counts = months.map((m) => {
    const start = startOfMonth(m).toISOString();
    const end   = endOfMonth(m).toISOString();
    return { label: format(m, "MMM", { locale: sv }), count: visits.filter((v) => v.visited_at >= start && v.visited_at <= end).length };
  });

  const maxCount = Math.max(1, ...counts.map((c) => c.count));

  return (
    <View>
      <Text style={st.eyebrow}>SENASTE 6 MÅNADER</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16 }}>
        {counts.map(({ label, count }) => {
          const h = (count / maxCount) * BAR_MAX_H;
          return (
            <View key={label} style={{ alignItems: "center", gap: 6 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: count > 0 ? GOLD : MUTED }}>{count || ""}</Text>
              <View style={{ width: BAR_W, height: BAR_MAX_H, justifyContent: "flex-end" }}>
                <View style={[st.bar, { height: Math.max(h, 4) }]} />
              </View>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: MUTED, textTransform: "uppercase" }}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <View style={st.kpiCard}>
      <Text style={st.kpiValue}>{value}</Text>
      <Text style={st.kpiLabel}>{label}</Text>
      {sub && <Text style={st.kpiSub}>{sub}</Text>}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: visits = [] }       = useVisits();
  const { data: achievements = [] } = useAchievements();
  const safeTop = Math.max(insets.top, 44);

  // Build category slices from visits (we'll approximate by using place sub_category if available — here we just use total without breakdown since visits don't carry category directly)
  // For now build a single "Besök" slice in gold
  const slices: Slice[] = visits.length > 0
    ? [{ label: "Alla platser", value: visits.length, color: GOLD }]
    : [];

  // Streak: consecutive days with visits
  const sortedDates = [...visits].map((v) => v.visited_at.slice(0,10)).sort().reverse();
  const uniqueDates = [...new Set(sortedDates)];
  let streak = 0;
  const today = new Date().toISOString().slice(0,10);
  if (uniqueDates[0] === today || uniqueDates[0] === new Date(Date.now() - 86400000).toISOString().slice(0,10)) {
    let check = uniqueDates[0];
    for (const d of uniqueDates) {
      if (d === check) { streak++; check = new Date(new Date(check).getTime() - 86400000).toISOString().slice(0,10); }
      else break;
    }
  }

  const thisMonth = new Date().toISOString().slice(0,7);
  const thisMonthCount = visits.filter((v) => v.visited_at.startsWith(thisMonth)).length;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[st.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Statistik</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.body}>
        {/* Ring chart */}
        <View style={st.card}>
          <Text style={st.eyebrow}>BESÖK PER KATEGORI</Text>
          <View style={{ marginTop: 16 }}>
            <RingChart slices={slices} total={visits.length} />
          </View>
        </View>

        {/* KPI row */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <KpiCard label="Denna månad" value={thisMonthCount} />
          <KpiCard label="Streak" value={`${streak}d`} sub={streak > 0 ? "🔥 Keep it up" : undefined} />
          <KpiCard label="Badges" value={achievements.length} />
        </View>

        {/* Monthly bars */}
        <View style={st.card}>
          <MonthlyBars visits={visits} />
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, flex: 1 },
  body: { padding: 20, gap: 16, paddingBottom: 80 },
  card: { backgroundColor: CARD, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: BORDER },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "rgba(197,160,89,0.75)", letterSpacing: 2, textTransform: "uppercase" },
  bar: { width: BAR_W, borderRadius: 6, backgroundColor: GOLD },
  kpiCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 4, alignItems: "center",
  },
  kpiValue: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 28, color: GOLD },
  kpiLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: MUTED, textAlign: "center" },
  kpiSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(197,160,89,0.65)", textAlign: "center" },
});
