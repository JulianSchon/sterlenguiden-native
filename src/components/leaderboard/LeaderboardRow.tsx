/**
 * En rad i en topplista: placering, profilbild (bara om personen valt att visa den, annars
 * initialcirkel), namn med användarnamn och ort under, och värdet. Namnet klipps aldrig av — det
 * krymper hellre lite så hela får plats.
 * `highlight` = min egen rad (guldtonad). Placering null (man deltar inte) visas som "–".
 * `jumpHint` = den fastnålade egna raden, där ett tryck scrollar ner till mig (pil nedåt).
 *
 * Fast höjd (ROW_H) — topplistan är en virtualiserad lista som räknar ut varje rads läge i
 * förväg, så den kan hoppa direkt till rad 12 000 utan att mäta allt däremellan.
 */
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { PressableScale } from "@/components/PressableScale";
import { Avatar } from "@/components/profile/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { formatLeaderboardValue, type LeaderboardEntry, type LeaderboardMetric } from "@/hooks/useLeaderboard";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export const ROW_H = 64;

export function LeaderboardRow({
  entry, metric, highlight = false, jumpHint = false, onPress,
}: {
  entry: LeaderboardEntry; metric: LeaderboardMetric; highlight?: boolean; jumpHint?: boolean; onPress?: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const sub = [entry.username ? `@${entry.username}` : null, entry.city].filter(Boolean).join("  ·  ");
  return (
    <Wrapper onPress={onPress} style={[s.row, highlight && s.rowMe]}>
      <Text style={[s.rank, highlight && { color: colors.goldText }]} numberOfLines={1}>
        {entry.placement ?? "–"}
      </Text>
      <Avatar size={36} uri={entry.avatarUrl} name={entry.name} color={entry.circleColor ?? colors.fill} />
      <View style={s.who}>
        <Text style={[s.name, highlight && { color: colors.goldText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {entry.name}
        </Text>
        {sub !== "" && <Text style={s.sub} numberOfLines={1}>{sub}</Text>}
      </View>
      <Text style={s.value}>{formatLeaderboardValue(metric, entry.value)}</Text>
      {jumpHint && <ChevronDown size={16} color={colors.goldText} strokeWidth={2.4} />}
    </Wrapper>
  );
}

/** En rad i grått medan topplistan laddas — samma höjd och delar som en riktig rad */
export function LeaderboardRowSkeleton() {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.row} pointerEvents="none">
      <View style={{ width: 40, alignItems: "center" }}>
        <Skeleton width={18} height={12} radius={4} />
      </View>
      <Skeleton width={36} height={36} radius={18} />
      <View style={[s.who, { gap: 7 }]}>
        <Skeleton width="55%" height={13} radius={5} />
        <Skeleton width="35%" height={10} radius={4} />
      </View>
      <Skeleton width={28} height={13} radius={5} />
    </View>
  );
}

/** Tryckbar (med samma tryck-krymper-känsla som resten av appen) bara när onPress finns */
function Wrapper({ onPress, style, children }: { onPress?: () => void; style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  if (!onPress) return <View style={style}>{children}</View>;
  return <PressableScale style={style} scale={0.98} onPress={onPress}>{children}</PressableScale>;
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, height: ROW_H,
    paddingHorizontal: 14, borderRadius: 14,
    backgroundColor: c.card, borderWidth: 0.5, borderColor: c.fill,
  },
  rowMe: { backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.goldBorder },
  // Fast bredd så namnen linjerar under varandra, även när en placering är fyrsiffrig
  rank: {
    width: 40, textAlign: "center",
    fontFamily: "Montserrat_700Bold", fontSize: 14, color: c.muted, fontVariant: ["tabular-nums"],
  },
  who: { flex: 1 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12, color: c.muted, marginTop: 2 },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text },
});
