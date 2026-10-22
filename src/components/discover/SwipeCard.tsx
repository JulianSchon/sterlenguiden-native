/**
 * Ett kort i Upptäcks kortlek: platsens bild över hela kortet med en mjuk toning nertill, och
 * kategori, namn, öppet/avstånd och en kort beskrivning ovanpå toningen.
 *
 * - Dra åt höger = spara (stämpeln SPARA tonar fram), åt vänster = skippa. Släpper man efter en
 *   bit — eller kastar kortet — flyger det ut åt det hållet; annars fjädrar det tillbaka.
 * - Tryck på bildens högra del = nästa bild, vänstra = förra (strecken överst visar var man är).
 * - Knappen nere till höger öppnar platssidan (trycket räknas av kortets eget tryck, så det inte
 *   också byter bild).
 *
 * Allt rör sig på UI-tråden (Reanimated + gesture handler), så kortet följer fingret helt jämnt.
 * Kortlekens läge delas av alla kort (DeckState): vilket kort som ligger överst, hur långt det
 * överst dragits (korten under växer fram i takt), och knapparnas "kasta"-begäran. När ett kort
 * flugit ut byter alla kort plats i samma bildruta — inget blinkar.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import i18n from "i18next";
import { StyleSheet, Text, View } from "react-native";
import Reanimated, {
  Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { ArrowUpRight, Heart, MapPin } from "lucide-react-native";
import type { Place } from "@/hooks/usePlaces";
import { findCategory } from "@/theme/categories";
import { CATEGORY_DOT } from "@/components/search/SearchParts";
import { distanceLabel } from "@/lib/mapFilters";
import { openInfo } from "@/lib/search";

export interface DeckState {
  /** Kortet som ligger överst (dess plats i kön) */
  top: SharedValue<number>;
  /** Hur långt kortet överst dragits, 0–1 — korten under växer fram i takt */
  progress: SharedValue<number>;
  /** Knapparna: kasta kortet överst åt dir (1 = spara, −1 = skippa); n räknas upp vid varje tryck */
  fly: SharedValue<{ dir: number; n: number }>;
}

/** Bilderna ur image_url (flera adresser skilda med komma — Wix-adresser har komman i sig) */
export const imagesOf = (imageUrl: string | null | undefined) =>
  (imageUrl ?? "").split(/,(?=\s*https?:\/\/)/).map((u) => u.trim()).filter(Boolean).slice(0, 6);

const SPRING = { stiffness: 380, damping: 32 };
/** Släpp efter så stor del av bredden, eller kasta snabbare än så, så flyger kortet ut */
const THRESHOLD = 0.3;
const FLING = 800;
const OPEN = "#4ADE80";
const CLOSED = "#F87171";
/** Grönt = ja (spara), rött = nej (skippa) */
export const YES = "#22C55E";
export const NO = "#EF4444";
/** Öppna-knappens tryckyta nere till höger (knappen plus lite marginal) */
const OPEN_HIT = 84;

export const SwipeCard = memo(function SwipeCard({
  place, index, isTop, km, deck, width, onDecide, onOpen,
}: {
  place: Place;
  /** Kortets plats i kön */
  index: number;
  /** Kortet överst (bara det går att dra) */
  isTop: boolean;
  /** Fågelvägen från en själv, om positionen är känd */
  km: number | null;
  deck: DeckState;
  width: number;
  /** Kortet har flugit ut: 1 = sparat, −1 = skippat */
  onDecide: (index: number, place: Place, dir: 1 | -1) => void;
  onOpen: (place: Place) => void;
}) {
  const tx = useSharedValue(0);
  const height = useSharedValue(0);
  const ty = useSharedValue(0);
  const flying = useSharedValue(false);
  const images = useMemo(() => imagesOf(place.image_url), [place.image_url]);
  const [photo, setPhoto] = useState(0);
  const cat = findCategory(place.category);
  const open = openInfo(place);

  // Kortet överst: ladda alla dess bilder, så nästa bild finns direkt när man trycker
  useEffect(() => {
    if (isTop && images.length > 1) ExpoImage.prefetch(images).catch(() => {});
  }, [isTop, images]);

  const decide = useCallback((dir: 1 | -1) => onDecide(index, place, dir), [onDecide, index, place]);
  const tick = useCallback(() => { Haptics.selectionAsync().catch(() => {}); }, []);
  const openPlace = useCallback(() => onOpen(place), [onOpen, place]);
  const tapAt = useCallback((x: number) => {
    if (images.length < 2) return;
    setPhoto((p) => (x < width * 0.38 ? Math.max(0, p - 1) : Math.min(images.length - 1, p + 1)));
    Haptics.selectionAsync().catch(() => {});
  }, [images.length, width]);

  const flyOut = useCallback((dir: 1 | -1, vx = 0, vy = 0) => {
    "worklet";
    if (flying.value) return;
    flying.value = true;
    // Ju hårdare kast, desto snabbare iväg
    const ms = Math.max(170, 280 - Math.min(110, Math.abs(vx) / 25));
    ty.value = withTiming(ty.value + vy * 0.08, { duration: ms });
    tx.value = withTiming(dir * width * 1.5, { duration: ms, easing: Easing.out(Easing.quad) }, (done) => {
      if (!done) return;
      // Alla kort byter plats i samma bildruta: nästa blir det överst, i full storlek
      deck.progress.value = 0;
      deck.top.value = index + 1;
      runOnJS(decide)(dir);
    });
  }, [flying, tx, ty, width, deck, index, decide]);

  // Korten under växer fram i takt med att kortet överst dras iväg
  useAnimatedReaction(() => tx.value, (x) => {
    if (deck.top.value !== index) return;
    deck.progress.value = Math.min(1, Math.abs(x) / (width * 0.5));
  });
  // Ett litet klick när man drar förbi gränsen (och tillbaka)
  useAnimatedReaction(() => Math.abs(tx.value) > width * THRESHOLD, (over, prev) => {
    if (prev !== null && over !== prev && deck.top.value === index && !flying.value) runOnJS(tick)();
  });
  // Knapparna under kortleken
  useAnimatedReaction(() => deck.fly.value.n, (n, prev) => {
    if (prev !== null && n !== prev && deck.top.value === index) flyOut(deck.fly.value.dir === 1 ? 1 : -1);
  });

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(isTop)
      .onUpdate((e) => {
        if (flying.value) return;
        tx.value = e.translationX;
        ty.value = e.translationY * 0.35;
      })
      .onEnd((e) => {
        if (flying.value) return;
        const x = tx.value;
        const dir = x > width * THRESHOLD || e.velocityX > FLING ? 1 : x < -width * THRESHOLD || e.velocityX < -FLING ? -1 : 0;
        if (dir !== 0) {
          flyOut(dir, e.velocityX, e.velocityY);
          return;
        }
        tx.value = withSpring(0, SPRING);
        ty.value = withSpring(0, SPRING);
      });
    const tap = Gesture.Tap()
      .enabled(isTop)
      .maxDistance(10)
      .onEnd((e, ok) => {
        if (!ok) return;
        // Knappen nere till höger öppnar platsen; resten av kortet bläddrar bland bilderna
        if (e.x > width - OPEN_HIT && e.y > height.value - OPEN_HIT) runOnJS(openPlace)();
        else runOnJS(tapAt)(e.x);
      });
    return Gesture.Race(pan, tap);
  }, [isTop, flying, tx, ty, width, height, flyOut, tapAt, openPlace]);

  const cardStyle = useAnimatedStyle(() => {
    const d = index - deck.top.value;
    if (d < 0) return { opacity: 0, transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: "0deg" }, { scale: 1 }] };
    if (d === 0) {
      return {
        opacity: 1,
        transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${(tx.value / width) * 12}deg` }, { scale: 1 }],
      };
    }
    // Under: lite mindre och lite längre ner, och växer fram när kortet överst dras iväg
    const p = deck.progress.value;
    const scale = d === 1 ? 0.95 + 0.05 * p : 0.9 + 0.05 * p;
    const y = d === 1 ? 14 - 14 * p : 28 - 14 * p;
    return { opacity: d > 2 ? 0 : 1, transform: [{ translateX: 0 }, { translateY: y }, { rotate: "0deg" }, { scale }] };
  });
  // Ljuset bakom just det här kortet: grönt åt spara-hållet, rött åt skippa-hållet, starkare ju längre
  const yesGlow = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, tx.value / (width * 0.5))) }));
  const noGlow = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -tx.value / (width * 0.5))) }));
  const likeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (tx.value - 20) / 80)) }));
  const nopeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (-tx.value - 20) / 80)) }));

  const image = images[photo] ?? null;
  const CatIcon = cat?.icon ?? MapPin;
  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View
        style={[StyleSheet.absoluteFill, s.card, cardStyle]}
        onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}
      >
        {/* Ljuset ligger bakom kortet och följer med det; syns runt kanterna */}
        <Glow color={YES} id={`y${place.id}`} style={yesGlow} />
        <Glow color={NO} id={`n${place.id}`} style={noGlow} />
        <View style={s.clip}>
          {image ? (
            <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={120} />
          ) : (
            <View style={[StyleSheet.absoluteFill, s.noImage]}>
              <CatIcon size={64} color="rgba(255,255,255,0.25)" strokeWidth={1.4} />
            </View>
          )}

          {/* Toningen: bilden är ren upptill och blir mjukt mörk mot texten nertill */}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,0,0,0.38)", "rgba(0,0,0,0.88)"]}
            locations={[0, 0.4, 0.64, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Bildernas streck överst */}
          {images.length > 1 && (
            <>
              <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]} style={s.topShade} pointerEvents="none" />
              <View style={s.bars} pointerEvents="none">
                {images.map((_, i) => (
                  <View key={i} style={[s.bar, { backgroundColor: i === photo ? "#FFFFFF" : "rgba(255,255,255,0.35)" }]} />
                ))}
              </View>
            </>
          )}

          {/* Stämplarna medan man drar */}
          <Reanimated.View style={[s.stamp, s.stampLike, likeStyle]} pointerEvents="none">
            <Heart size={20} color={YES} fill={YES} strokeWidth={2} />
            <Text style={[s.stampText, { color: YES }]}>SPARA</Text>
          </Reanimated.View>
          <Reanimated.View style={[s.stamp, s.stampNope, nopeStyle]} pointerEvents="none">
            <Text style={[s.stampText, { color: NO }]}>SKIPPA</Text>
          </Reanimated.View>

          <View style={s.info} pointerEvents="box-none">
            <View style={{ flex: 1, gap: 6 }} pointerEvents="none">
              <View style={s.catRow}>
                <View style={[s.dot, { backgroundColor: cat ? CATEGORY_DOT.dark[cat.id] : "rgba(255,255,255,0.6)" }]} />
                <Text style={s.cat} numberOfLines={1}>
                  {[cat?.label ?? i18n.t("categories.place"), place.nearest_town].filter(Boolean).join("  ·  ")}
                </Text>
              </View>
              <Text style={s.name} numberOfLines={2}>{place.name}</Text>
              {(open || km != null) && (
                <Text style={s.meta} numberOfLines={1}>
                  {open && <Text style={{ color: open.open ? OPEN : CLOSED }}>{open.label}</Text>}
                  {open && km != null && "  ·  "}
                  {km != null && distanceLabel(km)}
                </Text>
              )}
              {!!place.short_description && <Text style={s.desc} numberOfLines={2}>{place.short_description}</Text>}
            </View>
            <View style={s.openBtn} accessibilityRole="button" accessibilityLabel={i18n.t("discover.open", { name: place.name })}>
              <BlurView intensity={20} tint="dark" style={[StyleSheet.absoluteFill, s.glass]} />
              <ArrowUpRight size={22} color="#FFFFFF" strokeWidth={2.2} />
            </View>
          </View>
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
});

/** Ett mjukt ljus runt kortet (ritat en gång, bara styrkan ändras) */
function Glow({ color, id, style }: { color: string; id: string; style: object }) {
  return (
    <Reanimated.View style={[s.glow, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0.6" stopColor={color} stopOpacity={0.6} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={`url(#${id})`} />
      </Svg>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  glow: { position: "absolute", top: -50, bottom: -50, left: -50, right: -50 },
  // Skuggan på ett kort med hel bakgrund (då räknas den ut en gång, inte för varje bildruta)
  card: {
    borderRadius: 26, backgroundColor: "#1C1C1E",
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 8,
  },
  clip: { flex: 1, borderRadius: 26, overflow: "hidden" },
  noImage: { backgroundColor: "#26262A", alignItems: "center", justifyContent: "center" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0, height: 90 },
  bars: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", gap: 5 },
  bar: { flex: 1, height: 3, borderRadius: 1.5 },

  stamp: {
    position: "absolute", top: 40, flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 3,
  },
  stampLike: { left: 22, borderColor: YES, transform: [{ rotate: "-12deg" }] },
  stampNope: { right: 22, borderColor: NO, transform: [{ rotate: "12deg" }] },
  stampText: { fontFamily: "Montserrat_700Bold", fontSize: 22, letterSpacing: 1.5 },

  info: { position: "absolute", left: 20, right: 16, bottom: 20, flexDirection: "row", alignItems: "flex-end", gap: 14 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cat: { flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: "rgba(255,255,255,0.88)" },
  name: {
    fontFamily: "Montserrat_700Bold", fontSize: 29, lineHeight: 34, letterSpacing: -0.6, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
  meta: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: "rgba(255,255,255,0.82)" },
  desc: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.78)" },
  openBtn: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  glass: { borderRadius: 23, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.45)" },
});
