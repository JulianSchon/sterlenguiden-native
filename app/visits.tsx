/**
 * Historik — alla besök som en tidslinje, senaste överst. Samma känsla som minnena: allt ligger
 * direkt mot bakgrunden längs en tunn grå linje, inga kort.
 *
 * Varje besök: datumet till vänster om linjen, en rund prick PÅ linjen i platsens kategorifärg med
 * kategorins symbol, och till höger platsens bild med namnet och klockslaget under. Vid varje
 * årsskifte ett stort årtal som avdelare (överst står årets tal för de senaste besöken).
 *
 * Som minnena är det besök man scrollat fram till störst: när en rad passerar fokuslinjen (där
 * första besöket står från början) växer bilden och texten till full storlek, och raderna ovanför
 * och nedanför krymper och tonas ned ju längre bort de är. Allt styrs av scrollen på
 * animationstråden.
 *
 * Besök utan matchande plats göms. Header som Mitt Österlen.
 */
import { useMemo } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet, useWindowDimensions } from "react-native";
import Reanimated, {
  Extrapolation, FadeInDown, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue,
} from "react-native-reanimated";
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
const THUMB = 104;
/** Radens fasta höjd (rymmer bilden i full storlek) */
const ROW_H = THUMB + 24;
/** Så långt från fokus (px) en rad krymper till minsta storlek */
const FOCUS_RANGE = ROW_H * 2.2;
const MIN_SCALE = 0.66;
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
  const { height } = useWindowDimensions();
  const { data: visits = [], isLoading: visitsLoading } = useVisits();
  // Scrollen och fokuslinjen (mitten på första besöket, mätt när det ritats)
  const scrollY = useSharedValue(0);
  const focusY = useSharedValue(200);
  const onScroll = useAnimatedScrollHandler({ onScroll: (e) => { scrollY.value = e.contentOffset.y; } });
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
        <Reanimated.ScrollView
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          // Luft under sista besöket så även det kan scrollas upp till fokuslinjen
          contentContainerStyle={{ paddingTop: 8, paddingBottom: Math.max(insets.bottom + 40, height * 0.62) }}
        >
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
                scrollY={scrollY}
                focusY={focusY}
                onPress={() => pushOnce(router, `/place/${e.visit.place.id}`)}
              />
            )
          )}
        </Reanimated.ScrollView>
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
function VisitRow({ visit, index, last, scrollY, focusY, onPress }: {
  visit: VisitedPlace; index: number; last: boolean; scrollY: SharedValue<number>; focusY: SharedValue<number>; onPress: () => void;
}) {
  const when = new Date(visit.visited_at);
  // Radens läge i listan (mätt), och hur långt dess mitt är från fokuslinjen just nu
  const rowY = useSharedValue(0);
  const focusStyle = useAnimatedStyle(() => {
    const dist = Math.abs(rowY.value + ROW_H / 2 - scrollY.value - focusY.value);
    return {
      opacity: interpolate(dist, [0, FOCUS_RANGE], [1, 0.5], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(dist, [0, FOCUS_RANGE], [1, MIN_SCALE], Extrapolation.CLAMP) }],
    };
  });
  const dotStyle = useAnimatedStyle(() => {
    const dist = Math.abs(rowY.value + ROW_H / 2 - scrollY.value - focusY.value);
    return { transform: [{ scale: interpolate(dist, [0, FOCUS_RANGE], [1, 0.72], Extrapolation.CLAMP) }] };
  });
  const dateStyle = useAnimatedStyle(() => {
    const dist = Math.abs(rowY.value + ROW_H / 2 - scrollY.value - focusY.value);
    return { opacity: interpolate(dist, [0, FOCUS_RANGE], [1, 0.45], Extrapolation.CLAMP) };
  });
  const category = findCategory(visit.place.categories?.split(",")[0] ?? null);
  const Icon = category?.icon ?? MapPin;
  const image = firstImageUrl(visit.place.image_url);
  const content = (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <View style={[s.line, { top: 0, bottom: last ? "50%" : 0 }]} />
      <Reanimated.View style={[s.dateCol, dateStyle]}>
        <Text style={s.day}>{format(when, "d")}</Text>
        <Text style={s.month}>{format(when, "MMM", { locale: sv }).replace(".", "")}</Text>
      </Reanimated.View>
      <Reanimated.View style={[s.dot, { backgroundColor: category?.screen ?? GOLD }, dotStyle]}>
        <Icon size={18} color="#FFFFFF" strokeWidth={2.2} />
      </Reanimated.View>
      {/* Bilden och texten krymper mot linjen (vänsterkanten står still) */}
      <Reanimated.View style={[s.content, focusStyle]}>
        <View style={s.thumb}>
          {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={2}>{visit.place.name}</Text>
          <Text style={s.time} numberOfLines={1}>
            {capitalize(format(when, "EEEE", { locale: sv }))} kl. {format(when, "HH:mm")}
          </Text>
        </View>
      </Reanimated.View>
    </TouchableOpacity>
  );
  return (
    <Reanimated.View
      entering={index < ANIMATED_ROWS ? FadeInDown.delay(index * 40).duration(320) : undefined}
      onLayout={(e) => {
        rowY.value = e.nativeEvent.layout.y;
        // Fokuslinjen: där första besöket står från början
        if (index === 0) focusY.value = e.nativeEvent.layout.y + ROW_H / 2;
      }}
    >
      {content}
    </Reanimated.View>
  );
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
  year: { fontFamily: "Montserrat_700Bold", fontSize: 48, letterSpacing: -1, color: FG, opacity: 0.6 },

  row: { flexDirection: "row", alignItems: "center", paddingLeft: PAD, paddingRight: 16, height: ROW_H },
  content: { flex: 1, flexDirection: "row", alignItems: "center", transformOrigin: "left center" },
  // Dagen och månaden centrerade över varandra
  dateCol: { width: DATE_W, alignItems: "center" },
  day: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: FG, lineHeight: 25 },
  month: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED, textTransform: "lowercase" },
  dot: {
    width: DOT, height: DOT, borderRadius: DOT / 2, marginLeft: DOT_GAP, marginRight: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: BG,
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: 14, overflow: "hidden", backgroundColor: "#2A2A2A", marginRight: 16 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: FG },
  time: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED, marginTop: 5 },

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
