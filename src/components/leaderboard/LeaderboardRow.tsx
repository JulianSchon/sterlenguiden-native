/**
 * En rad i en topplista: placering, initialcirkel (aldrig profilbild), namn, värde.
 * `highlight` = min egen rad — guldtonad, så man alltid hittar sig själv, även långt ner.
 * Placering null (man deltar inte) visas som "–". Fast höjd (ROW_H) — topplistan är en
 * virtualiserad lista som räknar ut varje rads läge i förväg, så den kan hoppa direkt till rad
 * 12 000 utan att mäta allt däremellan.
 */
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { PressableScale } from "@/components/PressableScale";
import { Avatar } from "@/components/profile/Avatar";
import { formatLeaderboardValue, type LeaderboardEntry, type LeaderboardMetric } from "@/hooks/useLeaderboard";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const CARD = "#1A1A1D";
export const ROW_H = 56;

export function LeaderboardRow({
  entry, metric, highlight = false, onPress,
}: { entry: LeaderboardEntry; metric: LeaderboardMetric; highlight?: boolean; onPress?: () => void }) {
  return (
    <Wrapper onPress={onPress} style={[s.row, highlight && s.rowMe]}>
      <Text style={[s.rank, highlight && { color: GOLD }]} numberOfLines={1}>
        {entry.placement ?? "–"}
      </Text>
      <Avatar size={34} uri={null} name={entry.name} color={entry.circleColor ?? "#2A2A2A"} />
      <Text style={[s.name, highlight && { color: GOLD }]} numberOfLines={1}>{entry.name}</Text>
      <Text style={s.value}>{formatLeaderboardValue(metric, entry.value)}</Text>
      {onPress && <ChevronDown size={16} color={GOLD} strokeWidth={2.4} />}
    </Wrapper>
  );
}

/** Tryckbar (med samma tryck-krymper-känsla som resten av appen) bara när onPress finns */
function Wrapper({ onPress, style, children }: { onPress?: () => void; style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  if (!onPress) return <View style={style}>{children}</View>;
  return <PressableScale style={style} scale={0.98} onPress={onPress}>{children}</PressableScale>;
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, height: ROW_H,
    paddingHorizontal: 14, borderRadius: 14,
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
