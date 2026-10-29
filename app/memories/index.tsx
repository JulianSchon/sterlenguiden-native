/**
 * Österlenboken: alla minnen i en vertikal, bubblig tidslinje i stället för en vanlig lista med
 * säsongskapitel (den gamla vyn). Varje minne är en cirkel, nyast överst, bundna till varandra
 * av en tunn linje som ett pärlband — INTE rakt nedåt, utan en lätt slingrande väg (varje cirkel
 * har en egen, fast sidledes förskjutning efter en sinuskurva på sitt index, så de aldrig
 * staplas i en helt rak kolumn). En varm glöd i användarens EGEN Österlenpass-färg (samma
 * färgkälla som glöden bakom profilringen på en väns sida, se friend/[id].tsx) ligger bakom allt
 * — gör sidan personlig utan att hårdkoda en egen färg.
 *
 * Sidans egen kromning (bakåtpilen, +) ligger UTANFÖR scrollytan och rör sig aldrig — det är
 * cirkelraden som har en fast yta att scrolla INUTI, inte sidan som scrollar som helhet. Vilken
 * cirkel som helst som passerar en fokuszon nära toppen av den ytan blir den aktiva: den växer
 * mycket större än de andra, och dess titel/datum/antal foton/antal platser tonar in bredvid
 * den, medan grannarna krymper och deras text tonar bort. Varje cirkel har också en tunn ring
 * med ett tomt mellanrum mot fotot — när cirkeln är aktiv fylls det mellanrummet med en svag,
 * grå glöd (en egen "vald"-markering, skild från själva storleksändringen). Allt är direkt
 * kopplat till scrollpositionen (ingen egen timing-animation ovanpå) — det är därför det känns
 * som att MAN SJÄLV drar innehållet förbi en fast punkt, inte att man scrollar en sida.
 *
 * Det som gör det till MINA minnen och inte en lista: den aktiva cirkeln får en guldring och två
 * av minnets andra bilder lagda intill sig som en liten hög, och bredvid står berättelsen (början
 * av den), platsen och vilka som var med — inte bara antal foton. Tråden är prickad som en
 * resväg, och där ett nytt år börjar står årtalet på tråden, så man ser åren gå bakåt. Överst
 * står hur många minnen man har och från vilka år.
 */
import { useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation,
  withDelay, withTiming, Easing,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Polyline } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus, Image as ImageIcon, MapPin, Users } from "lucide-react-native";
import { useMemories, useSignedUrls, type Memory } from "@/hooks/useMemories";
import { useProfile } from "@/hooks/useProfile";
import { usePlaces } from "@/hooks/usePlaces";
import { formatMemoryDate } from "@/lib/memories";
import { useCardVariant } from "@/hooks/useRewardCards";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { LoadingImage, Skeleton } from "@/components/Skeleton";
import { PressableScale } from "@/components/PressableScale";
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { pushOnce } from "@/lib/navigateOnce";

const CIRCLE_BASE_LEFT = 20;
/** Hur många av minnets bilder som syns: omslaget i cirkeln och två till intill den */
const PHOTOS_SHOWN = 3;

/** "Anna, Erik och Olivia". Äldre minnen kan ha alla namn i ett enda element med kommatecken
 * (se samma uppdelning i memories/[id].tsx). */
function peopleLine(people: string[]): string {
  const names = people.flatMap((p) => p.split(",")).map((n) => n.trim()).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${i18n.t("memories.and")} ${names[names.length - 1]}`;
}

/** Sidledes förskjutning för cirkel `i` INOM sin egen sida — en fast (inte scroll-beroende)
 * sinuskurva, så vägen genom alla minnen slingrar naturligt i stället för att gå i en rak
 * kolumn. 1.7 radianer per steg ger en sekvens som inte känns som ett enkelt
 * vänster-höger-vänster-mönster. */
function wobbleX(i: number, amplitude: number): number {
  return Math.sin(i * 1.7) * amplitude;
}

/** Varannat minne ligger till vänster (cirkel vänster, text höger om) och varannat till höger
 * (cirkel höger, text vänster om) — inte bara en liten slingring inom samma sida. Returnerar
 * cirkelns MITTPUNKT i x-led, oavsett sida, så tråden (polyline) och varje cirkel/text alltid
 * utgår från samma siffra. */
function circleCenterX(i: number, width: number, maxSize: number, amplitude: number): number {
  const onRight = i % 2 === 1;
  const base = onRight ? width - CIRCLE_BASE_LEFT - maxSize / 2 : CIRCLE_BASE_LEFT + maxSize / 2;
  // Wobblar "inåt" mot mitten på båda sidor i stället för att riskera köra cirkeln utanför
  // skärmkanten på höger sida.
  const wobble = wobbleX(i, amplitude) * (onRight ? -1 : 1);
  return base + wobble;
}

export default function MemoriesBookScreen() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { data: memories = [], isLoading } = useMemories();
  const { data: profile } = useProfile();
  const { data: places = [] } = usePlaces();
  const { data: urls = {} } = useSignedUrls(memories.flatMap((m) => m.photoPaths.slice(0, PHOTOS_SHOWN)));
  const placeName = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);

  // Överst: "12 minnen · 2024–2026" (nyast först, så sista minnet är det äldsta)
  const summary = useMemo(() => {
    if (memories.length === 0) return "";
    const newest = memories[0].memoryDate.slice(0, 4);
    const oldest = memories[memories.length - 1].memoryDate.slice(0, 4);
    const count = memories.length === 1 ? i18n.t("memories.countOne") : i18n.t("memories.countOther", { count: memories.length });
    return `${count} · ${newest === oldest ? newest : `${oldest}–${newest}`}`;
  }, [memories]);
  // Där ett nytt (äldre) år börjar står årtalet på tråden. Det första årtalet syns redan överst.
  const yearStarts = useMemo(
    () => memories.flatMap((m, i) => (i > 0 && m.memoryDate.slice(0, 4) !== memories[i - 1].memoryDate.slice(0, 4) ? [{ i, year: m.memoryDate.slice(0, 4) }] : [])),
    [memories]
  );

  // Exakt samma färg som kortet, ingen toning mot vitt — se samma fix i friend/[id].tsx.
  const glowColor = useCardVariant(profile?.card_color).bg;

  // Storlekarna är satta i förhållande till skärmbredden (den aktiva cirkeln ska dominera ytan,
  // som i referensen, men inte så stor att titeln knappt får plats bredvid den), inte fasta
  // pixelvärden — annars blir den löjligt stor på en liten skärm eller för liten på en stor.
  const MAX_SIZE = Math.round(width * 0.46);
  const MIN_SIZE = Math.round(MAX_SIZE * 0.38);
  const ITEM_H = Math.round(MAX_SIZE * 1.25);
  const FOCUS_RANGE = ITEM_H * 1.3;
  const GAP = Math.round(MAX_SIZE * 0.07);
  const WOBBLE_AMPLITUDE = Math.round(MAX_SIZE * 0.14);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  // Fokuszonen: var i ytan (räknat från scrollytans egen topp) en cirkel räknas som "aktiv".
  // Måste räknas från ITEM_H (radens höjd), inte MAX_SIZE — annars blir "spacer" nedan negativ
  // (ITEM_H > MAX_SIZE sedan raderna gjordes höga nog att rymma den stora cirkeln utan att
  // grannraderna krockar). +56 (inte bara +24) ger den aktiva cirkeln luft att inte krocka
  // visuellt med de flytande pil tbx/+-knapparna uppe i hörnen.
  const focusY = ITEM_H / 2 + 56;

  // Exakt så mycket extra utrymme nedanför sista cirkeln som krävs för att kunna dra den hela
  // vägen upp till fokuszonen, plus en liten marginal — INTE en hel skärmhöjd (det gick tidigare
  // att scrolla långt förbi sista minnet in i tomrummet).
  const viewportH = height - insets.top;
  const scrollPadBottom = Math.max(40, viewportH - ITEM_H / 2 - focusY + 32);

  // Pärlbandets tråd — en enda polyline genom alla cirklars FAKTISKA mittpunkter (samma
  // circleCenterX som varje cirkel själv använder, så linjen alltid möter cirkeln exakt i dess
  // mitt, oavsett vilken sida den ligger på).
  const threadPoints = useMemo(
    () => memories
      .map((_, i) => {
        const cx = circleCenterX(i, width, MAX_SIZE, WOBBLE_AMPLITUDE);
        const cy = ITEM_H / 2 + i * ITEM_H;
        return `${cx},${cy}`;
      })
      .join(" "),
    [memories, WOBBLE_AMPLITUDE, MAX_SIZE, ITEM_H, width]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Varm glöd i användarens egen passfärg, ankrad högst upp — bleknar neråt i mörkret. */}
      <View style={{ position: "absolute", top: -width * 1.7 * 0.62, left: (width - width * 1.7) / 2 }} pointerEvents="none">
        <RadialGlow size={width * 1.7} color={glowColor} opacity={0.55} radiusRatio={1} />
      </View>

      {isLoading ? (
        // Pärlbandet i grått medan minnena laddas: den stora cirkeln i fokus, mindre under
        <View style={{ paddingTop: insets.top + focusY - ITEM_H / 2 }} pointerEvents="none">
          {[1, 0.49, 0.38].map((scale, i) => {
            const size = Math.round(MAX_SIZE * scale);
            const cx = circleCenterX(i, width, MAX_SIZE, WOBBLE_AMPLITUDE);
            return (
              <View key={i} style={{ height: ITEM_H }}>
                <Skeleton width={size} height={size} radius={size / 2} style={{ position: "absolute", left: cx - size / 2, top: (ITEM_H - size) / 2 }} />
                {i === 0 && (
                  <View style={[s.beadText, { left: cx + MAX_SIZE / 2 + 16, right: 16, gap: 8 }]}>
                    <Skeleton width="85%" height={19} radius={6} />
                    <Skeleton width="55%" height={12} radius={5} />
                    <Skeleton width="45%" height={12} radius={5} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : memories.length === 0 ? (
        <View style={[s.emptyWrap, { paddingTop: insets.top + 120 }]}>
          <Text style={s.emptyTitle}>{i18n.t("memories.emptyTitle")}</Text>
          <Text style={s.emptyText}>{i18n.t("memories.emptyText")}</Text>
          <PressableScale style={s.emptyBtn} onPress={() => pushOnce(router, "/memories/edit")}>
            <Text style={s.emptyBtnText}>{i18n.t("memories.emptyCta")}</Text>
          </PressableScale>
        </View>
      ) : (
        <Animated.ScrollView
          style={{ flex: 1, paddingTop: insets.top }}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: scrollPadBottom }}
          showsVerticalScrollIndicator={false}
        >
          {/* Överst, mellan bakåtpilen och +: hur många minnen och från vilka år. Ligger i
              scrollytan (inte i den flytande raden), så cirklarna aldrig glider in under texten */}
          <View style={[s.header, { height: focusY - ITEM_H / 2 }]}>
            <Text style={s.headerTitle} numberOfLines={1}>{i18n.t("memories.yours")}</Text>
            <Text style={s.headerSub} numberOfLines={1}>{summary}</Text>
          </View>
          <View style={{ position: "relative", height: memories.length * ITEM_H }}>
            {memories.length > 1 && (
              <Svg width={width} height={memories.length * ITEM_H} style={StyleSheet.absoluteFillObject} pointerEvents="none">
                {/* Prickad, som en resväg på en karta */}
                <Polyline
                  points={threadPoints}
                  fill="none"
                  stroke={colors.faint}
                  strokeWidth={3}
                  strokeDasharray="0.1 9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            )}
            {/* Årtalet där ett nytt år börjar, på tråden mellan två minnen */}
            {yearStarts.map(({ i, year }) => (
              <View key={year} style={[s.yearRow, { top: i * ITEM_H - 13 }]} pointerEvents="none">
                <View style={s.yearPill}>
                  <Text style={s.yearText}>{year}</Text>
                </View>
              </View>
            ))}
            {memories.map((m, i) => {
              const cx = circleCenterX(i, width, MAX_SIZE, WOBBLE_AMPLITUDE);
              return (
                <MemoryBead
                  key={m.id}
                  memory={m}
                  photos={m.photoPaths.slice(0, PHOTOS_SHOWN).map((p) => urls[p]).filter((u): u is string => !!u)}
                  place={m.placeIds.length > 0 ? placeName.get(m.placeIds[0]) : undefined}
                  morePlaces={m.placeIds.length - 1}
                  people={peopleLine(m.people)}
                  index={i}
                  scrollY={scrollY}
                  maxSize={MAX_SIZE}
                  minSize={MIN_SIZE}
                  itemH={ITEM_H}
                  focusRange={FOCUS_RANGE}
                  gap={GAP}
                  circleLeft={cx - MAX_SIZE / 2}
                  onRight={i % 2 === 1}
                  screenWidth={width}
                  onPress={() => pushOnce(router, `/memories/${m.id}`)}
                />
              );
            })}
          </View>
        </Animated.ScrollView>
      )}

      {/* Pil tbx och + flyter fritt ovanpå, inget eget header-fält som tar upp plats och
          trycker ner innehållet — bara de två runda knapparna, som på kartans flytande
          knappar. Låter glöden och cirklarna börja högre upp, närmare skärmens egen topp. */}
      <View style={[s.floatingRow, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => pushOnce(router, "/memories/edit")}>
          <Plus size={22} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MemoryBead({
  memory, photos, place, morePlaces, people, index, scrollY, maxSize, minSize, itemH, focusRange, gap, circleLeft, onRight, screenWidth, onPress,
}: {
  memory: Memory; photos: string[]; place: string | undefined; morePlaces: number; people: string;
  index: number; scrollY: SharedValue<number>;
  maxSize: number; minSize: number; itemH: number; focusRange: number; gap: number;
  circleLeft: number; onRight: boolean; screenWidth: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  // Cirkelns egen position i scrollytan är konstant (index * itemH); fokuszonen ligger kvar på
  // samma ställe i FÖNSTRET — så avståndet till fokus är helt enkelt skillnaden mellan hur långt
  // cirkeln FLYTTAT (index * itemH) och hur långt man SCROLLAT (scrollY.value).
  const circleStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index * itemH - scrollY.value);
    const scale = interpolate(dist, [0, focusRange * 0.5, focusRange], [1, 0.62, minSize / maxSize], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });
  // Guldringen (och de extra bilderna) syns bara när cirkeln är NÄRA fokus — en snävare zon än
  // storleksfallet, så det tydligt läses som en egen "vald"-markering, inte bara en spegling av
  // storleken.
  const activeStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index * itemH - scrollY.value);
    const opacity = interpolate(dist, [0, focusRange * 0.4], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });
  const textStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index * itemH - scrollY.value);
    const opacity = interpolate(dist, [0, focusRange * 0.55, focusRange], [1, 0, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const cover = photos[0];
  const photoSize = maxSize - gap * 2;
  const radius = maxSize / 2;
  const align = onRight ? "right" : "left";

  // Inladdningen: cirklarna ska droppa in en i taget i stället för att alla bara finnas där
  // direkt. En egen shared value, skild från scroll-läget — kör EN gång vid mount, med en
  // fördröjning som trappas upp per index (de som redan syns först animerar in först).
  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withDelay(index * 55, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: interpolate(entrance.value, [0, 1], [18, 0]) },
      { scale: interpolate(entrance.value, [0, 1], [0.88, 1]) },
    ],
  }));

  return (
    <Animated.View style={[s.row, { height: itemH }, entranceStyle]}>
      {/* PressableScale — samma tryck-krymper-lite-medan-man-håller-känsla som resten av appen,
          lagd OVANPÅ (inte i stället för) cirkelns egen scroll-styrda storleksändring: två olika
          lager, så de aldrig krockar. */}
      <PressableScale
        onPress={onPress}
        style={[s.circleOuter, { width: maxSize, height: maxSize, borderRadius: maxSize / 2, top: (itemH - maxSize) / 2, left: circleLeft }]}
      >
        <Animated.View style={[StyleSheet.absoluteFillObject, { borderRadius: maxSize / 2 }, circleStyle]}>
          {/* Ringen — tunn, alltid synlig */}
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: maxSize / 2, borderWidth: 1.5, borderColor: colors.borderStrong }]} />
          {/* Guldringen och ett svagt guldskimmer i mellanrummet — bara när cirkeln är vald */}
          <Animated.View style={[StyleSheet.absoluteFillObject, s.activeRing, { borderRadius: maxSize / 2 }, activeStyle]} />
          {/* Fotot, centrerat innanför mellanrummet */}
          <View style={{ position: "absolute", top: gap, left: gap, width: photoSize, height: photoSize, borderRadius: photoSize / 2, overflow: "hidden", backgroundColor: colors.border }}>
            {cover ? (
              <LoadingImage uri={cover} style={StyleSheet.absoluteFillObject} />
            ) : (
              <View style={s.noCover}>
                <ImageIcon size={Math.round(maxSize * 0.22)} color={colors.faint} strokeWidth={1.5} />
              </View>
            )}
          </View>
          {/* Minnets andra bilder, lagda intill cirkeln mot texten som en liten hög foton */}
          {photos.slice(1).map((uri, k) => {
            const size = Math.round(maxSize * (k === 0 ? 0.3 : 0.24));
            const angle = ((k === 0 ? 38 : 72) * Math.PI) / 180;
            const x = radius + Math.cos(angle) * radius * (onRight ? -1 : 1);
            const y = radius + Math.sin(angle) * radius;
            return (
              <Animated.View
                key={uri}
                style={[s.extraPhoto, { width: size, height: size, borderRadius: size / 2, left: x - size / 2, top: y - size / 2 }, activeStyle]}
              >
                <LoadingImage uri={uri} style={StyleSheet.absoluteFillObject} />
              </Animated.View>
            );
          })}
        </Animated.View>
      </PressableScale>

      {/* Spänner HELA radhöjden + centrerar sitt innehåll (i stället för att bara utgå från
          cirkelns egen övre kant) — texten hamnade annars ovanför mitten, inte i den, eftersom
          titel+datum+antal är mycket lägre än själva cirkeln.
          Höger om cirkeln på vänstersidans minnen, vänster om (höger-justerad) på
          högersidans — en spegling, inte bara samma layout flyttad. */}
      <Animated.View
        style={[
          s.beadText,
          onRight
            ? { left: 16, right: screenWidth - circleLeft + 16, alignItems: "flex-end" }
            : { left: circleLeft + maxSize + 16, right: 16, alignItems: "flex-start" },
          textStyle,
        ]}
        pointerEvents="none"
      >
        <Text style={[s.beadDate, { textAlign: align }]}>{formatMemoryDate(memory.memoryDate)}</Text>
        <Text style={[s.beadTitle, { textAlign: align }]} numberOfLines={2}>{memory.title}</Text>
        {!!memory.story?.trim() && (
          <Text style={[s.beadStory, { textAlign: align }]} numberOfLines={2}>{memory.story.trim()}</Text>
        )}
        {!!place && (
          <View style={s.beadLine}>
            <MapPin size={13} color={colors.muted} strokeWidth={2} />
            <Text style={s.beadLineText} numberOfLines={1}>{morePlaces > 0 ? `${place} +${morePlaces}` : place}</Text>
          </View>
        )}
        {!!people && (
          <View style={s.beadLine}>
            <Users size={13} color={colors.muted} strokeWidth={2} />
            <Text style={s.beadLineText} numberOfLines={1}>{people}</Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  floatingRow: {
    position: "absolute", left: 16, right: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  header: { alignItems: "center", justifyContent: "center", paddingTop: 8, marginHorizontal: 72 },
  headerTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: c.text },
  headerSub: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.muted, marginTop: 2 },
  emptyWrap: { alignItems: "center", paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: c.text, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 21, color: c.muted, textAlign: "center" },
  emptyBtn: { marginTop: 12, backgroundColor: c.gold, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.onGold },
  yearRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  yearPill: {
    paddingHorizontal: 12, height: 26, borderRadius: 13, justifyContent: "center",
    backgroundColor: c.bg, borderWidth: 1, borderColor: c.borderStrong,
  },
  yearText: { fontFamily: "Montserrat_700Bold", fontSize: 12, letterSpacing: 1, color: c.muted },

  row: { position: "relative", width: "100%" },
  circleOuter: { position: "absolute" },
  noCover: { flex: 1, alignItems: "center", justifyContent: "center" },
  activeRing: { borderWidth: 2, borderColor: c.gold, backgroundColor: c.goldSoft },
  extraPhoto: { position: "absolute", overflow: "hidden", borderWidth: 2.5, borderColor: c.bg, backgroundColor: c.border },
  // top/bottom:0 (hela radhöjden) + justifyContent:"center" — centrerar texten mot cirkelns
  // mittpunkt oavsett hur hög titel+datum+antal faktiskt blir, i stället för att bara utgå från
  // cirkelns övre kant (som läste som "ovanför mitten", inte i den).
  beadText: { position: "absolute", top: 0, bottom: 0, justifyContent: "center" },
  beadDate: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: c.goldText },
  beadTitle: { fontFamily: "Montserrat_700Bold", fontSize: 19, lineHeight: 23, color: c.text, marginTop: 4 },
  beadStory: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 6 },
  beadLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  beadLineText: { flexShrink: 1, fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.muted },
});
