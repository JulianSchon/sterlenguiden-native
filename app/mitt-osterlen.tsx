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
import { useNavigation, useRouter } from "expo-router";
import Reanimated, {
  Easing, FadeInDown, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withTiming,
} from "react-native-reanimated";
import { STORY_GRADIENT } from "@/theme/storyGradient";
import { ArrowLeft } from "lucide-react-native";
import { Canvas, Circle, Group, LinearGradient, RadialGradient, vec } from "@shopify/react-native-skia";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
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

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const CARD = "#1A1A1D";
const WEEKDAY_LABELS = ["MÅN", "TIS", "ONS", "TOR", "FRE", "LÖR", "SÖN"];
// Gradientringen runt Vänner-ikonen — se friendsIconWrap
const FRIENDS_RING_SIZE = 56;
const FRIENDS_RING_R = 25;
// Elden tänds när sidan glidit klart in (högst så här länge efter att den öppnats)
const IGNITE_MS = 1200;
const IGNITE_FALLBACK_MS = 650;

export default function MittOsterlenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    const unsubscribe = navigation.addListener("transitionEnd" as any, start);
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
        ref={scrollRef}
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
          <Text style={s.label}>Streak</Text>
          <Text style={s.hint}>Öppna appen varje dag</Text>
          </Reanimated.View>
        </View>

        {/* Nyckeltal */}
        <Reanimated.View entering={enterAt(1)} style={s.stats}>
          <Stat
            value={streak.startedOn ? format(new Date(streak.startedOn), "d MMM yyyy", { locale: sv }) : "–"}
            label="Streak startade"
          />
          <View style={s.statDivider} />
          <Stat value={String(streak.longest)} label="Längsta streak" />
        </Reanimated.View>

        {/* Veckan */}
        <Reanimated.View entering={enterAt(2)} style={s.card}>
          <Text style={s.cardTitle}>DEN HÄR VECKAN</Text>
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
                  <Text style={[s.weekLabel, isToday && { color: FG }]}>{WEEKDAY_LABELS[i]}</Text>
                  <View style={s.weekSlot}>
                    {done ? (
                      <StreakFlame compact size={30} timeOffset={i * 700} />
                    ) : missed ? (
                      <View style={s.missedDay}>
                        <X size={14} color={MUTED} strokeWidth={2.5} />
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
        <PressableScale style={s.friendsTile} scale={0.97} onPress={() => router.push("/friends")}>
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
              <Users size={20} color={FG} strokeWidth={2} />
            </View>
            {pendingFriendRequests > 0 && (
              <View style={s.friendsBadge}>
                <Text style={s.friendsBadgeText}>{pendingFriendRequests > 9 ? "9+" : pendingFriendRequests}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.friendsTitle}>Vänner</Text>
            <Text style={s.friendsSub}>
              {pendingFriendRequests > 0
                ? pendingFriendRequests === 1 ? "1 väntande förfrågan" : `${pendingFriendRequests} väntande förfrågningar`
                : "Lägg till vänner och se deras aktivitet"}
            </Text>
          </View>
          {/* Utan den här kunde ringen längst till vänster lätt läsas som "dina vänners avatarer
              kommer synas här", inte en ren navigeringsrad */}
          <ChevronRight size={20} color={MUTED} strokeWidth={2} />
        </PressableScale>
        </Reanimated.View>

        {/* Direkt under Vänner — det sociala ("jag och andra") samlat överst, före det egna
            innehållet (listor, minnen, samlarobjekt) */}
        <Reanimated.View entering={enterAt(4)}><LeaderboardSection /></Reanimated.View>
        <Reanimated.View entering={enterAt(5)}><ListsSection /></Reanimated.View>
        <Reanimated.View entering={enterAt(6)}><MemoriesSection /></Reanimated.View>
        <Reanimated.View entering={enterAt(7)} onLayout={(e) => { stickersY.current = e.nativeEvent.layout.y; }}>
          <StickersSection scrollTo={scrollToSticker} />
        </Reanimated.View>
      </ScrollView>
    </View>
  );
}

/** Snabb inglidning uppifrån och ner, kort efter varandra (samma som Favoriter och Förmåner) */
const enterAt = (index: number) => FadeInDown.delay(index * 45).duration(300);

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
  // Passerad dag, ingen appöppning — fylld grå med ett kryss, skiljer sig medvetet från den
  // streckade (ännu-inte-hänt) cirkeln ovan
  // Samma 30px som emptyDay ovan såg mindre ut i praktiken — en solid fylld yta läser optiskt som
  // mindre än en streckad kontur av samma nominella storlek, så den får vara lite större för att
  // kännas jämnstor
  missedDay: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center",
  },

  friendsTile: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginTop: 28, marginHorizontal: 16, padding: 16, borderRadius: 20,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  // Ringen (Canvas) ligger centrerad bakom friendsIcon i den här — se FRIENDS_RING_SIZE/_R ovan
  friendsIconWrap: { width: FRIENDS_RING_SIZE, height: FRIENDS_RING_SIZE, alignItems: "center", justifyContent: "center" },
  friendsIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#1E1B16", // varmare/mörkare än korten runt om, så den tunna gradientringen inte tävlar med en grå platta
    alignItems: "center", justifyContent: "center",
  },
  friendsBadge: {
    position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: "#C0392B", alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
    borderWidth: 2, borderColor: BG,
  },
  friendsBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#FFFFFF" },
  // Playfair bort — bara för personnamn i appen numera, det här är en navigeringsetikett
  friendsTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, letterSpacing: -0.2, color: FG },
  friendsSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 2 },
});
