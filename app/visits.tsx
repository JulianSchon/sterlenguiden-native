/**
 * Historik — alla besök som en tidslinje, senaste överst. Samma känsla som minnena: allt ligger
 * direkt mot bakgrunden längs en tunn grå linje, inga kort.
 *
 * Varje besök: datumet till vänster om linjen, en rund prick PÅ linjen i platsens kategorifärg med
 * kategorins symbol, och till höger platsens bild med namnet och klockslaget under. Vid varje
 * årsskifte ett stort årtal som avdelare (överst står årets tal för de senaste besöken).
 *
 * Besök utan matchande plats göms. Header som Mitt Österlen.
 */
import { useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet } from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Compass, MapPin } from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useVisits, type Visit } from "@/hooks/useVisits";
import { usePlaces, firstImageUrl, type Place } from "@/hooks/usePlaces";
import { findCategory } from "@/theme/categories";
import { pushOnce } from "@/lib/navigateOnce";

const BG    = "#121212";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const LINE  = "rgba(255,255,255,0.14)";

// Tidslinjens mått: sidmarginal, datumspalten, prickens storlek och linjens läge (prickens mitt)
const PAD = 8;
const DATE_W = 42;
const DOT_GAP = 8;
const DOT = 38;
const LINE_X = PAD + DATE_W + DOT_GAP + DOT / 2;
const THUMB = 100;
/** Bara de första raderna glider in — resten finns redan när man scrollar dit */
const ANIMATED_ROWS = 12;

interface VisitedPlace extends Visit {
  place: Place;
}

type Entry =
  | { kind: "year"; key: string; year: string }
  | { kind: "visit"; key: string; visit: VisitedPlace; index: number };

export default function VisitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: visits = [], isLoading: visitsLoading } = useVisits();
  const { data: places = [], isLoading: placesLoading } = usePlaces();
  const isLoading = visitsLoading || placesLoading;

  // Besöken (senaste först, så kommer de redan) med ett årtal före varje nytt år
  const { entries, uniqueCount } = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, p]));
    const visited = visits
      .map((v) => ({ ...v, place: byId.get(v.place_id) }))
      .filter((v): v is VisitedPlace => !!v.place);
    const list: Entry[] = [];
    let year = "";
    visited.forEach((v, index) => {
      const y = String(new Date(v.visited_at).getFullYear());
      if (y !== year) {
        year = y;
        list.push({ kind: "year", key: `y${y}`, year: y });
      }
      list.push({ kind: "visit", key: v.id, visit: v, index });
    });
    return { entries: list, uniqueCount: new Set(visited.map((v) => v.place_id)).size };
  }, [visits, places]);
  const visitCount = entries.filter((e) => e.kind === "visit").length;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Fast header, samma som Mitt Österlen */}
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>HISTORIK</Text>
        </View>
      </View>

      {!isLoading && visitCount === 0 && (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Compass size={26} color={GOLD} strokeWidth={1.5} />
          </View>
          <Text style={s.emptyTitle}>Din Österlenresa börjar här</Text>
          <Text style={s.emptyText}>När du checkar in på platser dyker de upp här, i din egen tidslinje.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/(tabs)/explore" as any)}>
            <Text style={s.emptyBtnText}>Utforska platser</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && visitCount > 0 && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 40 }}>
          <Text style={s.summary}>
            {visitCount} besök · {uniqueCount} av {places.length} platser upptäckta
          </Text>
          {entries.map((e, i) =>
            e.kind === "year" ? (
              <YearDivider key={e.key} year={e.year} first={i === 0} />
            ) : (
              <VisitRow
                key={e.key}
                visit={e.visit}
                index={e.index}
                last={i === entries.length - 1}
                onPress={() => pushOnce(router, `/place/${e.visit.place.id}`)}
              />
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** Årtalet vid ett årsskifte — stort, med linjen som fortsätter förbi */
function YearDivider({ year, first }: { year: string; first: boolean }) {
  return (
    <View style={[s.yearRow, first && { paddingTop: 10 }]}>
      {!first && <View style={[s.line, { top: 0, bottom: 0 }]} />}
      {first && <View style={[s.line, { top: "60%", bottom: 0 }]} />}
      <Text style={s.year}>{year}</Text>
    </View>
  );
}

/** Ett besök: datum · prick i kategorifärg på linjen · bild · namn och klockslag */
function VisitRow({ visit, index, last, onPress }: { visit: VisitedPlace; index: number; last: boolean; onPress: () => void }) {
  const when = new Date(visit.visited_at);
  const category = findCategory(visit.place.categories?.split(",")[0] ?? null);
  const Icon = category?.icon ?? MapPin;
  const image = firstImageUrl(visit.place.image_url);
  const content = (
    <TouchableOpacity style={s.row} activeOpacity={0.75} onPress={onPress}>
      <View style={[s.line, { top: 0, bottom: last ? "50%" : 0 }]} />
      <View style={s.dateCol}>
        <Text style={s.day}>{format(when, "d")}</Text>
        <Text style={s.month}>{format(when, "MMM", { locale: sv }).replace(".", "")}</Text>
      </View>
      <View style={[s.dot, { backgroundColor: category?.screen ?? GOLD }]}>
        <Icon size={18} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={s.thumb}>
        {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={2}>{visit.place.name}</Text>
        <Text style={s.time} numberOfLines={1}>
          {capitalize(format(when, "EEEE", { locale: sv }))} kl. {format(when, "HH:mm")}
        </Text>
      </View>
    </TouchableOpacity>
  );
  if (index >= ANIMATED_ROWS) return content;
  return <Reanimated.View entering={FadeInDown.delay(index * 40).duration(320)}>{content}</Reanimated.View>;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG },

  summary: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED, paddingHorizontal: 16, marginBottom: 4 },

  // Tidslinjen: linjen ritas i varje rad, så den löper obruten genom hela listan
  line: { position: "absolute", left: LINE_X - 1, width: 2, backgroundColor: LINE },
  yearRow: { paddingLeft: LINE_X + DOT / 2 + DOT_GAP + 4, paddingTop: 26, paddingBottom: 14 },
  year: { fontFamily: "Montserrat_700Bold", fontSize: 48, letterSpacing: -1, color: FG },

  row: { flexDirection: "row", alignItems: "center", paddingLeft: PAD, paddingRight: 16, paddingVertical: 14 },
  // Dagen och månaden centrerade över varandra
  dateCol: { width: DATE_W, alignItems: "center" },
  day: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: FG, lineHeight: 25 },
  month: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED, textTransform: "lowercase" },
  dot: {
    width: DOT, height: DOT, borderRadius: DOT / 2, marginLeft: DOT_GAP, marginRight: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: BG,
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: 14, overflow: "hidden", backgroundColor: "#2A2A2A", marginRight: 16 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: -0.3, color: FG },
  time: { fontFamily: "Inter_500Medium", fontSize: 15, color: MUTED, marginTop: 6 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(197,160,89,0.10)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.22)", alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: FG, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: MUTED, textAlign: "center" },
  emptyBtn: {
    marginTop: 8, height: 46, paddingHorizontal: 24, borderRadius: 14,
    backgroundColor: "rgba(197,160,89,0.14)", borderWidth: 1, borderColor: "rgba(197,160,89,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD },
});
