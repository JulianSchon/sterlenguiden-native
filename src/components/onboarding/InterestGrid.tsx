/**
 * "Vad gillar du?": appens kategorier som bildrutor att välja bland — i onboardingen och under
 * Inställningar › Intressen. Varje kategori visas med ett riktigt foto från en av dess platser i
 * appen, och namnet står under bilden (aldrig på den).
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { CATEGORIES, findCategory, withAlpha, type CategoryId } from "@/theme/categories";
import { firstImageUrl, getTierScore, type Place } from "@/hooks/usePlaces";
import { Skeleton } from "@/components/Skeleton";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const GAP = 12;

/**
 * Ett foto per kategori: från den plats som bäst visar upp kategorin (företagen med högst nivå
 * först, sedan de med en beskrivning). Samma plats varje gång, så rutorna inte byter bild.
 */
export function categoryPhotos(places: Place[]): Partial<Record<CategoryId, string>> {
  const best = new Map<CategoryId, { score: number; url: string }>();
  for (const place of places) {
    const id = findCategory(place.category)?.id;
    const url = firstImageUrl(place.image_url);
    if (!id || !url) continue;
    const score = getTierScore(place.business_tier) + (place.description ? 10 : 0) - place.id / 1e7;
    const current = best.get(id);
    if (!current || score > current.score) best.set(id, { score, url });
  }
  return Object.fromEntries([...best].map(([id, { url }]) => [id, url]));
}

export function InterestGrid({
  selected, onToggle, photos, loading, gutter,
}: {
  selected: CategoryId[];
  onToggle: (id: CategoryId) => void;
  photos: Partial<Record<CategoryId, string>>;
  /** Platserna (och därmed fotona) är inte hämtade än */
  loading: boolean;
  /** Sidans luft mot kanterna, för att räkna ut rutornas bredd */
  gutter: number;
}) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - gutter * 2 - GAP) / 2);
  const chosen = useMemo(() => new Set(selected), [selected]);
  return (
    <View style={styles.grid}>
      {CATEGORIES.map((cat) => (
        <Tile
          key={cat.id}
          id={cat.id}
          width={tile}
          photo={photos[cat.id]}
          loading={loading}
          selected={chosen.has(cat.id)}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
}

function Tile({
  id, width, photo, loading, selected, onToggle,
}: {
  id: CategoryId; width: number; photo: string | undefined; loading: boolean; selected: boolean;
  onToggle: (id: CategoryId) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const cat = CATEGORIES.find((c) => c.id === id)!;
  const Icon = cat.icon;
  const height = Math.round(width * 0.78);
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onToggle(id);
      }}
      style={({ pressed }) => [{ width }, pressed && { opacity: 0.85 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={cat.label}
    >
      <View style={[s.photo, { height }, selected && { borderColor: colors.gold }]}>
        {photo ? (
          <ExpoImage source={{ uri: photo }} style={s.image} contentFit="cover" transition={220} cachePolicy="memory-disk" />
        ) : loading ? (
          <Skeleton width="100%" height="100%" radius={0} />
        ) : (
          // Ingen plats med foto i kategorin: kategorins egen färg och ikon
          <View style={[s.image, s.fallback, { backgroundColor: withAlpha(cat.screen, 0.9) }]}>
            <Icon size={30} color="#FFFFFF" strokeWidth={1.6} />
          </View>
        )}
      </View>
      <View style={s.row}>
        <View style={[s.dot, { backgroundColor: cat.screen }]} />
        <Text style={s.label} numberOfLines={1}>{cat.label}</Text>
        <View style={[s.check, selected && { backgroundColor: colors.gold, borderColor: colors.gold }]}>
          {selected ? <Check size={13} color={colors.onGold} strokeWidth={3} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: GAP, rowGap: 18 },
});

const createStyles = (c: ThemeColors) => StyleSheet.create({
  photo: { borderRadius: 18, overflow: "hidden", borderWidth: 2.5, borderColor: "transparent", backgroundColor: c.fill },
  image: { width: "100%", height: "100%" },
  fallback: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.text },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
});
