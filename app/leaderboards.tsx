/**
 * Topplistor: Besök, Streak och Samlarobjekt — var och en i tre omfång (hela appen, min ort,
 * mina vänner), och Besök dessutom för denna månad, i år eller sedan start. Ordning uppifrån:
 * vilken topplista (fast överst), rubriken, prispallen, omfång och tid, sedan raderna för plats 4
 * och nedåt.
 *
 * Listan hämtas 50 i taget när man närmar sig slutet och är virtualiserad (FlatList med fast
 * radhöjd), så bara de rader som syns ritas — den ska inte börja lagga även om tusentals deltar.
 * Min egen rad står fastnålad längst ner när jag inte redan syns i topp 10; ett tryck på den
 * hämtar (i ett enda anrop) allt fram till min rad och scrollar dit, även om jag ligger på
 * plats 12 000.
 *
 * Synlighet styrs från knappen uppe till höger. Första gången sidan öppnas, innan man tagit
 * ställning, frågar den om man vill synas (LeaderboardConsentSheet) — av som standard, inget
 * förvalt. Själva listorna går att titta på oavsett svar; att synas i dem kräver ett ja.
 */
import { useEffect, useRef, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, useWindowDimensions,
} from "react-native";
import Reanimated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useProfile } from "@/hooks/useProfile";
import {
  useLeaderboardList, useSetLeaderboardVisibility,
  type LeaderboardEntry, type LeaderboardMetric, type LeaderboardScope, type LeaderboardPeriod,
} from "@/hooks/useLeaderboard";
import { Podium } from "@/components/leaderboard/Podium";
import { Segmented } from "@/components/leaderboard/Segmented";
import { LeaderboardRow, ROW_H } from "@/components/leaderboard/LeaderboardRow";
import { JoinLeaderboardButton, LeaderboardConsentSheet } from "@/components/leaderboard/LeaderboardConsentSheet";
import { PressableScale } from "@/components/PressableScale";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const ROW_GAP = 10;
const ITEM_H = ROW_H + ROW_GAP;
// Är jag själv bland de här översta behövs ingen fastnålad rad — då ser jag ju var jag är
const STICKY_FROM = 11;
const LIST_PAD = 16;
const HEADER_GAP = 24;

const METRICS: { id: LeaderboardMetric; label: string }[] = [
  { id: "visits", label: "Besök" },
  { id: "streak", label: "Streak" },
  { id: "stickers", label: "Samlarobjekt" },
];
const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "month", label: "Denna månad" },
  { id: "year", label: "I år" },
  { id: "all", label: "Sedan start" },
];

export default function LeaderboardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { data: profile } = useProfile();
  const setVisibility = useSetLeaderboardVisibility();

  const [metric, setMetric] = useState<LeaderboardMetric>("visits");
  const [scope, setScope] = useState<LeaderboardScope>("all");
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const list = useLeaderboardList(metric, scope, period);
  const { entries, me, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = list;

  // Fråga bara en gång per besök på sidan, och bara om man aldrig tagit ställning (null)
  const [consent, setConsent] = useState<null | "first" | "join">(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!asked.current && profile && profile.show_in_leaderboard == null) {
      asked.current = true;
      setConsent("first");
    }
  }, [profile]);

  // "Tryck på mig själv": vänta tills raderna fram till min plats är inlästa, scrolla sedan dit
  const listRef = useRef<FlatList<LeaderboardEntry>>(null);
  const [headerH, setHeaderH] = useState(0);
  const pendingScroll = useRef<number | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  function tryScroll() {
    const target = pendingScroll.current;
    if (!target || entriesRef.current.length < target) return;
    pendingScroll.current = null;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: Math.max(0, target - 4), animated: true, viewPosition: 0.5 });
    });
  }
  useEffect(tryScroll, [entries.length]);

  async function goToMe() {
    if (!me?.rowPos) return;
    pendingScroll.current = me.rowPos;
    await list.loadThrough(me.rowPos);
    tryScroll();
  }

  const participating = profile?.show_in_leaderboard === true;
  const city = profile?.city?.trim() || null;
  const noCity = scope === "area" && !city;
  const month = format(new Date(), "LLLL", { locale: sv });
  const boardKey = `${metric}-${scope}-${metric === "visits" ? period : "all"}`;
  const showSticky = !!me && !(me.rowPos && me.rowPos < STICKY_FROM);
  const showFooter = showSticky || !participating;

  const scopes: { id: LeaderboardScope; label: string }[] = [
    { id: "all", label: "Hela appen" },
    { id: "area", label: city ?? "Mitt område" },
    { id: "friends", label: "Vänner" },
  ];

  // Rubriken säger VAD som räknas; raden under säger NÄR och VAR
  const title =
    metric === "visits" ? "Flest besökta platser" : metric === "streak" ? "Längst streak just nu" : "Flest samlarobjekt";
  const when =
    metric !== "visits" ? null : period === "month" ? `i ${month}` : period === "year" ? "i år" : "sedan start";
  const where = scopes.find((sc) => sc.id === scope)?.label ?? "";
  const context = when ? `${when.charAt(0).toUpperCase()}${when.slice(1)} · ${where}` : where;

  function onVisibilityPress() {
    if (!participating) {
      setConsent("join");
      return;
    }
    Alert.alert(
      "Du syns i topplistorna",
      "Ditt namn och din statistik — besök, streak och samlarobjekt — visas för andra i appen: i hela appen, i ditt område och bland dina vänner. Vill du sluta synas? Då tas du bort ur alla topplistor direkt.",
      [
        { text: "Fortsätt synas", style: "cancel" },
        { text: "Sluta synas", style: "destructive", onPress: () => setVisibility.mutate(false) },
      ],
    );
  }

  const header = (
    <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.context}>{context}</Text>

      <View style={s.board}>
        {isLoading ? (
          <ActivityIndicator color={GOLD} />
        ) : isError ? (
          <Text style={s.empty}>Topplistan kunde inte hämtas just nu.</Text>
        ) : noCity ? (
          <Text style={s.empty}>Vi har ingen ort sparad på din profil, så det finns inget område att jämföra med.</Text>
        ) : (
          <View key={boardKey}>
            <Podium entries={entries.slice(0, 3)} metric={metric} width={width - 32} />
            {entries.length === 0 && (
              <Text style={s.empty}>
                {scope === "friends" ? "Ingen av dina vänner deltar i topplistorna än." : "Ingen deltar i den här topplistan än."}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Omfång och tid under pallen — smalare och lugnare än huvudvalet överst */}
      <View style={s.controls}>
        <Segmented options={scopes} value={scope} onChange={setScope} />
        {metric === "visits" && <Segmented options={PERIODS} value={period} onChange={setPeriod} />}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Topplistor</Text>
          {/* Synlighet: tydlig status (Synlig/Dold), ett tryck förklarar och låter en ändra sig */}
          <PressableScale style={[s.visibility, participating && s.visibilityOn]} scale={0.95} onPress={onVisibilityPress}>
            {participating ? <Eye size={16} color={GOLD} strokeWidth={2.2} /> : <EyeOff size={16} color={MUTED} strokeWidth={2.2} />}
            <Text style={[s.visibilityText, participating && { color: GOLD }]}>{participating ? "Synlig" : "Dold"}</Text>
          </PressableScale>
        </View>
      </View>

      {/* Huvudvalet — samma segmentkontroll som valen under pallen, men större och med en
          neonlila kant runt det valda, så det skiljer sig tydligt från de mindre valen */}
      <View style={s.metricTabs}>
        <Segmented options={METRICS} value={metric} onChange={setMetric} variant="primary" />
      </View>

      <FlatList
        ref={listRef}
        data={isLoading || isError || noCity ? [] : entries.slice(3)}
        keyExtractor={(e) => `${boardKey}-${e.userId}`}
        ListHeaderComponent={header}
        contentContainerStyle={s.body}
        renderItem={({ item, index }) => (
          <Reanimated.View
            style={s.item}
            entering={reduceMotion || index > 12 ? undefined : FadeInDown.delay(380 + index * 35).duration(320)}
          >
            <LeaderboardRow entry={item} metric={metric} highlight={item.userId === me?.userId} />
          </Reanimated.View>
        )}
        // Läget räknas ut i förväg (fast radhöjd) — padding + rubrikdelen + avståndet + raderna ovanför
        getItemLayout={(_, index) => ({ length: ITEM_H, offset: LIST_PAD + headerH + HEADER_GAP + index * ITEM_H, index })}
        ListHeaderComponentStyle={s.rowsStart}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginTop: 8 }} color={GOLD} /> : null}
        initialNumToRender={12}
        windowSize={11}
      />

      {showFooter && (
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          {/* Min egen rad — ett tryck scrollar ner till mig, var jag än ligger */}
          {showSticky && me && (
            <LeaderboardRow entry={me} metric={metric} highlight onPress={me.rowPos ? goToMe : undefined} />
          )}
          {!participating && <JoinLeaderboardButton onPress={() => setConsent("join")} />}
        </View>
      )}

      <LeaderboardConsentSheet
        visible={consent !== null}
        onClose={() => setConsent(null)}
        declineOnDismiss={consent === "first"}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG, textTransform: "uppercase" },
  visibility: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  visibilityOn: { backgroundColor: "rgba(197,160,89,0.12)", borderColor: "rgba(197,160,89,0.5)" },
  visibilityText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED },

  metricTabs: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  body: { padding: LIST_PAD, paddingBottom: 28 },
  // Stor rubrik för vad listan gäller — det är huvudfokuset på sidan
  title: { fontFamily: "Montserrat_700Bold", fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: FG, textAlign: "center", marginTop: 8 },
  context: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: GOLD, textAlign: "center", marginTop: 4 },
  // Fast minsta höjd så kontrollerna under inte hoppar upp och ner medan en lista laddar
  board: { minHeight: 330, justifyContent: "flex-end", marginTop: 4 },
  controls: { gap: 10, marginTop: 28 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 20, lineHeight: 20 },
  // Avståndet mellan kontrollerna och första raden — ingår i radernas läge (getItemLayout)
  rowsStart: { marginBottom: HEADER_GAP },
  item: { height: ITEM_H, paddingBottom: ROW_GAP },

  footer: {
    paddingHorizontal: 16, paddingTop: 12, gap: 10,
    backgroundColor: BG, borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.08)",
  },
});
