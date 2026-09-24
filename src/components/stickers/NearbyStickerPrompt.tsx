/**
 * Rutan på Hem: "Det finns ett samlarobjekt X m bort". Visas när användaren är
 * inom 300 m från ett samlarobjekt hen inte har, och bara medan appen är öppen.
 * Tryck öppnar kartan med stickerns kort.
 */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Star, ChevronRight } from "lucide-react-native";
import { useCollectibles, useCollected } from "@/hooks/useCollectibles";
import { distanceMeters, formatDistance } from "@/lib/checkin";
import { STICKER_NEARBY_M } from "@/lib/stickers";

const PURPLE = "#A78BFA";

export function NearbyStickerPrompt({ lat, lng }: { lat: number | null; lng: number | null }) {
  const router = useRouter();
  const { data: collectibles = [] } = useCollectibles();
  const { data: collected } = useCollected();

  if (lat == null || lng == null || !collected) return null;

  const nearest = collectibles
    .filter((c) => !collected.has(c.id))
    .map((c) => ({ c, distance: distanceMeters(lat, lng, c.lat, c.lng) }))
    .filter((x) => x.distance <= STICKER_NEARBY_M)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest) return null;

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: "/map", params: { sticker: nearest.c.id } } as any)}
    >
      <View style={s.iconCircle}>
        <Star size={22} color={PURPLE} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.small}>Det finns ett samlarobjekt {formatDistance(nearest.distance)} bort</Text>
        <Text style={s.name} numberOfLines={1}>{nearest.c.name}</Text>
        <Text style={s.sub}>Tryck för att se på kartan</Text>
      </View>
      <ChevronRight size={20} color="rgba(167,139,250,0.8)" strokeWidth={2} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 16, padding: 14, borderRadius: 20,
    backgroundColor: "#1A1A1D", borderWidth: 0.5, borderColor: "rgba(167,139,250,0.5)",
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(167,139,250,0.12)", borderWidth: 1, borderColor: "rgba(167,139,250,0.4)",
  },
  small: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.60)" },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: "#FFFFFF", marginTop: 1 },
  sub: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: PURPLE, marginTop: 2 },
});
