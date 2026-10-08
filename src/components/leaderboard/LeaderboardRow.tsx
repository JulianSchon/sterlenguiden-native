/**
 * En rad i en topplista: placering, initialcirkel (aldrig profilbild), namn, värde.
 * `highlight` = min egen rad — guldtonad, så man alltid hittar sig själv, även långt ner.
 * Placering null (man deltar inte) visas som "–".
 */
import { View, Text, StyleSheet } from "react-native";
import { Avatar } from "@/components/profile/Avatar";
import { formatLeaderboardValue, type LeaderboardEntry, type LeaderboardMetric } from "@/hooks/useLeaderboard";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const CARD = "#1A1A1D";

export function LeaderboardRow({
  entry, metric, highlight = false,
}: { entry: LeaderboardEntry; metric: LeaderboardMetric; highlight?: boolean }) {
  return (
    <View style={[s.row, highlight && s.rowMe]}>
      <Text style={[s.rank, highlight && { color: GOLD }]} numberOfLines={1}>
        {entry.placement ?? "–"}
      </Text>
      <Avatar size={34} uri={null} name={entry.name} color={entry.circleColor ?? "#2A2A2A"} />
      <Text style={[s.name, highlight && { color: GOLD }]} numberOfLines={1}>{entry.name}</Text>
      <Text style={s.value}>{formatLeaderboardValue(metric, entry.value)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)",
  },
  rowMe: { backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.45)" },
  // Fast bredd så namnen linjerar under varandra, även när en placering är fyrsiffrig
  rank: {
    width: 40, textAlign: "center",
    fontFamily: "Montserrat_700Bold", fontSize: 14, color: MUTED, fontVariant: ["tabular-nums"],
  },
  name: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
});
