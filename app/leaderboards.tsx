/**
 * Topplistor: Besök, Streak och Samlarobjekt — var och en i tre omfång (hela appen, min ort,
 * mina vänner), och Besök dessutom för denna månad eller sedan start. Ordning uppifrån: vilken
 * topplista (fast överst), prispallen, och under den omfång och tid — samma segmentkontroll för
 * alla tre val. Sedan raderna för plats 4 och nedåt (topp 100), och min egen rad fastnålad
 * längst ner så jag alltid ser var jag ligger.
 *
 * Första gången sidan öppnas, innan man tagit ställning, frågar den om man vill synas
 * (LeaderboardConsentSheet) — av som standard, inget förvalt. Själva listorna går att titta på
 * oavsett svar; att synas i dem kräver ett ja.
 */
import { useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, useWindowDimensions,
} from "react-native";
import Reanimated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useProfile } from "@/hooks/useProfile";
import {
  useLeaderboard, useSetLeaderboardVisibility,
  type LeaderboardMetric, type LeaderboardScope, type LeaderboardPeriod,
} from "@/hooks/useLeaderboard";
import { Podium } from "@/components/leaderboard/Podium";
import { Segmented } from "@/components/leaderboard/Segmented";
import { LeaderboardRow } from "@/components/leaderboard/LeaderboardRow";
import { JoinLeaderboardButton, LeaderboardConsentSheet } from "@/components/leaderboard/LeaderboardConsentSheet";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

const METRICS: { id: LeaderboardMetric; label: string }[] = [
  { id: "visits", label: "Besök" },
  { id: "streak", label: "Streak" },
  { id: "stickers", label: "Samlarobjekt" },
];
const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "month", label: "Denna månad" },
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
  const { data, isLoading, isError } = useLeaderboard(metric, scope, period);

  // Fråga bara en gång per besök på sidan, och bara om man aldrig tagit ställning (null)
  const [consent, setConsent] = useState<null | "first" | "join">(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!asked.current && profile && profile.show_in_leaderboard == null) {
      asked.current = true;
      setConsent("first");
    }
  }, [profile]);

  const entries = data?.entries ?? [];
  const me = data?.me ?? null;
  const participating = profile?.show_in_leaderboard === true;
  const city = profile?.city?.trim() || null;
  const noCity = scope === "area" && !city;
  const month = format(new Date(), "LLLL", { locale: sv });
  const boardKey = `${metric}-${scope}-${metric === "visits" ? period : "all"}`;

  const scopes: { id: LeaderboardScope; label: string }[] = [
    { id: "all", label: "Hela appen" },
    { id: "area", label: city ?? "Mitt område" },
    { id: "friends", label: "Vänner" },
  ];

  const subtitle =
    metric === "visits"
      ? period === "month" ? `Flest besökta platser i ${month}` : "Flest besökta platser sedan start"
      : metric === "streak" ? "Flest dagar i rad just nu" : "Flest hittade samlarobjekt";

  function confirmHide() {
    Alert.alert("Sluta synas i topplistorna?", "Ditt namn och din statistik tas bort ur alla topplistor direkt.", [
      { text: "Avbryt", style: "cancel" },
      { text: "Sluta synas", style: "destructive", onPress: () => setVisibility.mutate(false) },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Topplistor</Text>
        </View>
      </View>

      <View style={s.topControl}>
        <Segmented options={METRICS} value={metric} onChange={setMetric} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.subtitle}>{subtitle}</Text>

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

        {/* Omfång och tid under pallen, samma kontroll som valet av topplista överst */}
        <View style={s.controls}>
          <Segmented options={scopes} value={scope} onChange={setScope} />
          {metric === "visits" && <Segmented options={PERIODS} value={period} onChange={setPeriod} />}
        </View>

        {!isLoading && !isError && !noCity && (
          <View key={`rows-${boardKey}`} style={s.rows}>
            {entries.slice(3).map((e, i) => (
              <Reanimated.View
                key={e.userId}
                entering={reduceMotion ? undefined : FadeInDown.delay(380 + Math.min(i, 12) * 35).duration(320)}
              >
                <LeaderboardRow entry={e} metric={metric} highlight={e.userId === me?.userId} />
              </Reanimated.View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Min egen rad, alltid synlig längst ner — oavsett hur långt ner i listan jag ligger */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        {me && <LeaderboardRow entry={me} metric={metric} highlight />}
        {participating ? (
          <TouchableOpacity onPress={confirmHide} hitSlop={8} style={s.hideLink}>
            <Text style={s.hideText}>Du syns i topplistorna · <Text style={{ color: GOLD }}>Sluta synas</Text></Text>
          </TouchableOpacity>
        ) : (
          <JoinLeaderboardButton onPress={() => setConsent("join")} />
        )}
      </View>

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

  topControl: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  body: { padding: 16, paddingBottom: 28 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, textAlign: "center" },
  // Fast minsta höjd så kontrollerna under inte hoppar upp och ner medan en lista laddar
  board: { minHeight: 360, justifyContent: "flex-end", marginTop: 28 },
  controls: { gap: 10, marginTop: 28 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 20, lineHeight: 20 },
  rows: { gap: 10, marginTop: 24 },

  footer: {
    paddingHorizontal: 16, paddingTop: 12, gap: 10,
    backgroundColor: BG, borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.08)",
  },
  hideLink: { alignItems: "center" },
  hideText: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED },
});
