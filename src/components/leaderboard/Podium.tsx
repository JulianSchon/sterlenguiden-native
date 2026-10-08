/**
 * Prispallen: topp 3 som tre block — tvåan till vänster, ettan i mitten (högst), trean till
 * höger, som en riktig prispall. Initialcirklar i stället för profilbilder (inga profilbilder i
 * topplistor), var och en med en taggig bricka i guld/silver/brons och sin placering — ingen
 * pokal, ingen färgad ring runt cirkeln. Cirklarna flyter sakta upp och ner, i olika takt så de
 * aldrig rör sig i takt med varandra. Deltar färre än tre står blocket kvar som "Ledig plats".
 *
 * Blocken reser sig i tur och ordning — trean, tvåan, sist ettan — när pallen visas. Byts
 * topplista (annan flik/omfång) remountas pallen via sin key hos föräldern, så det spelas igen.
 */
import { useEffect, type ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import Reanimated, {
  Easing, FadeInUp, cancelAnimation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop } from "react-native-svg";
import { MapPin, Flame, Sparkles } from "lucide-react-native";
import { Avatar } from "@/components/profile/Avatar";
import { TIER_PALETTE } from "@/lib/achievements";
import { formatLeaderboardValue, type LeaderboardEntry, type LeaderboardMetric } from "@/hooks/useLeaderboard";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const NUMBER_COLOR = "rgba(232,232,232,0.72)";

type Place = 1 | 2 | 3;
const TIER: Record<Place, keyof typeof TIER_PALETTE> = { 1: "gold", 2: "silver", 3: "bronze" };
const BLOCK_H: Record<Place, number> = { 1: 112, 2: 84, 3: 66 };
const REVEAL_DELAY: Record<Place, number> = { 3: 0, 2: 140, 1: 280 };
// Olika takt och startläge per cirkel — rörde de sig i takt såg det mekaniskt ut
const FLOAT: Record<Place, { duration: number; delay: number }> = {
  1: { duration: 2200, delay: 0 },
  2: { duration: 2550, delay: 450 },
  3: { duration: 2350, delay: 900 },
};
const FLOAT_PX = 3;
const TOP_FACE = 10;
const TOP_INSET = 6;

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

  return (
    <Reanimated.View
      entering={reduceMotion ? undefined : FadeInUp.delay(REVEAL_DELAY[place]).duration(460).easing(Easing.out(Easing.cubic))}
      style={[s.column, { width }]}
    >
      {entry ? (
        <Floating place={place}>
          <View style={{ width: avatar, height: avatar }}>
            <Avatar size={avatar} uri={null} name={entry.name} color={entry.circleColor ?? "#2A2A2A"} />
            <View style={[s.badge, { top: -avatar * 0.08, right: -avatar * 0.12 }]}>
              <RankBadge place={place} size={place === 1 ? 26 : 23} />
            </View>
          </View>
        </Floating>
      ) : (
        <View style={[s.emptyAvatar, { width: avatar, height: avatar, borderRadius: avatar / 2 }]} />
      )}

      <Text style={[s.name, isMe && { color: GOLD }, !entry && { color: MUTED }]} numberOfLines={1}>
        {entry ? entry.name : "Ledig plats"}
      </Text>
      <View style={[s.chip, !entry && { opacity: 0 }]}>
        <MetricIcon metric={metric} />
        <Text style={s.chipText}>{entry ? formatLeaderboardValue(metric, entry.value) : "–"}</Text>
      </View>

      <PodiumBlock place={place} width={width - 4} />
    </Reanimated.View>
  );
}

/** Mjuk, oändlig upp-och-ner-rörelse — sinuskurva fram och tillbaka, aldrig en fjäder som studsar. */
function Floating({ place, children }: { place: Place; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  // Startar i ena ytterläget (0), inte i mitten — withRepeat pendlar mellan STARTVÄRDET och målet,
  // så en start i mitten hade gett halva rörelsen, bara åt ena hållet
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    const { duration, delay } = FLOAT[place];
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [place, reduceMotion, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, [0, 1], [-FLOAT_PX, FLOAT_PX]) }],
  }));
  return <Reanimated.View style={style}>{children}</Reanimated.View>;
}

/** Taggig bricka (som ett sigill) i guld/silver/brons — samma färgskala som troféerna. */
function RankBadge({ place, size }: { place: Place; size: number }) {
  const palette = TIER_PALETTE[TIER[place]];
  const R = size / 2;
  const inner = R * 0.84;
  const spikes = 14;
  const points = Array.from({ length: spikes * 2 }, (_, i) => {
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    const r = i % 2 === 0 ? R : inner;
    return `${(R + r * Math.cos(angle)).toFixed(2)},${(R + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`rankBadge${place}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.field[0]} />
            <Stop offset="0.55" stopColor={palette.field[1]} />
            <Stop offset="1" stopColor={palette.field[2]} />
          </LinearGradient>
        </Defs>
        <Polygon points={points} fill={`url(#rankBadge${place})`} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.center]}>
        <Text style={[s.badgeText, { fontSize: size * 0.48, color: palette.ink }]}>{place}</Text>
      </View>
    </View>
  );
}

/** Själva blocket: en ljusare trapets som ovansida (det är den som ger djupet — läses som ett
 * block, inte en platt rektangel) ovanpå framsidan med en tonande gradient. Raka hörn — en
 * version med rundade hörn testades och plattade till ovansidan så djupet försvann. */
function PodiumBlock({ place, width }: { place: Place; width: number }) {
  const height = BLOCK_H[place];
  return (
    <View style={{ width, height, marginTop: 10 }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`podiumFace${place}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.13} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.015} />
          </LinearGradient>
        </Defs>
        <Polygon
          points={`${TOP_INSET},0 ${width - TOP_INSET},0 ${width},${TOP_FACE} 0,${TOP_FACE}`}
          fill="#FFFFFF"
          fillOpacity={0.2}
        />
        <Rect x={0} y={TOP_FACE} width={width} height={height - TOP_FACE} fill={`url(#podiumFace${place})`} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.numberWrap]} pointerEvents="none">
        <Text style={[s.number, { fontSize: place === 1 ? 44 : 36 }]}>{place}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", alignSelf: "center" },
  column: { alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute" },
  badgeText: { fontFamily: "Montserrat_700Bold", includeFontPadding: false },
  emptyAvatar: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.2)" },
  name: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, color: FG,
    marginTop: 10, paddingHorizontal: 4, maxWidth: "100%",
  },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)",
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: FG },
  numberWrap: { top: TOP_FACE, alignItems: "center", justifyContent: "center" },
  number: { fontFamily: "Montserrat_700Bold", color: NUMBER_COLOR },
});
