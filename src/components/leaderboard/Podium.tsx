/**
 * Prispallen: topp 3 som tre block — tvåan till vänster, ettan i mitten (högst), trean till
 * höger, som en riktig prispall. Initialcirklar i stället för profilbilder (inga profilbilder i
 * topplistor), var och en med en taggig bricka i guld/silver/brons och sin placering. Cirklarna
 * flyter sakta upp och ner, i olika takt så de aldrig rör sig i takt med varandra. Ett mjukt
 * strålkastarljus uppifrån ligger bakom ettan. Deltar färre än tre står blocket kvar som
 * "Ledig plats".
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
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { TIER_PALETTE } from "@/lib/achievements";
import { formatLeaderboardValue, type LeaderboardEntry, type LeaderboardMetric } from "@/hooks/useLeaderboard";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const NUMBER_COLOR = "rgba(235,235,240,0.62)";

type Place = 1 | 2 | 3;
const TIER: Record<Place, keyof typeof TIER_PALETTE> = { 1: "gold", 2: "silver", 3: "bronze" };
const BLOCK_H: Record<Place, number> = { 1: 150, 2: 112, 3: 88 };
const AVATAR: Record<Place, number> = { 1: 76, 2: 62, 3: 62 };
const REVEAL_DELAY: Record<Place, number> = { 3: 0, 2: 140, 1: 280 };
// Olika takt och startläge per cirkel — rörde de sig i takt såg det mekaniskt ut
const FLOAT: Record<Place, { duration: number; delay: number }> = {
  1: { duration: 2200, delay: 0 },
  2: { duration: 2550, delay: 450 },
  3: { duration: 2350, delay: 900 },
};
const FLOAT_PX = 3;
const TOP_FACE = 14;
const TOP_INSET = 9;

export function MetricIcon({ metric, size = 12, color = GOLD }: { metric: LeaderboardMetric; size?: number; color?: string }) {
  const Icon = metric === "visits" ? MapPin : metric === "streak" ? Flame : Sparkles;
  return <Icon size={size} color={color} strokeWidth={2.4} />;
}

export function Podium({
  entries, metric, width,
}: { entries: LeaderboardEntry[]; metric: LeaderboardMetric; width: number }) {
  const colW = Math.floor(width / 3);
  const spot = width * 0.95;
  return (
    <View style={[s.row, { width }]}>
      {/* Strålkastarljus uppifrån bakom ettan — en riktig radial gradient som tonar ut helt */}
      <View style={[s.spotAnchor, { width: spot, height: spot, left: (width - spot) / 2, top: -spot * 0.12 }]} pointerEvents="none">
        <RadialGlow size={spot} color="#FFFFFF" opacity={0.09} radiusRatio={0.75} />
      </View>
      {([2, 1, 3] as Place[]).map((place) => (
        <PodiumColumn key={place} place={place} entry={entries[place - 1]} metric={metric} width={colW} />
      ))}
    </View>
  );
}

function PodiumColumn({
  place, entry, metric, width,
}: { place: Place; entry: LeaderboardEntry | undefined; metric: LeaderboardMetric; width: number }) {
  const reduceMotion = useReducedMotion();
  const avatar = AVATAR[place];

  return (
    <Reanimated.View
      entering={reduceMotion ? undefined : FadeInUp.delay(REVEAL_DELAY[place]).duration(460).easing(Easing.out(Easing.cubic))}
      style={[s.column, { width }]}
    >
      {entry ? (
        <Floating place={place}>
          <View style={{ width: avatar, height: avatar }}>
            <Avatar size={avatar} uri={null} name={entry.name} color={entry.circleColor ?? "#2A2A2A"} />
            <View style={[s.badge, { top: -avatar * 0.06, right: -avatar * 0.1 }]}>
              <RankBadge place={place} size={place === 1 ? 32 : 28} />
            </View>
          </View>
        </Floating>
      ) : (
        <View style={[s.emptyAvatar, { width: avatar, height: avatar, borderRadius: avatar / 2 }]} />
      )}

      <Text style={[s.name, !entry && { color: MUTED }]} numberOfLines={1}>
        {entry ? entry.name : "Ledig plats"}
      </Text>
      <View style={[s.chip, !entry && { opacity: 0 }]}>
        <Text style={s.chipText}>{entry ? formatLeaderboardValue(metric, entry.value) : "–"}</Text>
        <MetricIcon metric={metric} />
      </View>

      <PodiumBlock place={place} width={width} />
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

/** Själva blocket, belyst som i referensen: en ljus ovansida (det är den som ger djupet), en
 * framsida som är ljusast upptill och tonar mot mörker nedåt, och mörkare sidokanter (ljuset
 * faller mitt på blocket) plus en tunn ljuskant där ovansidan möter framsidan. */
function PodiumBlock({ place, width }: { place: Place; width: number }) {
  const height = BLOCK_H[place];
  const front = height - TOP_FACE;
  return (
    <View style={{ width, height, marginTop: 14 }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`podiumTop${place}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.46} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.28} />
          </LinearGradient>
          <LinearGradient id={`podiumFront${place}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.09} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.015} />
          </LinearGradient>
          <LinearGradient id={`podiumSides${place}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.32} />
            <Stop offset="0.22" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.78" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.32} />
          </LinearGradient>
        </Defs>
        <Polygon
          points={`${TOP_INSET},0 ${width - TOP_INSET},0 ${width},${TOP_FACE} 0,${TOP_FACE}`}
          fill={`url(#podiumTop${place})`}
        />
        <Rect x={0} y={TOP_FACE} width={width} height={front} fill={`url(#podiumFront${place})`} />
        <Rect x={0} y={TOP_FACE} width={width} height={front} fill={`url(#podiumSides${place})`} />
        <Rect x={0} y={TOP_FACE} width={width} height={1.5} fill="#FFFFFF" fillOpacity={0.35} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.numberWrap]} pointerEvents="none">
        <Text style={[s.number, { fontSize: place === 1 ? 60 : 48 }]}>{place}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", alignSelf: "center" },
  spotAnchor: { position: "absolute" },
  column: { alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute" },
  badgeText: { fontFamily: "Montserrat_700Bold", includeFontPadding: false },
  emptyAvatar: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.2)" },
  name: {
    fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG,
    marginTop: 12, paddingHorizontal: 4, maxWidth: "100%",
  },
  // Rektangulär med lätt rundade hörn, inte en rund pill — som i referensen
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: FG },
  numberWrap: { top: TOP_FACE, alignItems: "center", justifyContent: "center" },
  number: { fontFamily: "Montserrat_700Bold", color: NUMBER_COLOR },
});
