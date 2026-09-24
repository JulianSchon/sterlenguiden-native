/**
 * Mitt Österlen — streak överst (eld, siffra, nyckeltal, veckan).
 * Under streaken ligger Dina listor och Dina minnen; Samlarobjekt läggs till i ett senare steg.
 *
 * Streaken räknas ur app_days (en rad per svensk kalenderdag med appöppning),
 * se src/lib/streak.ts.
 */
import { useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { StreakFlame } from "@/components/streak/StreakFlame";
import { ListsSection } from "@/components/lists/ListsSection";
import { MemoriesSection } from "@/components/memories/MemoriesSection";
import { useAppDays } from "@/hooks/useAppDays";
import { computeStreak, swedishDay, weekDays } from "@/lib/streak";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const CARD = "#1A1A1D";
const WEEKDAY_LABELS = ["MÅN", "TIS", "ONS", "TOR", "FRE", "LÖR", "SÖN"];

export default function MittOsterlenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: days = [] } = useAppDays();

  const today = swedishDay();
  const streak = useMemo(() => computeStreak(days, today), [days, today]);
  const week = weekDays(today);
  const daySet = useMemo(() => new Set(days), [days]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Fast header — ligger utanför ScrollView så den stannar kvar vid scroll */}
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>MITT ÖSTERLEN</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
      >

        <View style={s.hero}>
          <StreakFlame size={215} />
          <View style={s.numberWrap}>
            {/* Mörkt, mjukt sken bakom siffran så den syns mot elden. Tonar ut
                till helt transparent långt innan ytans kant — ingen synlig ruta. */}
            <Canvas style={s.scrim} pointerEvents="none">
              <Group origin={vec(170, 110)} transform={[{ scaleY: 0.6 }]}>
                <Circle cx={170} cy={110} r={72}>
                  <RadialGradient
                    c={vec(170, 110)}
                    r={72}
                    colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0.3)", "rgba(0,0,0,0)"]}
                    positions={[0, 0.45, 1]}
                  />
                </Circle>
              </Group>
            </Canvas>
            <Text style={s.number}>{streak.current}</Text>
          </View>
          <Text style={s.label}>{streak.current === 1 ? "Dags streak" : "Dagars streak"}</Text>
          <Text style={s.hint}>Öppna appen varje dag</Text>
        </View>

        {/* Nyckeltal */}
        <View style={s.stats}>
          <Stat
            value={streak.startedOn ? format(new Date(streak.startedOn), "d MMM yyyy", { locale: sv }) : "–"}
            label="Streak startade"
          />
          <View style={s.statDivider} />
          <Stat value={String(streak.longest)} label="Längsta streak" />
        </View>

        {/* Veckan */}
        <View style={s.card}>
          <Text style={s.cardTitle}>DEN HÄR VECKAN</Text>
          <View style={s.weekRow}>
            {week.map((d, i) => {
              const done = daySet.has(d);
              const isToday = d === today;
              return (
                <View key={d} style={s.weekDay}>
                  <Text style={[s.weekLabel, isToday && { color: FG }]}>{WEEKDAY_LABELS[i]}</Text>
                  <View style={s.weekSlot}>
                    {done ? <StreakFlame compact size={30} timeOffset={i * 700} /> : <View style={s.emptyDay} />}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <ListsSection />
        <MemoriesSection />
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  // Versal geometrisk sans med luft mellan bokstäverna, vänsterställd bredvid tillbaka-knappen
  title: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG },
  hero: { alignItems: "center" },
  // Siffran sitter över eldens nedre del, som på Whoop
  numberWrap: { marginTop: -69, width: 340, height: 100, alignItems: "center", justifyContent: "center" },
  scrim: { position: "absolute", left: 0, top: -60, width: 340, height: 220 },
  number: { fontFamily: "Inter_700Bold", fontSize: 92, color: "#FFFFFF", lineHeight: 100 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 24, color: FG, marginTop: 20 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED, marginTop: 6 },

  stats: { flexDirection: "row", alignItems: "center", marginTop: 28, marginHorizontal: 16 },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 17, color: FG },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: "rgba(255,255,255,0.18)" },

  card: {
    marginTop: 20, marginHorizontal: 16, padding: 18, borderRadius: 20,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 1.4, color: FG },
  weekRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  weekDay: { alignItems: "center", gap: 10, flex: 1 },
  weekSlot: { height: 41, alignItems: "center", justifyContent: "center" },
  weekLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, letterSpacing: 0.8, color: MUTED },
  emptyDay: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.25)",
  },
});
