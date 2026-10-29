/**
 * Statistik — vad man upptäckt på Österlen. Samma mörka stil som Mitt Österlen och Historik:
 * header med rubriken i versaler, innehållet direkt mot bakgrunden och solida kort.
 *
 *  1. Hur mycket av Österlen man upptäckt: stort tal, en stapel och andel i procent.
 *  2. Sex rutor, var och en med appens egen symbol i färg: besök (kartans gröna nål), favoriter
 *     (det röda hjärtat), minnen (ett litet polaroidkort), skatter (skatternas lila nål med guld-
 *     stjärna), utmaningar (Österlenlegendens guldtrofé) och längsta streak (den riktiga elden).
 *  3. Besök per månad (sex månader): en mjuk kurva med fylld yta under, den här månaden markerad
 *     och en streckad linje för snittet (ScrubChart, samma som företagens statistik). Nudda kurvan
 *     och dra åt sidan för att se varje månads besök.
 *  4. Dina dagar: besök per veckodag som staplar, den vanligaste dagen i guld.
 *  5. Kategorierna: alla åtta i sina egna färger, hur många man besökt av hur många som finns.
 *  6. Mest besökta platsen.
 *
 * Siffrorna kommer från samma källor som resten av appen (besök räknas som unika platser i
 * Utmaningar och topplistorna; här visas även alla besök).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet } from "react-native";
import Reanimated, {
  Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";
import Svg, { Path as SvgPath, Rect, Circle as SvgCircle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Heart } from "lucide-react-native";
import { Skeleton } from "@/components/Skeleton";
import { ScrubChart } from "@/components/ScrubChart";
import { subMonths } from "date-fns";
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
import { TreasurePin } from "@/components/stickers/TreasurePin";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { formatDate, weekdayShort } from "@/i18n/dates";
import { decimal } from "@/i18n/numbers";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { Image as ExpoImage } from "expo-image";
import { PressableScale } from "@/components/PressableScale";

// Österlenlegendens guldtrofé — den man får för att klara allt
const TROPHY_ART = require("../assets/badges/osterlenlegend-gold.png");

// Samma röda som hjärtat på Favoriter
const HEART_RED = "#EF4444";

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

interface MonthPoint { label: string; name: string; count: number }

export default function StatsScreen() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
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
  const { i18n: { language } } = useTranslation();
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
        label: formatDate(d, "LLL").replace(".", ""),
        name: capitalize(formatDate(d, "LLLL")),
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- språket: månadernas namn
  }, [visits, places, language]);

  const percent = places.length > 0 ? Math.round((stats.uniqueCount / places.length) * 100) : 0;
  const trophiesDone = trophies.filter((t) => t.done).length;
  const longestStreak = useMemo(() => computeStreak(days).longest, [days]);
  const treasures = collected?.size ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} accessibilityLabel={i18n.t("statsPage.back")}>
            <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{i18n.t("statsPage.title")}</Text>
        </View>
      </View>

      {isLoading ? (
        // Sidan i grått medan besöken laddas: stora siffran, rutorna och diagrammet
        <View style={s.body} pointerEvents="none">
          <View style={s.hero}>
            <Skeleton width={180} height={12} radius={5} />
            <Skeleton width={190} height={52} radius={10} />
            <Skeleton width="100%" height={10} radius={5} />
            <Skeleton width={120} height={13} radius={5} />
          </View>
          <View style={s.tiles}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={s.tile}>
                <Skeleton width={26} height={26} radius={8} />
                <Skeleton width={42} height={20} radius={6} />
                <Skeleton width={62} height={11} radius={4} />
              </View>
            ))}
          </View>
          <Skeleton width={140} height={16} radius={5} style={{ marginTop: 30, marginBottom: 12 }} />
          <Skeleton width="100%" height={230} radius={18} />
        </View>
      ) : (
        <ScrollView
          scrollEnabled={!scrubbing}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 40 }]}
        >
          {/* 1. Hur mycket av Österlen */}
          <View style={s.hero}>
            <Text style={s.eyebrow}>{i18n.t("statsPage.discovered")}</Text>
            <View style={s.heroRow}>
              <Text style={s.heroValue}>{stats.uniqueCount}</Text>
              <Text style={s.heroOf}>{i18n.t("statsPage.ofPlaces", { count: places.length })}</Text>
            </View>
            <Bar fraction={places.length > 0 ? stats.uniqueCount / places.length : 0} color={colors.goldText} height={10} delay={60} />
            <Text style={s.heroPercent}>{i18n.t("statsPage.percent", { percent })}</Text>
          </View>

          {/* 2. Rutorna */}
          <View style={s.tiles}>
            {/* Varje ruta öppnar sin sida; bakåt därifrån kommer man tillbaka hit */}
            <Tile index={0} icon={<PlacePin height={25} />} value={stats.visitCount} label={i18n.t("statsPage.visits")} onPress={() => pushOnce(router, "/visits")} />
            <Tile index={1} icon={<Heart size={21} color={HEART_RED} fill={HEART_RED} strokeWidth={2} />} value={favorites.length} label={i18n.t("statsPage.favorites")} onPress={() => pushOnce(router, "/favorites")} />
            <Tile index={2} icon={<MiniPolaroid />} value={memories.length} label={i18n.t("statsPage.memories")} onPress={() => pushOnce(router, "/memories")} />
            <Tile index={3} icon={<TreasurePin height={25} />} value={`${treasures}/${collectibles.length || 24}`} label={i18n.t("statsPage.treasures")} onPress={() => pushOnce(router, "/mitt-osterlen?focus=treasures")} />
            <Tile index={4} icon={<Image source={TROPHY_ART} style={{ width: 27, height: 27 }} resizeMode="contain" />} value={`${trophiesDone}/${trophies.length}`} label={i18n.t("statsPage.challenges")} onPress={() => pushOnce(router, "/challenges")} />
            <Tile index={5} icon={<View style={{ marginTop: -4 }}><StreakFlame compact size={22} /></View>} value={longestStreak} label={i18n.t("statsPage.longestStreak")} onPress={() => pushOnce(router, "/mitt-osterlen")} />
          </View>

          {/* 3. Besök per månad */}
          <Text style={s.sectionTitle}>{i18n.t("statsPage.perMonth")}</Text>
          <View style={s.card}>
            <ScrubChart
              points={stats.months}
              latestTitle={i18n.t("statsPage.thisMonth")}
              valueText={(n) => (n === 1 ? i18n.t("statsPage.visitsOne") : i18n.t("statsPage.visitsOther", { count: n }))}
              averageTitle={i18n.t("statsPage.average")}
              averageText={(avg) => i18n.t("statsPage.averageValue", { value: decimal(avg) })}
              onScrubbing={setScrubbing}
            />
          </View>

          {/* 4. Dina dagar */}
          {stats.visitCount > 0 && (
            <>
              <Text style={s.sectionTitle}>{i18n.t("statsPage.yourDays")}</Text>
              <View style={s.card}>
                <WeekdayBars counts={stats.weekdays} />
              </View>
            </>
          )}

          {/* 5. Kategorierna */}
          <Text style={s.sectionTitle}>{i18n.t("statsPage.categories")}</Text>
          <View style={[s.card, { gap: 16 }]}>
            {stats.categories.map((c, i) => <CategoryRow key={c.id} cat={c} delay={200 + i * 60} />)}
          </View>

          {/* 6. Mest besökta platsen */}
          {stats.topPlace && (
            <>
              <Text style={s.sectionTitle}>{i18n.t("statsPage.favoritePlace")}</Text>
              <Text style={s.sectionSub}>{i18n.t("statsPage.topPlace")}</Text>
              <TouchableOpacity style={[s.card, s.topPlace]} activeOpacity={0.8} onPress={() => pushOnce(router, `/place/${stats.topPlace!.place.id}?from=profile`)}>
                <View style={s.topThumb}>
                  {firstImageUrl(stats.topPlace.place.image_url)
                    ? <ExpoImage source={{ uri: firstImageUrl(stats.topPlace.place.image_url)! }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.topName} numberOfLines={2}>{stats.topPlace.place.name}</Text>
                  <Text style={s.topCount}>
                    {stats.topPlace.count === 1 ? i18n.t("statsPage.timesOne") : i18n.t("statsPage.timesOther", { count: stats.topPlace.count })}
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

/** En ruta: symbol, stort värde, etikett — glider in kort efter varandra, tryck öppnar sidan */
function Tile({ icon, value, label, index, onPress }: { icon: ReactNode; value: number | string; label: string; index: number; onPress: () => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <Reanimated.View entering={FadeInDown.delay(40 + index * 35).duration(280)} style={s.tileSlot}>
      <PressableScale style={s.tile} scale={0.96} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        <View style={s.tileIcon}>{icon}</View>
        <Text style={s.tileValue}>{value}</Text>
        <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
      </PressableScale>
    </Reanimated.View>
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

/** En stapel som fylls från vänster när sidan öppnas */
function Bar({ fraction, color, height = 8, delay = 0 }: { fraction: number; color: string; height?: number; delay?: number }) {
  const s = useThemedStyles(createStyles);
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(delay, withTiming(Math.max(0, Math.min(1, fraction)), { duration: 550, easing: Easing.out(Easing.quad) }));
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
  const s = useThemedStyles(createStyles);
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

const WEEK_H = 90;

/** Besök per veckodag som staplar — höjden efter antalet, den vanligaste dagen i guld */
function WeekdayBars({ counts }: { counts: number[] }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const top = Math.max(...counts);
  const max = Math.max(1, top);
  // Alla dagar som delar förstaplatsen (1 på lördag och 1 på söndag är lika — då är man inte
  // "mest ute på lördagar")
  const best = top > 0 ? counts.flatMap((c, i) => (c === top ? [i] : [])) : [];
  const isBest = (i: number) => best.includes(i);
  const weekend = best.length === 2 && best[0] === 5 && best[1] === 6;
  const plural = i18n.t("statsPage.weekdayPlural").split("|");
  const names = best.map((i) => plural[i]);
  const list = names.length > 1 ? i18n.t("place.and", { a: names.slice(0, -1).join(", "), b: names[names.length - 1] }) : names[0];
  // "Du är mest ute på <dagarna>" / "Du bist am meisten <montags> unterwegs": text före och efter
  const [before, after] = best.length > 1 && !weekend
    ? [i18n.t("statsPage.equallyBefore"), i18n.t("statsPage.equallyAfter")]
    : [i18n.t("statsPage.mostlyBefore"), i18n.t("statsPage.mostlyAfter")];
  return (
    <View>
      {best.length === 0 ? (
        <Text style={s.weekText}>{i18n.t("statsPage.noVisits")}</Text>
      ) : (
        <Text style={s.weekText}>{before}<Text style={{ color: colors.goldText }}>{weekend ? i18n.t("statsPage.weekends") : list}</Text>{after}</Text>
      )}
      <View style={s.weekRow}>
        {counts.map((c, i) => (
          <View key={i} style={s.weekCol}>
            <Text style={[s.weekCount, isBest(i) && { color: colors.goldText }]}>{c}</Text>
            <View style={s.weekArea}>
              <WeekBar fraction={c / max} highlight={isBest(i)} delay={150 + i * 50} />
            </View>
            <Text style={[s.weekLabel, isBest(i) && { color: colors.text }]}>{capitalize(weekdayShort(i))}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** En stapel som växer upp från botten. En dag utan besök blir en låg stump, inte en tom stapel. */
function WeekBar({ fraction, highlight, delay }: { fraction: number; highlight: boolean; delay: number }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(delay, withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }));
  }, [delay, grow]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));
  const h = fraction > 0 ? Math.max(10, fraction * WEEK_H) : 5;
  return (
    <Reanimated.View
      style={[
        s.weekBar,
        { height: h, backgroundColor: highlight ? colors.goldText : fraction > 0 ? colors.faint : colors.border },
        style,
      ]}
    />
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: c.text },
  muted: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted },

  body: { paddingHorizontal: 16, paddingTop: 8 },

  hero: { gap: 10, marginBottom: 22 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 2.2, color: c.goldText },
  heroRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  heroValue: { fontFamily: "Montserrat_700Bold", fontSize: 56, letterSpacing: -1.5, color: c.text, lineHeight: 62 },
  heroOf: { fontFamily: "Inter_500Medium", fontSize: 16, color: c.muted },
  heroPercent: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.goldText },
  track: { backgroundColor: c.border, overflow: "hidden" },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tileSlot: { width: "31.6%", flexGrow: 1 },
  tile: {
    borderRadius: 16, padding: 14, gap: 6,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  // Lika hög plats för alla symboler, så värdena hamnar i linje
  tileIcon: { height: 26, justifyContent: "center", alignItems: "flex-start" },
  tileValue: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: c.text, marginTop: 2 },
  tileLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.muted },

  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, letterSpacing: -0.2, color: c.text, marginTop: 30, marginBottom: 12 },
  sectionSub: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.muted, marginTop: -8, marginBottom: 12 },
  card: { borderRadius: 18, padding: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },


  weekText: { fontFamily: "Inter_500Medium", fontSize: 14.5, color: c.text, marginBottom: 14 },
  weekRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  weekCol: { flex: 1, alignItems: "center", gap: 6 },
  weekCount: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.muted },
  weekArea: { width: "100%", maxWidth: 30, height: WEEK_H, justifyContent: "flex-end" },
  weekBar: { width: "100%", borderRadius: 8, transformOrigin: "bottom" },
  weekLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.muted },

  catRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  catDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  catTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  catName: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.text },
  catCount: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted },

  topPlace: { flexDirection: "row", alignItems: "center", gap: 14 },
  topThumb: { width: 72, height: 72, borderRadius: 14, overflow: "hidden", backgroundColor: c.fill },
  topName: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: c.text },
  topCount: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.goldText, marginTop: 4 },
});
