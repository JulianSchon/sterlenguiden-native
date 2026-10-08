/**
 * Österlenboken: alla minnen i en vertikal, bubblig tidslinje i stället för en vanlig lista med
 * säsongskapitel (den gamla vyn). Varje minne är en cirkel, nyast överst, bundna till varandra
 * av en tunn linje som ett pärlband — INTE rakt nedåt, utan en lätt slingrande väg (varje cirkel
 * har en egen, fast sidledes förskjutning efter en sinuskurva på sitt index, så de aldrig
 * staplas i en helt rak kolumn). En varm glöd i användarens EGEN Österlenpass-färg (samma
 * färgkälla som glöden bakom profilringen på en väns sida, se friend/[id].tsx) ligger bakom allt
 * — gör sidan personlig utan att hårdkoda en egen färg.
 *
 * Sidans egen kromning (bakåtpilen, +) ligger UTANFÖR scrollytan och rör sig aldrig — det är
 * cirkelraden som har en fast yta att scrolla INUTI, inte sidan som scrollar som helhet. Vilken
 * cirkel som helst som passerar en fokuszon nära toppen av den ytan blir den aktiva: den växer
 * mycket större än de andra, och dess titel/datum/antal foton/antal platser tonar in bredvid
 * den, medan grannarna krymper och deras text tonar bort. Varje cirkel har också en tunn ring
 * med ett tomt mellanrum mot fotot — när cirkeln är aktiv fylls det mellanrummet med en svag,
 * grå glöd (en egen "vald"-markering, skild från själva storleksändringen). Allt är direkt
 * kopplat till scrollpositionen (ingen egen timing-animation ovanpå) — det är därför det känns
 * som att MAN SJÄLV drar innehållet förbi en fast punkt, inte att man scrollar en sida.
 */
import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Polyline } from "react-native-svg";
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

const CIRCLE_BASE_LEFT = 20;

/** Sidledes förskjutning för cirkel `i` — en fast (inte scroll-beroende) sinuskurva, så vägen
 * genom alla minnen slingrar naturligt i stället för att gå i en rak kolumn. 1.7 radianer per
 * steg ger en sekvens som inte känns som ett enkelt vänster-höger-vänster-mönster. */
function wobbleX(i: number, amplitude: number): number {
  return Math.sin(i * 1.7) * amplitude;
}

export default function MemoriesBookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: memories = [], isLoading } = useMemories();
  const { data: profile } = useProfile();
  const { data: urls = {} } = useSignedUrls(memories.map((m) => m.photoPaths[0]).filter(Boolean));

  const glowColor = useMemo(() => tint(getVariant(profile?.card_color).bg, 0.35), [profile?.card_color]);

  // Storlekarna är satta i förhållande till skärmbredden (den aktiva cirkeln ska dominera ytan,
  // som i referensen), inte fasta pixelvärden — annars blir den löjligt stor på en liten skärm
  // eller för liten på en stor.
  const MAX_SIZE = Math.round(width * 0.56);
  const MIN_SIZE = Math.round(MAX_SIZE * 0.38);
  const ITEM_H = Math.round(MAX_SIZE * 1.25);
  const FOCUS_RANGE = ITEM_H * 1.3;
  const GAP = Math.round(MAX_SIZE * 0.07);
  const WOBBLE_AMPLITUDE = Math.round(MAX_SIZE * 0.14);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  // Fokuszonen: var i ytan (räknat från scrollytans egen topp) en cirkel räknas som "aktiv".
  // Måste räknas från ITEM_H (radens höjd), inte MAX_SIZE — annars blir "spacer" nedan negativ
  // (ITEM_H > MAX_SIZE sedan raderna gjordes höga nog att rymma den stora cirkeln utan att
  // grannraderna krockar).
  const focusY = ITEM_H / 2 + 24;

  // Pärlbandets tråd — en enda polyline genom alla cirklars FAKTISKA mittpunkter (samma
  // wobbleX som varje cirkel själv använder, så linjen alltid möter cirkeln exakt i dess mitt).
  const threadPoints = useMemo(
    () => memories
      .map((_, i) => {
        const cx = CIRCLE_BASE_LEFT + wobbleX(i, WOBBLE_AMPLITUDE) + MAX_SIZE / 2;
        const cy = ITEM_H / 2 + i * ITEM_H;
        return `${cx},${cy}`;
      })
      .join(" "),
    [memories, WOBBLE_AMPLITUDE, MAX_SIZE, ITEM_H]
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Varm glöd i användarens egen passfärg, ankrad högst upp — bleknar neråt i mörkret. */}
      <View style={{ position: "absolute", top: -width * 1.7 * 0.62, left: (width - width * 1.7) / 2 }} pointerEvents="none">
        <RadialGlow size={width * 1.7} color={glowColor} opacity={0.55} radiusRatio={1} />
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
          <View style={{ height: focusY - ITEM_H / 2 }} />
          <View style={{ position: "relative", height: memories.length * ITEM_H }}>
            {memories.length > 1 && (
              <Svg width={width} height={memories.length * ITEM_H} style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <Polyline
                  points={threadPoints}
                  fill="none"
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            )}
            {memories.map((m, i) => (
              <MemoryBead
                key={m.id}
                memory={m}
                cover={urls[m.photoPaths[0]]}
                index={i}
                scrollY={scrollY}
                maxSize={MAX_SIZE}
                minSize={MIN_SIZE}
                itemH={ITEM_H}
                focusRange={FOCUS_RANGE}
                gap={GAP}
                offsetX={CIRCLE_BASE_LEFT + wobbleX(i, WOBBLE_AMPLITUDE)}
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
  memory, cover, index, scrollY, maxSize, minSize, itemH, focusRange, gap, offsetX, onPress,
}: {
  memory: Memory; cover: string | undefined; index: number; scrollY: SharedValue<number>;
  maxSize: number; minSize: number; itemH: number; focusRange: number; gap: number; offsetX: number;
  onPress: () => void;
}) {
  // Cirkelns egen position i scrollytan är konstant (index * itemH); fokuszonen ligger kvar på
  // samma ställe i FÖNSTRET — så avståndet till fokus är helt enkelt skillnaden mellan hur långt
  // cirkeln FLYTTAT (index * itemH) och hur långt man SCROLLAT (scrollY.value).
  const circleStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index * itemH - scrollY.value);
    const scale = interpolate(dist, [0, focusRange * 0.5, focusRange], [1, 0.62, minSize / maxSize], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });
  // Ringens mellanrum fylls bara när cirkeln är NÄRA fokus — en snävare zon än storleksfallet,
  // så det tydligt läses som en egen "vald"-markering, inte bara en spegling av storleken.
  // backgroundColor nedan är en SOLID grå (inte en rgba med egen alfa) — opaciteten här är den
  // ENDA platsen som styr synligheten, annars multiplicerar två halvgenomskinliga lager ihop
  // till nästan ingenting synligt alls.
  const fillStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index * itemH - scrollY.value);
    const opacity = interpolate(dist, [0, focusRange * 0.4], [0.22, 0], Extrapolation.CLAMP);
    return { opacity };
  });
  const textStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index * itemH - scrollY.value);
    const opacity = interpolate(dist, [0, focusRange * 0.55, focusRange], [1, 0, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const photoCount = memory.photoPaths.length;
  const placeCount = memory.placeIds.length;
  const photoSize = maxSize - gap * 2;

  return (
    <View style={[s.row, { height: itemH }]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[s.circleOuter, { width: maxSize, height: maxSize, borderRadius: maxSize / 2, top: (itemH - maxSize) / 2, left: offsetX }]}
      >
        <Animated.View style={[StyleSheet.absoluteFillObject, { borderRadius: maxSize / 2 }, circleStyle]}>
          {/* Ringen — tunn, alltid synlig */}
          <View style={[StyleSheet.absoluteFillObject, { borderRadius: maxSize / 2, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)" }]} />
          {/* Mellanrummets fyllning — bara synlig när cirkeln är vald */}
          <Animated.View style={[StyleSheet.absoluteFillObject, { borderRadius: maxSize / 2, backgroundColor: "#9A9A9A" }, fillStyle]} />
          {/* Fotot, centrerat innanför mellanrummet */}
          <View style={{ position: "absolute", top: gap, left: gap, width: photoSize, height: photoSize, borderRadius: photoSize / 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" }}>
            {cover ? (
              <LoadingImage source={{ uri: cover }} style={StyleSheet.absoluteFillObject} resizeMode="cover" indicatorColor={FG} />
            ) : (
              <View style={s.noCover}>
                <ImageIcon size={Math.round(maxSize * 0.22)} color="rgba(255,255,255,0.25)" strokeWidth={1.5} />
              </View>
            )}
          </View>
        </Animated.View>
      </TouchableOpacity>

      <Animated.View
        style={[s.beadText, { top: (itemH - maxSize) / 2, left: offsetX + maxSize + 16, right: 16 }, textStyle]}
        pointerEvents="none"
      >
        <Text style={s.beadTitle} numberOfLines={2}>{memory.title}</Text>
        <Text style={s.beadDate}>{formatMemoryDate(memory.memoryDate)}</Text>
        <Text style={s.beadMeta}>
          {photoCount} {photoCount === 1 ? "foto" : "foton"}
          {placeCount > 0 ? ` · ${placeCount} ${placeCount === 1 ? "plats" : "platser"}` : ""}
        </Text>
      </Animated.View>
    </View>
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

  row: { position: "relative", width: "100%" },
  circleOuter: { position: "absolute" },
  noCover: { flex: 1, alignItems: "center", justifyContent: "center" },
  beadText: { position: "absolute" },
  beadTitle: { fontFamily: "Montserrat_700Bold", fontSize: 19, color: FG },
  beadDate: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED, marginTop: 4 },
  beadMeta: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 2 },
});
