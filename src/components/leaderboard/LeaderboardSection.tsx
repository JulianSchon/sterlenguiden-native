/**
 * "Topplistor" på Mitt Österlen: en förhandstitt — prispallen och topp 5 i en fast vy (flest
 * besök i hela appen denna månad), plus min egen guldiga rad om jag inte redan syns bland de
 * fem. Deltar jag inte står min rad ändå kvar, med "–" i stället för placering, och under den
 * knappen för att gå med. "Visa alla"/tryck på listan öppnar hela sidan med alla tre
 * topplistorna och omfången (app/leaderboards.tsx).
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useProfile } from "@/hooks/useProfile";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { PressableScale } from "@/components/PressableScale";
import { Podium } from "./Podium";
import { LeaderboardRow } from "./LeaderboardRow";
import { JoinLeaderboardButton, LeaderboardConsentSheet } from "./LeaderboardConsentSheet";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const PREVIEW_COUNT = 5;

export function LeaderboardSection() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: profile } = useProfile();
  const { data, isLoading, isError } = useLeaderboard("visits", "all", "month");
  const [consentOpen, setConsentOpen] = useState(false);

  const top = (data?.entries ?? []).slice(0, PREVIEW_COUNT);
  const me = data?.me ?? null;
  const meInTop = !!me && top.some((e) => e.userId === me.userId);
  const participating = profile?.show_in_leaderboard === true;
  const month = format(new Date(), "LLLL", { locale: sv });
  const open = () => router.push("/leaderboards" as any);

  return (
    <View style={s.section}>
      <View style={s.head}>
        <Text style={s.title}>Topplistor</Text>
        <TouchableOpacity onPress={open} hitSlop={8}>
          <Text style={s.action}>Visa alla</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.sub}>Flest besökta platser i {month} · hela appen</Text>

      {isLoading ? (
        <ActivityIndicator style={{ marginVertical: 40 }} color={GOLD} />
      ) : isError ? (
        <Text style={s.error}>Topplistan kunde inte hämtas just nu.</Text>
      ) : (
        <>
          <PressableScale style={s.board} scale={0.98} onPress={open}>
            <Podium entries={top.slice(0, 3)} metric="visits" width={width - 32} meId={me?.userId} />
            {top.length > 3 && (
              <View style={s.rows}>
                {top.slice(3).map((e) => (
                  <LeaderboardRow key={e.userId} entry={e} metric="visits" highlight={e.userId === me?.userId} />
                ))}
              </View>
            )}
          </PressableScale>

          {me && !meInTop && (
            <View style={s.meRow}>
              <LeaderboardRow entry={me} metric="visits" highlight />
            </View>
          )}
          {!participating && (
            <View style={s.join}>
              <JoinLeaderboardButton onPress={() => setConsentOpen(true)} />
            </View>
          )}
        </>
      )}

      <LeaderboardConsentSheet visible={consentOpen} onClose={() => setConsentOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 32, paddingHorizontal: 16 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  // Samma sektionsrubrik som Listor/Minnen/Samlarobjekt
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: FG },
  action: { fontFamily: "Inter_500Medium", fontSize: 13, color: GOLD },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 4 },
  error: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, marginTop: 16 },
  board: { marginTop: 18 },
  rows: { gap: 8, marginTop: 16 },
  meRow: { marginTop: 8 },
  join: { marginTop: 12 },
});
