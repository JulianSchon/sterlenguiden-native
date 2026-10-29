/**
 * Mitt Österlen — streak överst (eld, siffra, nyckeltal, veckan).
 * Under streaken: Dina listor, Dina minnen och sist Samlarobjekt (längst, så listor och minnen ligger nära).
 *
 * Streaken räknas ur app_days (en rad per svensk kalenderdag med appöppning),
 * se src/lib/streak.ts.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import Reanimated, {
  Easing, FadeInDown, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withTiming,
} from "react-native-reanimated";
import { STORY_GRADIENT } from "@/theme/storyGradient";
import { withAlpha } from "@/theme/categories";
import { ArrowLeft } from "lucide-react-native";
import { Canvas, Circle, Group, LinearGradient, RadialGradient, vec } from "@shopify/react-native-skia";
import { Users, ChevronRight, X } from "lucide-react-native";
import { StreakFlame, stage } from "@/components/streak/StreakFlame";
import { useFriendRequestCount } from "@/hooks/useFriends";
import { PressableScale } from "@/components/PressableScale";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { StickersSection } from "@/components/stickers/StickersSection";
import { ListsSection } from "@/components/lists/ListsSection";
import { MemoriesSection } from "@/components/memories/MemoriesSection";
import { LeaderboardSection } from "@/components/leaderboard/LeaderboardSection";
import { useAppDays } from "@/hooks/useAppDays";
import { computeStreak, swedishDay, weekDays } from "@/lib/streak";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { formatDate, weekdayShort } from "@/i18n/dates";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { pushOnce } from "@/lib/navigateOnce";

// Gradientringen runt Vänner-ikonen — se friendsIconWrap
const FRIENDS_RING_SIZE = 56;
const FRIENDS_RING_R = 25;
// Elden tänds när sidan glidit klart in (högst så här länge efter att den öppnats)
const IGNITE_MS = 1200;
const IGNITE_FALLBACK_MS = 650;

export default function MittOsterlenScreen() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useTranslation(); // ritas om när språket byts
  const { data: days = [] } = useAppDays();
  const pendingFriendRequests = useFriendRequestCount();

  const today = swedishDay();
  const streak = useMemo(() => computeStreak(days, today), [days, today]);
  const week = weekDays(today);
  const daySet = useMemo(() => new Set(days), [days]);
  // Skatterna scrollar själva fram sig när en ny skatt ska klistras in i samlingen
  const scrollRef = useRef<ScrollView>(null);
  // Stabil funktion — annars startar skatternas inklistring om varje gång sidan ritas om
  const scrollTo = useCallback((y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true }), []);

  // Elden tänds nerifrån när sidan glidit in: blå gaslåga, sen smäller den upp. Glöden bakom
  // blossar upp med smällen och skuggan vid foten kommer med lågan.
  const navigation = useNavigation();
  const reduceMotion = useReducedMotion();
  const ignite = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      ignite.value = withTiming(1, { duration: IGNITE_MS, easing: Easing.linear });
    };
    const fallback = setTimeout(start, IGNITE_FALLBACK_MS);
    const unsubscribe = navigation.addListener("transitionEnd" as never, start);
    return () => { clearTimeout(fallback); unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glowStyle = useAnimatedStyle(() => {
    const flare = stage(ignite.value, 0.15, 0.24) * (1 - stage(ignite.value, 0.24, 0.6));
    return { opacity: stage(ignite.value, 0.15, 0.24), transform: [{ scale: 1 + 0.18 * flare }] };
  });
  const footShadow = useDerivedValue(() => stage(ignite.value, 0.15, 0.35));

  // Skatterna mäter sin plats inuti sitt omslag (inglidningen nedan) — omslagets egen plats läggs till
  const stickersY = useRef(0);
  const scrollToSticker = useCallback((y: number) => scrollTo(stickersY.current + y), [scrollTo]);

  // Från Statistik (rutan Skatter): sidan öppnas nere vid skatterna, alla utfällda. Sektionerna
  // ovanför laddar in sin data efter hand och flyttar skatterna nedåt, så sidan följer med en
  // kort stund efter att den öppnats
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const toTreasures = focus === "treasures";
  const openedAt = useRef(Date.now());
  const followTreasures = useCallback(() => {
    if (!toTreasures || Date.now() - openedAt.current > 1500) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, stickersY.current - 8), animated: false });
  }, [toTreasures]);


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Fast header — ligger utanför ScrollView så den stannar kvar vid scroll */}
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} accessibilityLabel={i18n.t("osterlen.back")}>
            <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{i18n.t("osterlen.title")}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        onContentSizeChange={followTreasures}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
      >

        <View style={s.hero}>
          {/* Fast storlek (elden själv är alltid 215×238) i stället för auto — annars är
              flameGlowAnchors procentbaserade left/top odefinierade mot en förälder utan egen
              höjd, vilket var därför glöden inte satt centrerad. */}
          <View style={{ width: 320, height: 238, alignItems: "center" }}>
            {/* Varm glöd bakom elden plus en mjuk skugga vid dess fot, så den känns som att den
                svävar en liten bit ovanför bakgrunden i stället för att ligga platt mot den. */}
            <Reanimated.View style={[s.flameGlowAnchor, glowStyle]} pointerEvents="none">
              <RadialGlow size={320} color="#FF9A1F" opacity={0.38} radiusRatio={0.55} />
            </Reanimated.View>
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Group origin={vec(107.5, 216)} transform={[{ scaleY: 0.22 }]} opacity={footShadow}>
                <Circle cx={107.5} cy={216} r={80}>
                  <RadialGradient c={vec(107.5, 216)} r={80} colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]} positions={[0, 1]} />
                </Circle>
              </Group>
            </Canvas>
            <StreakFlame size={215} ignite={ignite} />
          </View>
          <Reanimated.View entering={enterAt(0)} style={{ alignItems: "center" }}>
          <View style={s.numberWrap}>
            {/* Mjukt sken i bakgrundens färg bakom siffran så den syns mot elden. Tonar ut
                till helt transparent långt innan ytans kant — ingen synlig ruta. */}
            <Canvas style={s.scrim} pointerEvents="none">
              <Group origin={vec(170, 110)} transform={[{ scaleY: 0.6 }]}>
                <Circle cx={170} cy={110} r={72}>
                  <RadialGradient
                    c={vec(170, 110)}
                    r={72}
                    colors={[withAlpha(colors.bg, 0.65), withAlpha(colors.bg, 0.3), withAlpha(colors.bg, 0)]}
                    positions={[0, 0.45, 1]}
                  />
                </Circle>
              </Group>
            </Canvas>
            <Text style={s.number}>{streak.current}</Text>
          </View>
          <Text style={s.label}>{i18n.t("osterlen.streak")}</Text>
          <Text style={s.hint}>{i18n.t("osterlen.hint")}</Text>
          </Reanimated.View>
        </View>

        {/* Nyckeltal */}
        <Reanimated.View entering={enterAt(1)} style={s.stats}>
          <Stat
            value={streak.startedOn ? formatDate(streak.startedOn, "d MMM yyyy") : "–"}
            label={i18n.t("osterlen.started")}
          />
          <View style={s.statDivider} />
          <Stat value={String(streak.longest)} label={i18n.t("osterlen.longest")} />
        </Reanimated.View>

        {/* Veckan */}
        <Reanimated.View entering={enterAt(2)} style={s.card}>
          <Text style={s.cardTitle}>{i18n.t("osterlen.thisWeek")}</Text>
          <View style={s.weekRow}>
            {week.map((d, i) => {
              const done = daySet.has(d);
              const isToday = d === today;
              // En passerad dag utan appöppning är MISSAD (grå, kryss) — skiljer sig från en dag
              // som bara inte hänt än (idag om den inte öppnats, eller kommande dagar), där det
              // fortfarande kan bli en flamma. Datumsträngar ("YYYY-MM-DD") går att jämföra rakt av.
              const missed = !done && d < today;
              return (
                <View key={d} style={s.weekDay}>
                  <Text style={[s.weekLabel, isToday && { color: colors.text }]}>{weekdayShort(i).toUpperCase()}</Text>
                  <View style={s.weekSlot}>
                    {done ? (
                      <StreakFlame compact size={30} timeOffset={i * 700} />
                    ) : missed ? (
                      <View style={s.missedDay}>
                        <X size={14} color={colors.muted} strokeWidth={2.5} />
                      </View>
                    ) : (
                      <View style={s.emptyDay} />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </Reanimated.View>

        <Reanimated.View entering={enterAt(3)}>
        <PressableScale style={s.friendsTile} scale={0.97} onPress={() => pushOnce(router, "/friends")}>
          <View style={s.friendsIconWrap}>
            {/* Gradientring runt ikonen i berättelsernas egna färger och riktning, exakt som ringen
                runt nya berättelser på Hem: gult nere till vänster → orange uppe till höger. Ingen
                rosa, så den inte liknar Instagram. */}
            <Canvas style={{ position: "absolute", width: FRIENDS_RING_SIZE, height: FRIENDS_RING_SIZE }} pointerEvents="none">
              <Circle cx={FRIENDS_RING_SIZE / 2} cy={FRIENDS_RING_SIZE / 2} r={FRIENDS_RING_R} style="stroke" strokeWidth={2.5}>
                <LinearGradient
                  start={vec(FRIENDS_RING_SIZE / 2 - FRIENDS_RING_R, FRIENDS_RING_SIZE / 2 + FRIENDS_RING_R)}
                  end={vec(FRIENDS_RING_SIZE / 2 + FRIENDS_RING_R, FRIENDS_RING_SIZE / 2 - FRIENDS_RING_R)}
                  colors={STORY_GRADIENT.stops.map((st) => st.color)}
                  positions={STORY_GRADIENT.stops.map((st) => parseFloat(st.offset) / 100)}
                />
              </Circle>
            </Canvas>
            <View style={s.friendsIcon}>
              <Users size={20} color={colors.text} strokeWidth={2} />
            </View>
            {pendingFriendRequests > 0 && (
              <View style={s.friendsBadge}>
                <Text style={s.friendsBadgeText}>{pendingFriendRequests > 9 ? "9+" : pendingFriendRequests}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.friendsTitle}>{i18n.t("osterlen.friends")}</Text>
            <Text style={s.friendsSub}>
              {pendingFriendRequests > 0
                ? pendingFriendRequests === 1 ? i18n.t("osterlen.pendingOne") : i18n.t("osterlen.pendingOther", { count: pendingFriendRequests })
                : i18n.t("osterlen.friendsHint")}
            </Text>
          </View>
          {/* Utan den här kunde ringen längst till vänster lätt läsas som "dina vänners avatarer
              kommer synas här", inte en ren navigeringsrad */}
          <ChevronRight size={20} color={colors.muted} strokeWidth={2} />
        </PressableScale>
        </Reanimated.View>

        {/* Direkt under Vänner — det sociala ("jag och andra") samlat överst, före det egna
            innehållet (listor, minnen, samlarobjekt) */}
        <Reanimated.View entering={enterAt(4)}><LeaderboardSection /></Reanimated.View>
        <Reanimated.View entering={enterAt(5)}><ListsSection /></Reanimated.View>
        <Reanimated.View entering={enterAt(6)}><MemoriesSection /></Reanimated.View>
        <Reanimated.View entering={enterAt(7)} onLayout={(e) => { stickersY.current = e.nativeEvent.layout.y; followTreasures(); }}>
          <StickersSection scrollTo={scrollToSticker} startExpanded={toTreasures} />
        </Reanimated.View>
      </ScrollView>
    </View>
  );
}

/** Snabb inglidning uppifrån och ner, kort efter varandra (samma som Favoriter och Förmåner) */
const enterAt = (index: number) => FadeInDown.delay(index * 45).duration(300);

function Stat({ value, label }: { value: string; label: string }) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: c.fill,
    borderWidth: 1, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  // Versal geometrisk sans med luft mellan bokstäverna, vänsterställd bredvid tillbaka-knappen
  title: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: c.text },
  // paddingTop 20 är eldens fasta plats (rör inte den) — hero klipper i stället sina egna barn vid
  // sin övre kant (overflow: hidden), exakt där den fasta headern slutar. Glöden får då vara hur
  // stor den vill utan att någonsin synas krocka med headern: allt ovanför klipps helt enkelt bort,
  // och eftersom headern redan är samma solida bakgrundsfärg syns klippningen aldrig som en kant.
  hero: { alignItems: "center", paddingTop: 20, overflow: "hidden" },
  // Ankaret måste vara exakt lika stort som RadialGlows egen size-prop (320) — annars centrerar
  // RadialGlows inbyggda -pad-matte fel, samma bugg som gjorde att glöden inte satt centrerad
  // förut. Samma knep som Vänner-plattans gradientring: RadialGlow förutsätter en kvadratisk
  // förälder och elden är inte kvadratisk, så vi ger den ett eget kvadratiskt ankare i stället.
  // -20 på top flyttar glöden lite högre än ren mittcentrering.
  flameGlowAnchor: { position: "absolute", left: (320 - 320) / 2, top: (238 - 320) / 2 + 10, width: 320, height: 320 },
  // Siffran sitter över eldens nedre del, som på Whoop
  numberWrap: { marginTop: -69, width: 340, height: 100, alignItems: "center", justifyContent: "center" },
  scrim: { position: "absolute", left: 0, top: -60, width: 340, height: 220 },
  number: { fontFamily: "Inter_700Bold", fontSize: 92, color: c.text, lineHeight: 100 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 24, color: c.text, marginTop: 20 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 15, color: c.muted, marginTop: 6 },

  stats: { flexDirection: "row", alignItems: "center", marginTop: 28, marginHorizontal: 16 },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 17, color: c.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: c.borderStrong },

  card: {
    marginTop: 20, marginHorizontal: 16, padding: 18, borderRadius: 20,
    backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border,
  },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 1.4, color: c.text },
  weekRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  weekDay: { alignItems: "center", gap: 10, flex: 1 },
  weekSlot: { height: 41, alignItems: "center", justifyContent: "center" },
  weekLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, letterSpacing: 0.8, color: c.muted },
  emptyDay: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderStyle: "dashed", borderColor: c.borderStrong,
  },
  // Passerad dag, ingen appöppning — fylld grå med ett kryss, skiljer sig medvetet från den
  // streckade (ännu-inte-hänt) cirkeln ovan
  // Samma 30px som emptyDay ovan såg mindre ut i praktiken — en solid fylld yta läser optiskt som
  // mindre än en streckad kontur av samma nominella storlek, så den får vara lite större för att
  // kännas jämnstor
  missedDay: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: c.borderStrong, alignItems: "center", justifyContent: "center",
  },

  friendsTile: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginTop: 28, marginHorizontal: 16, padding: 16, borderRadius: 20,
    backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border,
  },
  // Ringen (Canvas) ligger centrerad bakom friendsIcon i den här — se FRIENDS_RING_SIZE/_R ovan
  friendsIconWrap: { width: FRIENDS_RING_SIZE, height: FRIENDS_RING_SIZE, alignItems: "center", justifyContent: "center" },
  friendsIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.tile, // nedsänkt platta, så den tunna gradientringen inte tävlar med ett kort
    alignItems: "center", justifyContent: "center",
  },
  friendsBadge: {
    position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: "#C0392B", alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
    borderWidth: 2, borderColor: c.bg,
  },
  friendsBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#FFFFFF" },
  // Playfair bort — bara för personnamn i appen numera, det här är en navigeringsetikett
  friendsTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, letterSpacing: -0.2, color: c.text },
  friendsSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, marginTop: 2 },
});
