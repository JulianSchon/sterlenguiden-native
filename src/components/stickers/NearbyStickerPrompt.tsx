/**
 * Rutan på Hem: "Det finns en skatt X m bort". Visas när användaren är
 * inom 300 m från ett samlarobjekt hen inte har, och bara medan appen är öppen.
 * Tryck öppnar kartan med stickerns kort. Samma skattnål som på kartan.
 */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCollectibles, useCollected } from "@/hooks/useCollectibles";
import { distanceMeters, formatDistance } from "@/lib/checkin";
import { STICKER_NEARBY_M } from "@/lib/stickers";
import { TreasurePin } from "@/components/stickers/TreasurePin";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function NearbyStickerPrompt({ lat, lng }: { lat: number | null; lng: number | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
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
      // Hem är en flik: byt till kartfliken (inte en ny kopia av flikarna)
      onPress={() => router.navigate({ pathname: "/(tabs)/map", params: { sticker: nearest.c.id } })}
    >
      <TreasurePin height={40} found={false} />
      <View style={{ flex: 1 }}>
        <Text style={s.small}>Det finns en skatt {formatDistance(nearest.distance)} bort</Text>
        <Text style={s.name} numberOfLines={1}>{nearest.c.name}</Text>
        <Text style={s.sub}>Tryck för att se på kartan</Text>
      </View>
      <ChevronRight size={20} color={colors.purple} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 20,
    backgroundColor: c.card, borderWidth: 1, borderColor: "rgba(167,139,250,0.45)",
  },
  small: { fontFamily: "Inter_400Regular", fontSize: 12, color: c.muted },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: c.text, marginTop: 1 },
  sub: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.purple, marginTop: 2 },
});
