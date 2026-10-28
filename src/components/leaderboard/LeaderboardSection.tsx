/**
 * "Topplistor" på Mitt Österlen: en förhandstitt — prispallen och topp 5 i en fast vy (flest
 * besök i hela appen denna månad), plus min egen guldiga rad om jag inte redan syns bland de
 * fem. Deltar jag inte står min rad ändå kvar, med "–" i stället för placering, och under den
 * knappen för att gå med. "Visa alla"/tryck på listan öppnar hela sidan med alla tre
 * topplistorna och omfången (app/leaderboards.tsx).
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useProfile } from "@/hooks/useProfile";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { devShowMonthResetAgain } from "@/hooks/useMonthReset";
import * as Haptics from "expo-haptics";
import { PressableScale } from "@/components/PressableScale";
import { Podium, PodiumSkeleton } from "./Podium";
import { LeaderboardRow, LeaderboardRowSkeleton } from "./LeaderboardRow";
import { JoinLeaderboardButton, LeaderboardConsentSheet } from "./LeaderboardConsentSheet";
import i18n from "i18next";
import { formatDate } from "@/i18n/dates";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const PREVIEW_COUNT = 5;

export function LeaderboardSection() {
  const s = useThemedStyles(createStyles);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: profile } = useProfile();
  const { data, isLoading, isError } = useLeaderboard("visits", "all", "month");
  const [consentOpen, setConsentOpen] = useState(false);

  const top = (data?.entries ?? []).slice(0, PREVIEW_COUNT);
  const me = data?.me ?? null;
  const meInTop = !!me && top.some((e) => e.userId === me.userId);
  const participating = profile?.show_in_leaderboard === true;
  const month = formatDate(new Date(), "LLLL");
  const open = () => router.push("/leaderboards");

  return (
    <View style={s.section}>
      <View style={s.head}>
        {/* Utvecklingsläget: håll in rubriken för att se "ny månad"-ögonblicket igen (test) */}
        <Text
          style={s.title}
          onLongPress={__DEV__ && profile ? () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            devShowMonthResetAgain(profile.user_id);
          } : undefined}
        >
          {i18n.t("leaderboard.title")}
        </Text>
        <TouchableOpacity onPress={open} hitSlop={8}>
          <Text style={s.action}>{i18n.t("leaderboard.showAll")}</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.sub}>{i18n.t("leaderboard.sectionSub", { month })}</Text>

      {isLoading ? (
        <View style={s.board}>
          <PodiumSkeleton width={width - 32} />
          <View style={s.rows}>
            {Array.from({ length: PREVIEW_COUNT - 3 }, (_, i) => <LeaderboardRowSkeleton key={i} />)}
          </View>
        </View>
      ) : isError ? (
        <Text style={s.error}>{i18n.t("leaderboard.error")}</Text>
      ) : (
        <>
          <PressableScale style={s.board} scale={0.98} onPress={open}>
            <Podium entries={top.slice(0, 3)} metric="visits" width={width - 32} />
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

const createStyles = (c: ThemeColors) => StyleSheet.create({
  section: { marginTop: 32, paddingHorizontal: 16 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  // Samma sektionsrubrik som Listor/Minnen/Samlarobjekt
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: c.text },
  action: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.goldText },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 4 },
  error: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, marginTop: 16 },
  board: { marginTop: 28 },
  rows: { gap: 8, marginTop: 16 },
  meRow: { marginTop: 8 },
  join: { marginTop: 12 },
});
