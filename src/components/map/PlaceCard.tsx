/**
 * Platskortet på kartan (webbappens kort, native-map-full-spec.md §7): stor bild med namn,
 * kategori, öppet/stängt, avstånd och hållplats, hjärtat uppe till höger, och knapparna
 * Navigera och Visa plats.
 *
 * Dra uppåt = öppna platssidan, dra nedåt = stäng. Svep åt sidan = nästa/föregående närmaste plats.
 * Under tärningens blandning visar kortet bara platsen (bilden tonar över), utan gester.
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Reanimated, {
  runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, Bus, Clock, MapPin, Navigation } from "lucide-react-native";
import { firstImageUrl, isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { findCategory } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import { distanceLabel } from "@/lib/mapFilters";
import { HeartButton, type BurstFn } from "@/components/LikeHeart";

const GOLD = "#C5A059";
const IMAGE_H = 230;
/** Kortets höjd (bild + knapprad) — kartan håller sin nederkant ovanför kortet */
export const PLACE_CARD_H = IMAGE_H + 12 + 44 + 12;

const SPRING = { stiffness: 400, damping: 30 };

/** In: underifrån och tonar fram. Ut: samma omvänt */
const cardIn: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 100 }] },
    animations: { opacity: withTiming(1, { duration: 180 }), transform: [{ translateY: withSpring(0, SPRING) }] },
  };
};
const cardOut: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: { opacity: withTiming(0, { duration: 160 }), transform: [{ translateY: withTiming(100, { duration: 200 }) }] },
  };
};

/** "Öppet" / "Stängt" — inte för hotell, natur, sevärdheter eller utan öppettider */
function openStatus(place: Place): boolean | null {
  if (!place.opening_hours) return null;
  const cat = (place.category ?? "").toLowerCase();
  if (["hotell", "b&b", "natur", "upplevelse", "sevärdhet"].some((w) => cat.includes(w))) return null;
  return isPlaceOpen(place.opening_hours as Record<string, string> | null);
}

export function PlaceCard({
  place, bottom, birdKm, saved, interactive, canPrev, canNext,
  onOpen, onNavigate, onToggleSave, onBurst, onClose, onStep,
}: {
  place: Place;
  bottom: number;
  /** Fågelvägen från mig, om positionen är känd */
  birdKm: number | null;
  saved: boolean;
  /** Av under tärningens blandning */
  interactive: boolean;
  canPrev: boolean;
  canNext: boolean;
  onOpen: () => void;
  onNavigate: () => void;
  onToggleSave: () => void;
  onBurst: BurstFn;
  onClose: () => void;
  /** Svep: 1 = nästa närmaste, -1 = föregående */
  onStep: (dir: 1 | -1) => void;
}) {
  const { width } = useWindowDimensions();
  const { scheme, colors } = useTheme();
  const dark = scheme === "dark";
  const category = findCategory(place.category);
  const CatIcon = category?.icon ?? MapPin;
  const image = firstImageUrl(place.image_url);
  const open = openStatus(place);
  const transit = (place as Place & { transit_stop_name?: string | null }).transit_stop_name;

  // Drag: upp/ner (öppna/stäng) eller åt sidan (nästa plats). Riktningen bestäms av första rörelsen
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const axis = useSharedValue(0); // 0 = ej bestämd, 1 = sidled, 2 = höjdled
  const pan = useMemo(() => Gesture.Pan()
    .enabled(interactive)
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onStart(() => { axis.value = 0; })
    .onUpdate((e) => {
      if (axis.value === 0) axis.value = Math.abs(e.translationX) > Math.abs(e.translationY) ? 1 : 2;
      if (axis.value === 1) {
        const can = e.translationX < 0 ? canNext : canPrev;
        tx.value = can ? e.translationX : e.translationX * 0.25;
      } else {
        // Gränser −120 / +60 med motstånd utanför
        const y = e.translationY;
        ty.value = y < -120 ? -120 + (y + 120) * 0.25 : y > 60 ? 60 + (y - 60) * 0.25 : y;
      }
    })
    .onEnd((e) => {
      if (axis.value === 2) {
        if (e.translationY < -80) runOnJS(onOpen)();
        else if (e.translationY > 80) { runOnJS(onClose)(); return; }
        ty.value = withSpring(0, SPRING);
        return;
      }
      const dir = e.translationX < -60 && canNext ? 1 : e.translationX > 60 && canPrev ? -1 : 0;
      if (dir === 0) { tx.value = withSpring(0, SPRING); return; }
      // Ut åt sidan, byt plats, in från andra hållet
      tx.value = withTiming(-dir * width, { duration: 170 }, (done) => {
        if (!done) return;
        runOnJS(onStep)(dir as 1 | -1);
        tx.value = dir * width * 0.35;
        tx.value = withSpring(0, SPRING);
      });
    }), [interactive, canPrev, canNext, width, onOpen, onClose, onStep, tx, ty, axis]);
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: 1 - Math.min(0.4, Math.abs(tx.value) / width),
  }));

  const panelBg = dark ? "#141416" : "#FFFFFF";

  return (
    <Reanimated.View entering={cardIn} exiting={cardOut} style={[s.wrap, { bottom }]}>
      <GestureDetector gesture={pan}>
        <Reanimated.View style={[s.card, { backgroundColor: panelBg, borderColor: colors.border }, dragStyle]}>
          {/* ── Bilden: tryck öppnar platssidan ── */}
          <Pressable onPress={interactive ? onOpen : undefined} style={[s.image, { backgroundColor: colors.fill }]}>
            {image && (
              <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" />
            )}
            <LinearGradient
              colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.9)"]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={s.heart}>
              <HeartButton isFav={saved} onToggle={onToggleSave} onBurst={onBurst} size={18} outline="#FFFFFF" />
            </View>
            <View style={s.text} pointerEvents="none">
              <Text style={s.name} numberOfLines={2}>{place.name}</Text>
              <View style={s.meta}>
                <View style={s.metaItem}>
                  <CatIcon size={12} color={GOLD} strokeWidth={2.2} />
                  <Text style={[s.metaText, s.metaCat]} numberOfLines={1}>{category?.label ?? "Plats"}</Text>
                </View>
                {open !== null && (
                  <View style={s.metaItem}>
                    <Clock size={12} color={open ? "#4ADE80" : "#F87171"} strokeWidth={2.2} />
                    <Text style={[s.metaText, { color: open ? "#4ADE80" : "#F87171" }]}>{open ? "Öppet" : "Stängt"}</Text>
                  </View>
                )}
                {birdKm != null && (
                  <View style={s.metaItem}>
                    <MapPin size={12} color="rgba(255,255,255,0.8)" strokeWidth={2.2} />
                    <Text style={[s.metaText, { color: "rgba(255,255,255,0.8)" }]}>{distanceLabel(birdKm)}</Text>
                  </View>
                )}
              </View>
              {!!transit && (
                <View style={[s.metaItem, { marginTop: 6 }]}>
                  <Bus size={12} color={GOLD} strokeWidth={2.2} />
                  <Text style={[s.metaText, { color: "rgba(255,255,255,0.7)" }]} numberOfLines={1}>{transit}</Text>
                </View>
              )}
            </View>
          </Pressable>

          {/* ── Knapparna ── */}
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.navBtn, { backgroundColor: colors.fill, borderColor: colors.borderStrong }]}
              activeOpacity={0.8}
              onPress={onNavigate}
              disabled={!interactive}
            >
              <Navigation size={16} color={colors.text} strokeWidth={2.2} />
              <Text style={[s.navText, { color: colors.text }]}>Navigera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.viewBtn} activeOpacity={0.85} onPress={onOpen} disabled={!interactive}>
              <LinearGradient colors={["#C5A059", "#B08A3E"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={s.viewText}>Visa plats</Text>
              <ArrowRight size={16} color="#121212" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </Reanimated.View>
      </GestureDetector>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute", left: 12, right: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.45, shadowRadius: 24, elevation: 14,
  },
  card: { borderRadius: 22, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  image: { height: IMAGE_H, overflow: "hidden" },
  heart: {
    position: "absolute", top: 12, right: 12, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  text: { position: "absolute", left: 14, right: 14, bottom: 12 },
  name: {
    fontFamily: "Montserrat_700Bold", fontSize: 20, lineHeight: 24, letterSpacing: -0.3, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
  },
  meta: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 4, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Inter_500Medium", fontSize: 11.5, flexShrink: 1 },
  metaCat: { fontFamily: "Inter_600SemiBold", color: GOLD },
  actions: { flexDirection: "row", gap: 8, padding: 12 },
  navBtn: {
    flex: 1, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  navText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  viewBtn: {
    flex: 1, height: 44, borderRadius: 12, overflow: "hidden",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  viewText: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#121212" },
});
