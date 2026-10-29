/**
 * Prispallen: topp 3 som tre block — tvåan till vänster, ettan i mitten (högst), trean till
 * höger, som en riktig prispall. Profilbild bara för den som valt att visa den, annars
 * initialcirkel, var och en med en liten rund bricka i guld, silver eller brons och sin placering.
 * Blocken är enkla och raka: kortets färg med en kant i medaljens färg överst. Deltar färre än
 * tre står blocket kvar som "Ledig plats".
 *
 * Blocken reser sig i tur och ordning — trean, tvåan, sist ettan — när pallen visas. Byts
 * topplista (annan flik/omfång) remountas pallen via sin key hos föräldern, så det spelas igen.
 */
import { View, Text, StyleSheet } from "react-native";
import Reanimated, { Easing, FadeInUp, useReducedMotion } from "react-native-reanimated";
import { PressableScale } from "@/components/PressableScale";
import { Avatar } from "@/components/profile/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { formatLeaderboardValue, type LeaderboardEntry, type LeaderboardMetric } from "@/hooks/useLeaderboard";
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


type Place = 1 | 2 | 3;
/** Medaljernas färger: guld, silver och brons, raka färger utan toning */
const MEDAL: Record<Place, { fill: string; ink: string }> = {
  1: { fill: "#D4AF37", ink: "#2A2108" },
  2: { fill: "#B8BCC6", ink: "#23262D" },
  3: { fill: "#C27C4E", ink: "#2B160A" },
};
const BLOCK_H: Record<Place, number> = { 1: 150, 2: 112, 3: 88 };
const AVATAR: Record<Place, number> = { 1: 76, 2: 62, 3: 62 };
const REVEAL_DELAY: Record<Place, number> = { 3: 0, 2: 140, 1: 280 };

export function Podium({
  entries, metric, width, onSelect,
}: { entries: LeaderboardEntry[]; metric: LeaderboardMetric; width: number; onSelect?: (entry: LeaderboardEntry) => void }) {
  const s = useThemedStyles(createStyles);
  const colW = Math.floor(width / 3);
  return (
    <View style={[s.row, { width }]}>
      {([2, 1, 3] as Place[]).map((place) => (
        <PodiumColumn key={place} place={place} entry={entries[place - 1]} metric={metric} width={colW} onSelect={onSelect} />
      ))}
    </View>
  );
}

/** Pallen i grått medan topplistan laddas — samma mått, så den riktiga reser sig på samma plats */
export function PodiumSkeleton({ width }: { width: number }) {
  const s = useThemedStyles(createStyles);
  const colW = Math.floor(width / 3);
  return (
    <View style={[s.row, { width }]} pointerEvents="none">
      {([2, 1, 3] as Place[]).map((place) => (
        <View key={place} style={[s.column, { width: colW }]}>
          <Skeleton width={AVATAR[place]} height={AVATAR[place]} radius={AVATAR[place] / 2} />
          <Skeleton width={colW * 0.55} height={14} radius={5} style={{ marginTop: 14 }} />
          <Skeleton width={56} height={32} radius={10} style={{ marginTop: 10 }} />
          <Skeleton width={colW - 4} height={BLOCK_H[place]} radius={6} style={{ marginTop: 14 }} />
        </View>
      ))}
    </View>
  );
}

function PodiumColumn({
  place, entry, metric, width, onSelect,
}: {
  place: Place; entry: LeaderboardEntry | undefined; metric: LeaderboardMetric; width: number;
  onSelect?: (entry: LeaderboardEntry) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const reduceMotion = useReducedMotion();
  const avatar = AVATAR[place];

  return (
    <Reanimated.View
      entering={reduceMotion ? undefined : FadeInUp.delay(REVEAL_DELAY[place]).duration(460).easing(Easing.out(Easing.cubic))}
      style={[s.column, { width }]}
    >
      {/* Cirkel, namn och värde är tryckbara — öppnar personens profil */}
      <PressableScale
        style={s.person}
        scale={0.95}
        disabled={!entry || !onSelect}
        onPress={() => entry && onSelect?.(entry)}
      >
      {entry ? (
        <View style={{ width: avatar, height: avatar }}>
          <Avatar size={avatar} uri={entry.avatarUrl} name={entry.name} color={entry.circleColor ?? colors.fill} />
          {/* Placeringen i en liten rund bricka i medaljens färg */}
          <View style={[s.badge, { backgroundColor: MEDAL[place].fill, borderColor: colors.bg, top: -2, right: -4 }]}>
            <Text style={[s.badgeText, { color: MEDAL[place].ink }]}>{place}</Text>
          </View>
        </View>
      ) : (
        <View style={[s.emptyAvatar, { width: avatar, height: avatar, borderRadius: avatar / 2 }]} />
      )}

      {/* Hela namnet ska alltid synas — två rader och hellre lite mindre text än avklippt */}
      <Text style={[s.name, !entry && { color: colors.muted }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
        {entry ? entry.name : i18n.t("leaderboard.freeSpot")}
      </Text>
      <View style={[s.chip, !entry && { opacity: 0 }]}>
        <Text style={s.chipText}>{entry ? formatLeaderboardValue(metric, entry.value) : "–"}</Text>
      </View>
      </PressableScale>

      {/* Blocket: kortets färg, med en kant i medaljens färg överst och placeringen i stort */}
      <View style={[s.block, { width: width - 6, height: BLOCK_H[place], borderTopColor: MEDAL[place].fill }]}>
        <Text style={[s.blockNumber, { fontSize: place === 1 ? 44 : 36 }]}>{place}</Text>
      </View>
    </Reanimated.View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", alignSelf: "center" },
  column: { alignItems: "center" },
  person: { alignItems: "center", width: "100%" },
  badge: {
    position: "absolute", width: 26, height: 26, borderRadius: 13, borderWidth: 2.5,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { fontFamily: "Montserrat_700Bold", fontSize: 13, includeFontPadding: false },
  block: {
    marginTop: 14, alignItems: "center", justifyContent: "flex-start", paddingTop: 14,
    backgroundColor: c.card, borderTopWidth: 3, borderTopLeftRadius: 10, borderTopRightRadius: 10,
    borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth,
    borderLeftColor: c.border, borderRightColor: c.border,
  },
  blockNumber: { fontFamily: "Montserrat_700Bold", color: c.faint, includeFontPadding: false },
  emptyAvatar: { borderWidth: 1.5, borderStyle: "dashed", borderColor: c.borderStrong },
  name: {
    fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text,
    marginTop: 12, paddingHorizontal: 4, maxWidth: "100%", textAlign: "center",
  },
  // Rektangulär med lätt rundade hörn, inte en rund pill — som i referensen
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.text },
});
