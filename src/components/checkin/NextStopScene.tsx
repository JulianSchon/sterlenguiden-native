/**
 * Sista steget i incheckningens belöning: "Vart härnäst?" — de närmaste platserna härifrån som
 * man inte besökt än, med bild, avstånd och om de har ett erbjudande eller är öppna just nu.
 * Ett tryck öppnar platsen. Varje besök slutar alltså med en konkret anledning att göra nästa
 * (och platserna runt omkring syns för den som redan är ute och rör sig).
 */
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, { Easing, FadeIn, FadeInDown } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { ChevronRight, MapPin, Tag } from "lucide-react-native";
import { firstImageUrl, type Place } from "@/hooks/usePlaces";
import { formatDistance } from "@/lib/checkin";
import { LoadingImage } from "@/components/LoadingImage";
import { PressableScale } from "@/components/PressableScale";
import { GOLD } from "./CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.6)";
const GREEN = "#4ADE80";
const CARD = "#17171A";

export interface NextStop {
  place: Place;
  /** Avstånd från platsen man nyss checkade in på */
  distanceM: number;
  hasOffer: boolean;
  openNow: boolean;
  categoryLabel: string | null;
}

export function NextStopScene({
  stops, skip, onReady, onOpen,
}: {
  stops: NextStop[];
  skip: boolean;
  onReady: () => void;
  onOpen: (placeId: number) => void;
}) {
  useEffect(() => {
    if (skip) {
      onReady();
      return;
    }
    const land = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 420);
    const ready = setTimeout(onReady, 700);
    return () => {
      clearTimeout(land);
      clearTimeout(ready);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  const [first, ...rest] = stops;
  const enter = (delay: number) => FadeInDown.delay(delay).duration(480).easing(Easing.out(Easing.cubic));
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <Reanimated.View entering={FadeIn.duration(420)} style={s.header}>
        <Text style={s.eyebrow}>NÄSTA STOPP</Text>
        <Text style={s.title}>Vart härnäst?</Text>
        <Text style={s.sub}>Nära dig, och inte besökta än</Text>
      </Reanimated.View>
      {first && (
        <Reanimated.View entering={enter(200)}>
          <BigStop stop={first} onPress={() => onOpen(first.place.id)} />
        </Reanimated.View>
      )}
      {rest.map((stop, i) => (
        <Reanimated.View key={stop.place.id} entering={enter(340 + i * 90)}>
          <SmallStop stop={stop} onPress={() => onOpen(stop.place.id)} />
        </Reanimated.View>
      ))}
    </ScrollView>
  );
}

function metaText(stop: NextStop) {
  return [`${formatDistance(stop.distanceM)} härifrån`, stop.categoryLabel].filter(Boolean).join("  ·  ");
}

function Badges({ stop }: { stop: NextStop }) {
  if (!stop.hasOffer && !stop.openNow) return null;
  return (
    <View style={s.badges}>
      {stop.hasOffer && (
        <View style={[s.badge, s.offerBadge]}>
          <Tag size={11} color="#16120A" strokeWidth={2.4} />
          <Text style={s.offerText}>Erbjudande</Text>
        </View>
      )}
      {stop.openNow && (
        <View style={[s.badge, s.openBadge]}>
          <View style={s.openDot} />
          <Text style={s.openText}>Öppet nu</Text>
        </View>
      )}
    </View>
  );
}

/** Den närmaste: stort kort med bilden i helformat och info nedtill, som platskortet i stämpeln. */
function BigStop({ stop, onPress }: { stop: NextStop; onPress: () => void }) {
  const image = firstImageUrl(stop.place.image_url) ?? firstImageUrl(stop.place.logo_url);
  const gradId = `nextFade${stop.place.id}`;
  return (
    <PressableScale style={s.big} scale={0.98} onPress={onPress}>
      {image ? (
        <LoadingImage source={{ uri: image }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.noImage]}>
          <MapPin size={30} color={GOLD} strokeWidth={2} />
        </View>
      )}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" pointerEvents="none">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.3" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.68" stopColor="#000" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
      </Svg>
      <View style={s.bigBadges}><Badges stop={stop} /></View>
      <View style={s.bigInfo}>
        <View style={{ flex: 1 }}>
          <Text style={s.bigName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{stop.place.name}</Text>
          <Text style={s.bigMeta} numberOfLines={1}>{metaText(stop)}</Text>
        </View>
        <View style={s.go}>
          <ChevronRight size={20} color="#16120A" strokeWidth={2.6} />
        </View>
      </View>
      <View style={s.bigBorder} pointerEvents="none" />
    </PressableScale>
  );
}

function SmallStop({ stop, onPress }: { stop: NextStop; onPress: () => void }) {
  const image = firstImageUrl(stop.place.image_url) ?? firstImageUrl(stop.place.logo_url);
  return (
    <PressableScale style={s.small} scale={0.98} onPress={onPress}>
      {image ? (
        <LoadingImage source={{ uri: image }} resizeMode="cover" style={s.thumb} />
      ) : (
        <View style={[s.thumb, s.noImage]}><MapPin size={20} color={GOLD} strokeWidth={2} /></View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.smallName} numberOfLines={1}>{stop.place.name}</Text>
        <Text style={s.smallMeta} numberOfLines={1}>{metaText(stop)}</Text>
        <Badges stop={stop} />
      </View>
      <ChevronRight size={18} color={MUTED} strokeWidth={2} />
    </PressableScale>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 20, gap: 10 },
  header: { alignItems: "center", marginBottom: 8 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 2.4, color: "rgba(245,241,232,0.58)" },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 30, color: FG, marginTop: 6 },
  sub: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED, marginTop: 4 },

  big: { height: 196, borderRadius: 22, overflow: "hidden", backgroundColor: CARD },
  noImage: { backgroundColor: "#24242A", alignItems: "center", justifyContent: "center" },
  bigBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 22, borderWidth: 1, borderColor: "rgba(233,196,106,0.35)" },
  bigBadges: { position: "absolute", top: 12, left: 12 },
  bigInfo: { position: "absolute", left: 16, right: 14, bottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  bigName: { fontFamily: "Montserrat_700Bold", fontSize: 21, color: "#FFFFFF" },
  bigMeta: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: "rgba(255,255,255,0.78)", marginTop: 3 },
  go: { width: 36, height: 36, borderRadius: 18, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },

  small: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18,
    backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  smallName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  smallMeta: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 2 },

  badges: { flexDirection: "row", gap: 6, marginTop: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  offerBadge: { backgroundColor: GOLD },
  offerText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#16120A" },
  openBadge: { backgroundColor: "rgba(10,10,10,0.6)", borderWidth: 1, borderColor: "rgba(74,222,128,0.45)" },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  openText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: GREEN },
});
