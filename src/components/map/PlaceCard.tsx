/**
 * Platskorten på kartan (webbappens kort, native-map-full-spec.md §7) i en karusell: den valda
 * platsen och de närmaste runt den. Svep åt sidan = nästa/föregående plats — korten följer fingret
 * och glider på plats (inget gungande), och nästa kort skymtar i kanten. Dra uppåt = öppna
 * platssidan, dra nedåt = stäng.
 *
 * Kortet: stor bild med namn, kategori, öppet/stängt, avstånd och hållplats, hjärtat uppe till
 * höger, och knapparna Navigera och Visa plats. Under tärningens blandning visar karusellen bara
 * platsen (bilden tonar över), utan gester.
 */
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from "react-native";
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

/** Kortens avstånd till skärmkanten och mellan korten: nästa kort skymtar 10 punkter */
const SIDE = 18;
const GAP = 8;
/** Luft i karusellen ovanför och under korten, så att deras skugga får plats */
const PAD_T = 16;
const PAD_B = 28;

/** Fjäder utan studs: glider på plats */
const SETTLE = { stiffness: 400, damping: 40 };

/** Kartans kort glider in underifrån och tonar fram, och ut samma väg */
export const cardIn: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 100 }] },
    animations: { opacity: withTiming(1, { duration: 180 }), transform: [{ translateY: withSpring(0, { stiffness: 400, damping: 36 }) }] },
  };
};
export const cardOut: EntryExitAnimationFunction = () => {
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

export function PlaceCarousel({
  places, index, bottom, interactive, savedIds, distanceKm,
  onIndexChange, onOpen, onNavigate, onToggleSave, onBurst, onClose,
}: {
  places: Place[];
  /** Kortet som står i mitten */
  index: number;
  bottom: number;
  /** Av under tärningens blandning */
  interactive: boolean;
  savedIds: Set<number>;
  /** Fågelvägen från mig till platsen, om positionen är känd */
  distanceKm: (place: Place) => number | null;
  /** Användaren svepte fram ett annat kort */
  onIndexChange: (index: number) => void;
  onOpen: (place: Place) => void;
  onNavigate: (place: Place) => void;
  onToggleSave: (placeId: number) => void;
  onBurst: BurstFn;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const cardW = width - SIDE * 2;
  const step = cardW + GAP;
  const listRef = useRef<FlatList<Place>>(null);

  // Kortet i mitten. Väljs en annan av korten utifrån (en nål trycks) glider karusellen dit; kommer
  // nya kort (en ny plats, tärningen) står den direkt på rätt kort
  const shown = useRef(index);
  const shownPlaces = useRef(places);
  useLayoutEffect(() => {
    const newCards = shownPlaces.current !== places;
    shownPlaces.current = places;
    if (index === shown.current && !newCards) return;
    shown.current = index;
    listRef.current?.scrollToOffset({ offset: index * step, animated: !newCards });
  }, [index, places, step]);

  // Nytt kort i mitten: på iPhone redan när fingret släpper (vart kortet ska glida är känt då), så
  // kartan börjar flytta sig direkt; annars när karusellen stannat
  const placesRef = useRef(places);
  placesRef.current = places;
  const settle = useCallback((x: number) => {
    const i = Math.max(0, Math.min(placesRef.current.length - 1, Math.round(x / step)));
    if (i === shown.current) return;
    shown.current = i;
    onIndexChange(i);
  }, [step, onIndexChange]);
  const onScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent & { targetContentOffset?: { x: number } }>) => {
    const target = e.nativeEvent.targetContentOffset;
    if (target) settle(target.x);
  }, [settle]);
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    settle(e.nativeEvent.contentOffset.x);
  }, [settle]);

  // Dra upp/ner. Sidled tar karusellen själv (den här gesten släpper så fort fingret går åt sidan)
  const openShown = useCallback(() => {
    const place = placesRef.current[shown.current];
    if (place) onOpen(place);
  }, [onOpen]);
  const ty = useSharedValue(0);
  const scroll = useMemo(() => Gesture.Native(), []);
  const drag = useMemo(() => Gesture.Pan()
    .enabled(interactive)
    .activeOffsetY([-12, 12])
    .failOffsetX([-10, 10])
    .onUpdate((e) => {
      // Gränser −120 / +60 med motstånd utanför
      const y = e.translationY;
      ty.value = y < -120 ? -120 + (y + 120) * 0.25 : y > 60 ? 60 + (y - 60) * 0.25 : y;
    })
    .onEnd((e) => {
      if (e.translationY > 80) { runOnJS(onClose)(); return; }
      if (e.translationY < -80) runOnJS(openShown)();
      ty.value = withSpring(0, SETTLE);
    }), [interactive, onClose, openShown, ty]);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  const renderItem = useCallback(({ item }: { item: Place }) => (
    <View style={{ width: step, paddingHorizontal: GAP / 2 }}>
      <PlaceCardView
        place={item}
        birdKm={distanceKm(item)}
        saved={savedIds.has(item.id)}
        interactive={interactive}
        onOpen={onOpen}
        onNavigate={onNavigate}
        onToggleSave={onToggleSave}
        onBurst={onBurst}
      />
    </View>
  ), [step, distanceKm, savedIds, interactive, onOpen, onNavigate, onToggleSave, onBurst]);

  return (
    <Reanimated.View
      entering={cardIn}
      exiting={cardOut}
      style={[s.wrap, { bottom: bottom - PAD_B, height: PLACE_CARD_H + PAD_T + PAD_B }]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={drag}>
        <Reanimated.View style={[s.fill, dragStyle]}>
          <GestureDetector gesture={scroll}>
            <FlatList
              ref={listRef}
              data={places}
              horizontal
              keyExtractor={(_, i) => String(i)}
              renderItem={renderItem}
              extraData={renderItem}
              getItemLayout={(_, i) => ({ length: step, offset: i * step, index: i })}
              initialScrollIndex={index}
              snapToInterval={step}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              scrollEnabled={interactive && places.length > 1}
              showsHorizontalScrollIndicator={false}
              onScrollEndDrag={onScrollEndDrag}
              onMomentumScrollEnd={onMomentumScrollEnd}
              contentContainerStyle={{ paddingHorizontal: SIDE - GAP / 2, paddingTop: PAD_T, paddingBottom: PAD_B }}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={3}
            />
          </GestureDetector>
        </Reanimated.View>
      </GestureDetector>
    </Reanimated.View>
  );
}

const PlaceCardView = memo(function PlaceCardView({
  place, birdKm, saved, interactive, onOpen, onNavigate, onToggleSave, onBurst,
}: {
  place: Place;
  birdKm: number | null;
  saved: boolean;
  interactive: boolean;
  onOpen: (place: Place) => void;
  onNavigate: (place: Place) => void;
  onToggleSave: (placeId: number) => void;
  onBurst: BurstFn;
}) {
  const { scheme, colors } = useTheme();
  const dark = scheme === "dark";
  const category = findCategory(place.category);
  const CatIcon = category?.icon ?? MapPin;
  const image = firstImageUrl(place.image_url);
  const open = openStatus(place);
  const transit = (place as Place & { transit_stop_name?: string | null }).transit_stop_name;
  const panelBg = dark ? "#141416" : "#FFFFFF";

  return (
    // Skuggan på ett helfärgat kort (då räknas den ut en gång, inte för varje bildruta när korten glider)
    <View style={[s.card, { backgroundColor: panelBg }]}>
      <View style={[s.clip, { borderColor: colors.border }]}>
        {/* ── Bilden: tryck öppnar platssidan ── */}
        <Pressable onPress={interactive ? () => onOpen(place) : undefined} style={[s.image, { backgroundColor: colors.fill }]}>
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
            <HeartButton isFav={saved} onToggle={() => onToggleSave(place.id)} onBurst={onBurst} size={18} outline="#FFFFFF" />
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
            onPress={() => onNavigate(place)}
            disabled={!interactive}
          >
            <Navigation size={16} color={colors.text} strokeWidth={2.2} />
            <Text style={[s.navText, { color: colors.text }]}>Navigera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.viewBtn} activeOpacity={0.85} onPress={() => onOpen(place)} disabled={!interactive}>
            <LinearGradient colors={["#C5A059", "#B08A3E"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={s.viewText}>Visa plats</Text>
            <ArrowRight size={16} color="#121212" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0 },
  fill: { flex: 1 },
  card: {
    height: PLACE_CARD_H, borderRadius: 22,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 18, elevation: 12,
  },
  clip: { flex: 1, borderRadius: 22, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
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
