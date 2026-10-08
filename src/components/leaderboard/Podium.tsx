/**
 * Prispallen: topp 3 som tre block — tvåan till vänster, ettan i mitten (högst), trean till
 * höger, som en riktig prispall. Initialcirklar i stället för profilbilder (inga profilbilder i
 * topplistor). Deltar färre än tre står blocket kvar som "Ledig plats" — mer inbjudande än en
 * halv prispall.
 *
 * Blocken reser sig i tur och ordning — trean, tvåan, sist ettan — när pallen visas. Byts
 * topplista (annan flik/omfång) remountas pallen via sin key hos föräldern, så det spelas igen.
 */
import { View, Text, StyleSheet } from "react-native";
import Reanimated, { Easing, FadeInUp, useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Stop, Rect, Polygon } from "react-native-svg";
import { Trophy, MapPin, Flame, Sparkles } from "lucide-react-native";
import { Avatar } from "@/components/profile/Avatar";
import { formatLeaderboardValue, type LeaderboardEntry, type LeaderboardMetric } from "@/hooks/useLeaderboard";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

type Place = 1 | 2 | 3;
// Siffrornas färg — samma guld/silver/brons-skala som troféerna (TIER_PALETTE i achievements.ts)
const PLACE_COLOR: Record<Place, string> = { 1: "#D4A740", 2: "#C9C9C9", 3: "#B87A4B" };
const BLOCK_H: Record<Place, number> = { 1: 112, 2: 84, 3: 66 };
const REVEAL_DELAY: Record<Place, number> = { 3: 0, 2: 140, 1: 280 };
const TOP_FACE = 10;

export function MetricIcon({ metric, size = 11, color = GOLD }: { metric: LeaderboardMetric; size?: number; color?: string }) {
  const Icon = metric === "visits" ? MapPin : metric === "streak" ? Flame : Sparkles;
  return <Icon size={size} color={color} strokeWidth={2.4} />;
}

export function Podium({
  entries, metric, width, meId,
}: { entries: LeaderboardEntry[]; metric: LeaderboardMetric; width: number; meId?: string }) {
  const colW = Math.floor(width / 3);
  return (
    <View style={[s.row, { width }]}>
      {([2, 1, 3] as Place[]).map((place) => {
        const entry = entries[place - 1];
        return (
          <PodiumColumn
            key={place}
            place={place}
            entry={entry}
            metric={metric}
            width={colW}
            isMe={!!entry && entry.userId === meId}
          />
        );
      })}
    </View>
  );
}

function PodiumColumn({
  place, entry, metric, width, isMe,
}: { place: Place; entry: LeaderboardEntry | undefined; metric: LeaderboardMetric; width: number; isMe: boolean }) {
  const reduceMotion = useReducedMotion();
  const avatar = place === 1 ? 58 : 48;
  const blockW = width - 4;
  const blockH = BLOCK_H[place];

  return (
    <Reanimated.View
      entering={reduceMotion ? undefined : FadeInUp.delay(REVEAL_DELAY[place]).duration(460).easing(Easing.out(Easing.cubic))}
      style={[s.column, { width }]}
    >
      {place === 1 && <Trophy size={22} color={GOLD} strokeWidth={2} style={{ marginBottom: 6 }} />}

      {/* Samma ram runt alla avatarer (genomskinlig om det inte är jag) — annars hade min egen
          kolumn blivit några pixlar högre än de andra. */}
      <View style={[s.avatarRing, { borderColor: isMe ? GOLD : "transparent" }]}>
        {entry ? (
          <Avatar size={avatar} uri={null} name={entry.name} color={entry.circleColor ?? "#2A2A2A"} />
        ) : (
          <View style={[s.emptyAvatar, { width: avatar, height: avatar, borderRadius: avatar / 2 }]} />
        )}
      </View>

      <Text style={[s.name, isMe && { color: GOLD }, !entry && { color: MUTED }]} numberOfLines={1}>
        {entry ? entry.name : "Ledig plats"}
      </Text>
      <View style={[s.chip, !entry && { opacity: 0 }]}>
        <MetricIcon metric={metric} />
        <Text style={s.chipText}>{entry ? formatLeaderboardValue(metric, entry.value) : "–"}</Text>
      </View>

      <View style={{ width: blockW, height: blockH, marginTop: 10 }}>
        <Svg width={blockW} height={blockH}>
          <Defs>
            <LinearGradient id={`podiumFace${place}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.13} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.015} />
            </LinearGradient>
          </Defs>
          {/* Blockets översida — en smal, ljusare trapets, så det läses som ett block i 3D och
              inte en platt rektangel */}
          <Polygon points={`6,0 ${blockW - 6},0 ${blockW},${TOP_FACE} 0,${TOP_FACE}`} fill="#FFFFFF" fillOpacity={0.2} />
          <Rect x={0} y={TOP_FACE} width={blockW} height={blockH - TOP_FACE} fill={`url(#podiumFace${place})`} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, s.numberWrap]} pointerEvents="none">
          <Text style={[s.number, { color: PLACE_COLOR[place], fontSize: place === 1 ? 44 : 36 }]}>{place}</Text>
        </View>
      </View>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", alignSelf: "center" },
  column: { alignItems: "center" },
  avatarRing: { padding: 2, borderWidth: 2, borderRadius: 999 },
  emptyAvatar: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.2)" },
  name: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, color: FG,
    marginTop: 8, paddingHorizontal: 4, maxWidth: "100%",
  },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)",
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: FG },
  numberWrap: { top: TOP_FACE, alignItems: "center", justifyContent: "center" },
  number: { fontFamily: "Montserrat_700Bold" },
});
