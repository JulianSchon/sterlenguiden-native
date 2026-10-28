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
import { Skeleton } from "@/components/Skeleton";
import { format } from "date-fns";
import { useVisits, type Visit } from "@/hooks/useVisits";
import { usePlaces, firstImageUrl, type Place } from "@/hooks/usePlaces";
import { findCategory } from "@/theme/categories";
import { pushOnce } from "@/lib/navigateOnce";
import i18n from "i18next";
import { formatDate } from "@/i18n/dates";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


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
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Fast header, samma som Mitt Österlen */}
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} accessibilityLabel={i18n.t("historyPage.back")}>
            <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{i18n.t("historyPage.title")}</Text>
        </View>
      </View>

      {/* Tidslinjen i grått medan besöken laddas */}
      {isLoading && (
        <View style={{ paddingTop: 8 }} pointerEvents="none">
          <Skeleton width={230} height={14} radius={5} style={{ marginLeft: 16, marginBottom: 4 }} />
          <View style={s.yearRow}>
            <Skeleton width={120} height={46} radius={10} />
          </View>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={s.row}>
              <View style={[s.line, { top: 0, bottom: 0 }]} />
              <View style={[s.dateCol, { gap: 6 }]}>
                <Skeleton width={24} height={20} radius={5} />
                <Skeleton width={28} height={11} radius={4} />
              </View>
              {/* Solid botten så linjen inte syns genom pricken */}
              <View style={[s.dot, { backgroundColor: colors.bg }]}>
                <Skeleton width={DOT - 6} height={DOT - 6} radius={(DOT - 6) / 2} />
              </View>
              <View style={s.content}>
                <Skeleton width={THUMB} height={THUMB} radius={14} style={{ marginRight: 16 }} />
                <View style={{ flex: 1, gap: 9 }}>
                  <Skeleton width="75%" height={17} radius={6} />
                  <Skeleton width="50%" height={13} radius={5} />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {!isLoading && visitCount === 0 && (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Compass size={26} color={colors.goldText} strokeWidth={1.5} />
          </View>
          <Text style={s.emptyTitle}>{i18n.t("historyPage.emptyTitle")}</Text>
          <Text style={s.emptyText}>{i18n.t("historyPage.emptyText")}</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/(tabs)/explore")}>
            <Text style={s.emptyBtnText}>{i18n.t("historyPage.explore")}</Text>
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
            {i18n.t("historyPage.summary", { visits: visitCount, unique: uniqueCount, total: places.length })}
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
                onPress={() => pushOnce(router, `/place/${e.visit.place.id}?from=profile`)}
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
  const s = useThemedStyles(createStyles);
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
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
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
        <Text style={s.month}>{formatDate(when, "LLL").replace(".", "")}</Text>
      </Reanimated.View>
      <Reanimated.View style={[s.dot, { backgroundColor: category?.screen ?? colors.goldText }, dotStyle]}>
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
            {i18n.t("historyPage.at", { day: capitalize(formatDate(when, "EEEE")), time: format(when, "HH:mm") })}
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

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: c.text },

  summary: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.muted, paddingHorizontal: 16, marginBottom: 4 },

  // Tidslinjen: linjen ritas i varje rad, så den löper obruten genom hela listan
  line: { position: "absolute", left: LINE_X - 1, width: 2, backgroundColor: c.borderStrong },
  yearRow: { paddingLeft: LINE_X + DOT / 2 + DOT_GAP + 4, paddingTop: 26, paddingBottom: 14 },
  year: { fontFamily: "Montserrat_700Bold", fontSize: 48, letterSpacing: -1, color: c.text, opacity: 0.6 },

  row: { flexDirection: "row", alignItems: "center", paddingLeft: PAD, paddingRight: 16, height: ROW_H },
  content: { flex: 1, flexDirection: "row", alignItems: "center", transformOrigin: "left center" },
  // Dagen och månaden centrerade över varandra
  dateCol: { width: DATE_W, alignItems: "center" },
  day: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: c.text, lineHeight: 25 },
  month: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted, textTransform: "lowercase" },
  dot: {
    width: DOT, height: DOT, borderRadius: DOT / 2, marginLeft: DOT_GAP, marginRight: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: c.bg,
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: 14, overflow: "hidden", backgroundColor: c.fill, marginRight: 16 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: c.text },
  time: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.muted, marginTop: 5 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: c.goldSoft,
    borderWidth: 1, borderColor: c.goldBorder, alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: c.text, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: c.muted, textAlign: "center" },
  emptyBtn: {
    marginTop: 8, height: 46, paddingHorizontal: 24, borderRadius: 14,
    backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.goldBorder,
    alignItems: "center", justifyContent: "center",
  },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.goldText },
});
