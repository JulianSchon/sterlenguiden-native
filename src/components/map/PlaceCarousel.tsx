/**
 * Korten längst ner på kartan. Trycker man på en nål glider korten upp; man sveper mellan dem och
 * kartan följer med till nästa plats (som i Airbnb och Google Maps). Varje kort: bild, kategori,
 * namn, öppet/stängt och hur långt bort, spara-hjärtat, Visa plats och Vägbeskrivning.
 */
import { memo, useCallback, useEffect, useRef } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Reanimated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { ArrowRight, Navigation } from "lucide-react-native";
import { firstImageUrl, isPlaceOpen, type Place } from "@/hooks/usePlaces";
import type { CategoryDef } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import { HeartButton, type BurstFn } from "@/components/LikeHeart";
import { PIN_COLORS } from "./MapPins";

export interface CarouselItem {
  place: Place;
  category: CategoryDef | undefined;
  saved: boolean;
  /** Platsens nummer i den valda listan */
  listNumber?: number;
}

const GAP = 12;
const SIDE = 20;

/** "Öppet" / "Stängt" — bara för platser där öppettider säger något (inte hotell, natur, sevärdheter) */
function openStatus(place: Place): boolean | null {
  if (!place.opening_hours) return null;
  const cat = (place.category ?? "").toLowerCase();
  if (["hotell", "b&b", "natur", "upplevelse", "sevärdhet"].some((w) => cat.includes(w))) return null;
  return isPlaceOpen(place.opening_hours as Record<string, string> | null);
}

/** "12 min med bil" (vägen är ungefär 30 % längre än fågelvägen) eller "800 m" nära */
export function travelLabel(km: number): string {
  if (km < 1.2) return `${Math.round((km * 1000) / 50) * 50} m bort`;
  const minutes = Math.max(2, Math.round(((km * 1.3) / 55) * 60 + 2));
  return `${minutes} min med bil`;
}

export function PlaceCarousel({
  items, index, distanceKm, onIndexChange, onOpen, onNavigate, onToggleSave, onBurst, bottom,
}: {
  items: CarouselItem[];
  index: number;
  /** Avstånd från mig till platsen, om positionen är känd */
  distanceKm: (place: Place) => number | null;
  onIndexChange: (index: number) => void;
  onOpen: (place: Place) => void;
  onNavigate: (place: Place) => void;
  onToggleSave: (placeId: number) => void;
  onBurst: BurstFn;
  bottom: number;
}) {
  const { width } = useWindowDimensions();
  const cardW = width - SIDE * 2;
  const interval = cardW + GAP;
  const listRef = useRef<FlatList<CarouselItem>>(null);
  // Indexet korten själva står på — så en nål som trycks (index utifrån) scrollar dit, men ett svep
  // inte scrollas tillbaka
  const shownIndex = useRef(index);

  useEffect(() => {
    if (index === shownIndex.current) return;
    shownIndex.current = index;
    listRef.current?.scrollToOffset({ offset: index * interval, animated: true });
  }, [index, interval]);

  const onMomentumEnd = useCallback((x: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(x / interval)));
    if (i === shownIndex.current) return;
    shownIndex.current = i;
    onIndexChange(i);
  }, [interval, items.length, onIndexChange]);

  return (
    <Reanimated.View
      entering={FadeInDown.duration(280)}
      exiting={FadeOutDown.duration(200)}
      style={[s.wrap, { bottom }]}
      pointerEvents="box-none"
    >
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => String(it.place.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        disableIntervalMomentum
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: interval, offset: interval * i, index: i })}
        contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
        onMomentumScrollEnd={(e) => onMomentumEnd(e.nativeEvent.contentOffset.x)}
        renderItem={({ item }) => (
          <PlaceCard
            item={item}
            width={cardW}
            distance={distanceKm(item.place)}
            onOpen={onOpen}
            onNavigate={onNavigate}
            onToggleSave={onToggleSave}
            onBurst={onBurst}
          />
        )}
      />
    </Reanimated.View>
  );
}

const PlaceCard = memo(function PlaceCard({
  item, width, distance, onOpen, onNavigate, onToggleSave, onBurst,
}: {
  item: CarouselItem; width: number; distance: number | null;
  onOpen: (place: Place) => void; onNavigate: (place: Place) => void;
  onToggleSave: (placeId: number) => void; onBurst: BurstFn;
}) {
  const { colors, scheme } = useTheme();
  const { place, category, saved, listNumber } = item;
  const image = firstImageUrl(place.image_url);
  const open = openStatus(place);
  const color = PIN_COLORS[category?.id ?? "other"];
  const facts = [
    open === null ? null : open ? "Öppet nu" : "Stängt",
    distance != null ? travelLabel(distance) : place.nearest_town,
  ].filter(Boolean) as string[];

  return (
    <View style={[s.card, { width, backgroundColor: scheme === "dark" ? "#1A1A1D" : "#FFFFFF", borderColor: colors.border }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => onOpen(place)} style={s.top}>
        <View style={[s.image, { backgroundColor: colors.fill }]}>
          {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          {listNumber != null && (
            <View style={s.number}>
              <Text style={s.numberText}>{listNumber}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={s.catRow}>
            <View style={[s.catDot, { backgroundColor: color }]} />
            <Text style={[s.catText, { color: colors.muted }]} numberOfLines={1}>{category?.label ?? "Österlen"}</Text>
          </View>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={2}>{place.name}</Text>
          <Text style={[s.facts, { color: colors.muted }]} numberOfLines={1}>
            {facts.map((f, i) => (
              <Text key={f} style={f === "Öppet nu" ? s.open : f === "Stängt" ? s.closed : undefined}>
                {i > 0 ? "  ·  " : ""}{f}
              </Text>
            ))}
          </Text>
        </View>
        <HeartButton isFav={saved} onToggle={() => onToggleSave(place.id)} onBurst={onBurst} size={24} />
      </TouchableOpacity>

      <View style={s.actions}>
        <TouchableOpacity style={s.primary} activeOpacity={0.85} onPress={() => onOpen(place)}>
          <Text style={s.primaryText}>Visa plats</Text>
          <ArrowRight size={16} color="#121212" strokeWidth={2.4} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.secondary, { borderColor: colors.borderStrong }]}
          activeOpacity={0.8}
          onPress={() => onNavigate(place)}
        >
          <Navigation size={15} color={colors.text} strokeWidth={2.2} />
          <Text style={[s.secondaryText, { color: colors.text }]}>Vägbeskrivning</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0 },
  card: {
    borderRadius: 24, padding: 14, gap: 14, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 10,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 14 },
  image: { width: 92, height: 92, borderRadius: 16, overflow: "hidden" },
  number: {
    position: "absolute", top: 6, left: 6, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6,
    alignItems: "center", justifyContent: "center", backgroundColor: "#E8C674",
  },
  numberText: { fontFamily: "Montserrat_700Bold", fontSize: 12, color: "#121212" },
  catRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catText: { flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.3 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2 },
  facts: { fontFamily: "Inter_500Medium", fontSize: 13 },
  open: { color: "#4ADE80" },
  closed: { color: "#F87171" },
  actions: { flexDirection: "row", gap: 10 },
  primary: {
    flex: 1, height: 46, borderRadius: 23, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#C5A059",
  },
  primaryText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: "#121212" },
  secondary: {
    flex: 1, height: 46, borderRadius: 23, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    borderWidth: 1,
  },
  secondaryText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5 },
});
