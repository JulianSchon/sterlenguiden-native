import { useState } from "react";
import {
  View, Text, TextInput, FlatList, Image,
  TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Search, X, MapPin } from "lucide-react-native";
import { useSearchPlaces, isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { colors } from "@/lib/colors";

const CATEGORIES = ["Alla", "Restaurang", "Butiker", "Naturupplevelser", "Boende", "Aktiviteter", "Hantverk"];

export default function ExploreScreen() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Alla");
  const router = useRouter();
  const { data: places = [], isLoading } = useSearchPlaces(query);

  const filtered = activeCategory === "Alla"
    ? places
    : places.filter((p) => p.category?.toLowerCase().includes(activeCategory.toLowerCase()));

  const renderPlace = ({ item }: { item: Place }) => {
    const open = isPlaceOpen(item.opening_hours as Record<string, string> | null);
    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/place/${item.id}` as any)}
      >
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={s.cardImage} />
        ) : (
          <View style={[s.cardImage, s.imagePlaceholder]} />
        )}
        <View style={s.cardBody}>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
          {item.nearest_town && (
            <View style={s.locationRow}>
              <MapPin size={12} color={colors.foregroundMuted} />
              <Text style={s.locationText}>{item.nearest_town}</Text>
            </View>
          )}
          {item.short_description && (
            <Text style={s.cardDesc} numberOfLines={2}>{item.short_description}</Text>
          )}
          <View style={s.cardFooter}>
            <Text style={s.cardCategory}>{item.category ?? ""}</Text>
            {item.opening_hours && (
              <View style={[s.openBadge, open ? s.openBadgeOpen : s.openBadgeClosed]}>
                <Text style={[s.openBadgeText, open ? s.openTextOpen : s.openTextClosed]}>
                  {open ? "Öppet" : "Stängt"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.searchBar}>
        <Search size={18} color={colors.foregroundMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Sök platser..."
          placeholderTextColor={colors.foregroundSubtle}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <X size={18} color={colors.foregroundMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.chipsWrapper}>
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.chip, activeCategory === item && s.chipActive]}
              onPress={() => setActiveCategory(item)}
            >
              <Text style={[s.chipText, activeCategory === item && s.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.gold} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPlace}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyText}>Inga platser hittades</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.foreground },
  chipsWrapper: { flexShrink: 0 },
  chips: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontSize: 13, color: colors.foregroundMuted, fontWeight: "500" },
  chipTextActive: { color: colors.background },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImage: { width: "100%", height: 160 },
  imagePlaceholder: { backgroundColor: colors.surface },
  cardBody: { padding: 12 },
  cardName: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  locationText: { fontSize: 12, color: colors.foregroundMuted },
  cardDesc: { fontSize: 13, color: colors.foregroundMuted, lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardCategory: { fontSize: 12, color: colors.foregroundSubtle, flex: 1 },
  openBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  openBadgeOpen: { backgroundColor: colors.successBg },
  openBadgeClosed: { backgroundColor: colors.errorBg },
  openBadgeText: { fontSize: 11, fontWeight: "600" },
  openTextOpen: { color: colors.successText },
  openTextClosed: { color: colors.errorText },
  center: { alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyText: { color: colors.foregroundSubtle, fontSize: 15 },
});
