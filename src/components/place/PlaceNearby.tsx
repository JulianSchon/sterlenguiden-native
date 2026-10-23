/**
 * Platssidans två listor längst ner: kommande evenemang på platsen (öppnas i evenemangspanelen)
 * och platserna närmast den här, att hoppa vidare till. Korten är samma som på Sök.
 */
import { memo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { firstImageUrl, type Place } from "@/hooks/usePlaces";
import type { Event } from "@/hooks/useEvents";
import { useTheme } from "@/theme/ThemeProvider";
import { distanceLabel } from "@/lib/mapFilters";
import type { OpenInfo } from "@/lib/search";
import { CategoryLine, EventResultRow, useOpenColors } from "@/components/search/SearchParts";
import { GUTTER } from "./PlaceSections";
import i18n from "i18next";

const NO_TOKENS: string[] = [];

export function EventsHere({ events, onOpen }: { events: Event[]; onOpen: (event: Event) => void }) {
  return (
    <View>
      {events.map((e) => <EventResultRow key={e.id} event={e} tokens={NO_TOKENS} onPress={onOpen} />)}
    </View>
  );
}

export interface NearbyItem { place: Place; km: number; open: OpenInfo | null }

export function NearbyRail({ items, onPress }: { items: NearbyItem[]; onPress: (place: Place) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.rail}
      // Raden går ut till skärmens kanter (sektionen har sidomarginal)
      style={{ marginHorizontal: -GUTTER }}
    >
      {items.map((item) => <NearbyCard key={item.place.id} item={item} onPress={onPress} />)}
    </ScrollView>
  );
}

const NearbyCard = memo(function NearbyCard({ item, onPress }: { item: NearbyItem; onPress: (place: Place) => void }) {
  const { colors } = useTheme();
  const c = useOpenColors();
  const image = firstImageUrl(item.place.image_url);
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onPress(item.place)}>
      <View style={[s.image, { backgroundColor: colors.fill }]}>
        {image && <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />}
      </View>
      <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.place.name}</Text>
      <CategoryLine place={item.place} />
      <Text style={s.meta} numberOfLines={1}>
        {item.open && <Text style={{ color: item.open.open ? c.open : c.closed }}>{`${item.open.label}  ·  `}</Text>}
        <Text style={{ color: colors.faint }}>{i18n.t("place.away", { distance: distanceLabel(item.km) })}</Text>
      </Text>
    </TouchableOpacity>
  );
});

const s = StyleSheet.create({
  rail: { paddingHorizontal: GUTTER, gap: 12 },
  card: { width: 156, gap: 4 },
  image: { width: 156, height: 112, borderRadius: 14, overflow: "hidden", marginBottom: 5 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 14.5, letterSpacing: -0.2 },
  meta: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
