/**
 * Österlenboken: alla minnen i en vertikal, bubblig tidslinje i stället för en vanlig lista med
 * säsongskapitel (den gamla vyn). Varje minne är en cirkel, nyast överst, bundna till varandra
 * av en tunn linje som ett pärlband. En varm glöd i användarens EGEN Österlenpass-färg (samma
 * färgkälla som glöden bakom profilringen på en väns sida, se friend/[id].tsx) ligger bakom allt
 * — gör sidan personlig utan att hårdkoda en egen färg.
 *
 * Sidans egen kromning (bakåtpilen, +) ligger UTANFÖR scrollytan och rör sig aldrig — det är
 * cirkelraden som har en fast yta att scrolla INUTI, inte sidan som scrollar som helhet. Vilken
 * cirkel som helst som passerar en fokuszon nära toppen av den ytan blir den aktiva: den växer
 * till sin fulla storlek och dess titel/datum/antal foton/antal platser tonar in bredvid den,
 * medan grannarna krymper och deras text tonar bort. Allt är direkt kopplat till scrollpositionen
 * (ingen egen timing-animation ovanpå) — det är därför det känns som att MAN SJÄLV drar innehållet
 * förbi en fast punkt, inte att man scrollar en sida.
 */
import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus, Image as ImageIcon } from "lucide-react-native";
import { useMemories, useSignedUrls, type Memory } from "@/hooks/useMemories";
import { useProfile } from "@/hooks/useProfile";
import { formatMemoryDate } from "@/lib/memories";
import { getVariant } from "@/lib/cardVariants";
import { tint } from "@/theme/categories";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { LoadingImage } from "@/components/LoadingImage";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

const MAX_SIZE = 108;
const MIN_SIZE = 44;
const ITEM_H = 128;
// Avståndet (i px scrollat) innan en cirkel hunnit krympa helt till MIN_SIZE — satt lite större
// än ett enda ITEM_H så övergången sträcker sig över sina grannar i stället för att kännas hackig.
const FOCUS_RANGE = ITEM_H * 1.35;
const CIRCLE_LEFT = 28;

export default function MemoriesBookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: memories = [], isLoading } = useMemories();
  const { data: profile } = useProfile();
  const { data: urls = {} } = useSignedUrls(memories.map((m) => m.photoPaths[0]).filter(Boolean));

  const glowColor = useMemo(() => tint(getVariant(profile?.card_color).bg, 0.35), [profile?.card_color]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  // Fokuszonen: var i ytan (räknat från scrollytans egen topp) en cirkel räknas som "aktiv".
  // Nära toppen, med plats kvar för att den FULLA MAX_SIZE-cirkeln ska synas helt.
  const focusY = MAX_SIZE / 2 + 24;
  const glowSize = width * 1.7;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Varm glöd i användarens egen passfärg, ankrad högst upp — bleknar neråt i mörkret. */}
      <View style={{ position: "absolute", top: -glowSize * 0.62, left: (width - glowSize) / 2 }} pointerEvents="none">
        <RadialGlow size={glowSize} color={glowColor} opacity={0.55} radiusRatio={1} />
      </View>

      {/* Fast header — ligger UTANFÖR scrollytan, rör sig aldrig. */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.push("/memories/edit" as any)}>
          <Plus size={22} color={FG} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={GOLD} />
      ) : memories.length === 0 ? (
        <Text style={s.empty}>Inga minnen än. Tryck på + för att skapa det första.</Text>
      ) : (
        <Animated.ScrollView
          style={{ flex: 1 }}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 260 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ height: focusY - MAX_SIZE / 2 }} />
          <View style={{ position: "relative" }}>
            {memories.length > 1 && (
              <View
                style={[
                  s.thread,
                  { left: CIRCLE_LEFT + MAX_SIZE / 2 - 1, top: MAX_SIZE / 2, height: (memories.length - 1) * ITEM_H },
                ]}
              />
            )}
            {memories.map((m, i) => (
              <MemoryBead
                key={m.id}
                memory={m}
                cover={urls[m.photoPaths[0]]}
                index={i}
                scrollY={scrollY}
                onPress={() => router.push(`/memories/${m.id}` as any)}
              />
            ))}
          </View>
        </Animated.ScrollView>
      )}
    </View>
  );
}

function MemoryBead({
  memory, cover, index, scrollY, onPress,
}: { memory: Memory; cover: string | undefined; index: number; scrollY: SharedValue<number>; onPress: () => void }) {
  // Cirkelns egen position i scrollytan är konstant (index * ITEM_H); fokuszonen ligger kvar på
  // samma ställe i FÖNSTRET — så avståndet till fokus är helt enkelt skillnaden mellan hur långt
  // cirkeln FLYTTAT (index * ITEM_H) och hur långt man SCROLLAT (scrollY.value).
  const circleStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index * ITEM_H - scrollY.value);
    const scale = interpolate(
      dist,
      [0, FOCUS_RANGE * 0.5, FOCUS_RANGE],
      [1, 0.72, MIN_SIZE / MAX_SIZE],
      Extrapolation.CLAMP
    );
    return { transform: [{ scale }] };
  });
  const textStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index * ITEM_H - scrollY.value);
    const opacity = interpolate(dist, [0, FOCUS_RANGE * 0.55, FOCUS_RANGE], [1, 0, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const photoCount = memory.photoPaths.length;
  const placeCount = memory.placeIds.length;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[s.row, { paddingLeft: CIRCLE_LEFT }]}>
      <Animated.View style={[s.circle, circleStyle]}>
        {cover ? (
          <LoadingImage source={{ uri: cover }} style={StyleSheet.absoluteFillObject} resizeMode="cover" indicatorColor={FG} />
        ) : (
          <View style={s.noCover}>
            <ImageIcon size={26} color="rgba(255,255,255,0.25)" strokeWidth={1.5} />
          </View>
        )}
      </Animated.View>
      <Animated.View style={[s.beadText, textStyle]}>
        <Text style={s.beadTitle} numberOfLines={2}>{memory.title}</Text>
        <Text style={s.beadDate}>{formatMemoryDate(memory.memoryDate)}</Text>
        <Text style={s.beadMeta}>
          {photoCount} {photoCount === 1 ? "foto" : "foton"}
          {placeCount > 0 ? ` · ${placeCount} ${placeCount === 1 ? "plats" : "platser"}` : ""}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    height: 64, paddingHorizontal: 16,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  empty: {
    fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED, textAlign: "center",
    marginTop: 60, paddingHorizontal: 32,
  },

  // Pärlbandets tråd — bakom cirklarna (tidigare i JSX-ordningen = ritas under dem).
  thread: { position: "absolute", width: 2, backgroundColor: "rgba(255,255,255,0.14)" },

  row: { height: ITEM_H, flexDirection: "row", alignItems: "center" },
  circle: {
    width: MAX_SIZE, height: MAX_SIZE, borderRadius: MAX_SIZE / 2, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.22)",
  },
  noCover: { flex: 1, alignItems: "center", justifyContent: "center" },
  beadText: { marginLeft: 20, flex: 1 },
  beadTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: FG },
  beadDate: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED, marginTop: 3 },
  beadMeta: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 2 },
});
