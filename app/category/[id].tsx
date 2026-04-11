import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Switch,
  Modal,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, Utensils, BedDouble, MapPin, ChevronDown } from "lucide-react-native";
import { usePlaces, isPlaceOpen, getTierScore, type Place } from "@/hooks/usePlaces";
import { colors } from "@/lib/colors";

const { width: W } = Dimensions.get("window");

// ─── Config ──────────────────────────────────────────────────────────────────

interface CategoryConfig {
  title: string;
  icon: "utensils" | "bed";
  baseFilter: (p: Place) => boolean;
  categories: { id: string; label: string; filter: (p: Place) => boolean }[];
}

const CONFIGS: Record<string, CategoryConfig> = {
  lunch: {
    title: "Äta idag",
    icon: "utensils",
    baseFilter: (p) => {
      const cats = (p.categories || "").toLowerCase();
      return cats.includes("mat") || cats.includes("dryck") || cats.includes("café") || cats.includes("cafe") || cats.includes("restaurang");
    },
    categories: [
      { id: "all", label: "Alla", filter: () => true },
      { id: "fine", label: "Fine Dining", filter: (p) => (p.sub_category || "").toLowerCase().includes("fine dining") },
      { id: "pizza", label: "Pizza", filter: (p) => (p.sub_category || p.name || "").toLowerCase().includes("pizza") },
      { id: "casual", label: "Casual", filter: (p) => !(p.sub_category || "").toLowerCase().includes("fine dining") },
      { id: "pub", label: "Pub & Bar", filter: (p) => {
        const s = (p.categories + " " + (p.sub_category || "")).toLowerCase();
        return s.includes("pub") || s.includes("bar");
      }},
    ],
  },
  boende: {
    title: "Sova inatt",
    icon: "bed",
    baseFilter: (p) => {
      const cats = (p.categories || "").toLowerCase();
      return cats.includes("hotell") || cats.includes("b&b") || cats.includes("boende") || cats.includes("spa");
    },
    categories: [
      { id: "all", label: "Alla", filter: () => true },
      { id: "hotell", label: "Hotell", filter: (p) => (p.sub_category || "").toLowerCase().includes("hotell") },
      { id: "bb", label: "B&B", filter: (p) => {
        const s = (p.sub_category || "").toLowerCase();
        return s.includes("b&b") || s.includes("bed");
      }},
      { id: "spa", label: "Spa & Avkoppling", filter: (p) => {
        const s = (p.categories + " " + (p.sub_category || "")).toLowerCase();
        return s.includes("spa") || s.includes("avkoppling");
      }},
    ],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── PlaceCard ────────────────────────────────────────────────────────────────

function PlaceCard({ place, distance }: { place: Place; distance: number | null }) {
  const router = useRouter();
  const imageUrl = place.image_url?.split(",")[0].trim() ?? "";

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.88}
      onPress={() => router.push(`/place/${place.id}` as any)}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
      )}
      <View style={s.cardGradient} />

      <View style={s.cardContent}>
        <Text style={s.cardName} numberOfLines={1}>{place.name}</Text>
        {distance !== null && (
          <View style={s.distanceRow}>
            <MapPin size={13} color={colors.gold} />
            <Text style={s.distanceText}>{Math.round(distance)} km</Text>
          </View>
        )}
        {place.short_description ? (
          <Text style={s.cardDesc} numberOfLines={2}>{place.short_description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const config = CONFIGS[id ?? ""] ?? null;

  const { data: places = [], isLoading } = usePlaces();

  const [activeCategory, setActiveCategory] = useState("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sortByDistance, setSortByDistance] = useState(false);
  const seedRef = useRef(Date.now());

  const selectedCat = config?.categories.find((c) => c.id === activeCategory);
  const selectedLabel = selectedCat?.label ?? "Alla";

  const Icon = config?.icon === "bed" ? BedDouble : Utensils;

  const handleSelect = useCallback((catId: string) => {
    setActiveCategory(catId);
    setDropdownOpen(false);
  }, []);

  const filteredPlaces = useMemo(() => {
    if (!config) return [];
    const base = places.filter(config.baseFilter);
    const catFilter = config.categories.find((c) => c.id === activeCategory)?.filter;
    const filtered = catFilter ? base.filter(catFilter) : base;

    const withDist = filtered.map((place) => {
      // No geolocation in this port; distance = null
      return { place, distance: null as number | null };
    });

    if (sortByDistance) return withDist; // all null, order unchanged

    // Tier-grouped seeded shuffle
    const tierGroups: Record<number, typeof withDist> = {};
    for (const item of withDist) {
      const score = getTierScore(item.place.business_tier);
      if (!tierGroups[score]) tierGroups[score] = [];
      tierGroups[score].push(item);
    }
    const sortedTiers = Object.keys(tierGroups).map(Number).sort((a, b) => b - a);
    const result: typeof withDist = [];
    for (const tier of sortedTiers) {
      result.push(...seededShuffle(tierGroups[tier], seedRef.current + tier));
    }
    return result;
  }, [places, config, activeCategory, sortByDistance]);

  if (!config) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Icon size={22} color={colors.gold} />
        <Text style={s.headerTitle} numberOfLines={1}>{config.title}</Text>

        {/* Filter button */}
        <TouchableOpacity
          style={s.filterBtn}
          onPress={() => setDropdownOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={s.filterBtnText}>{selectedLabel}</Text>
          <ChevronDown size={16} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Place list */}
      {isLoading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : filteredPlaces.length === 0 ? (
        <View style={s.empty}>
          <Icon size={40} color={colors.foregroundSubtle} />
          <Text style={s.emptyText}>Inga platser hittades</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredPlaces.map(({ place, distance }) => (
            <PlaceCard key={place.id} place={place} distance={distance} />
          ))}
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      )}

      {/* Dropdown modal */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <Pressable style={s.dropdownBackdrop} onPress={() => setDropdownOpen(false)}>
          <View style={s.dropdown}>
            {config.categories.map((cat, i) => {
              const isActive = cat.id === activeCategory;
              return (
                <View key={cat.id}>
                  <TouchableOpacity
                    style={[s.dropdownItem, isActive && s.dropdownItemActive]}
                    onPress={() => handleSelect(cat.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.dropdownItemText, isActive && s.dropdownItemTextActive]}>
                      {cat.label}
                    </Text>
                    {isActive && <View style={s.activeDot} />}
                  </TouchableOpacity>
                  {i < config.categories.length - 1 && <View style={s.divider} />}
                </View>
              );
            })}

            <View style={s.divider} />

            {/* Sort by distance toggle */}
            <View style={s.dropdownToggleRow}>
              <MapPin size={14} color={colors.gold} />
              <Text style={s.dropdownToggleText}>Sortera efter avstånd</Text>
              <Switch
                value={sortByDistance}
                onValueChange={setSortByDistance}
                trackColor={{ false: colors.border, true: colors.foregroundSubtle }}
                thumbColor={sortByDistance ? colors.foreground : colors.foregroundSubtle}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_HEIGHT = 192;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  headerTitle: {
    flex: 1, fontSize: 20, fontWeight: "800", color: colors.foreground,
  },
  filterBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterBtnText: { fontSize: 14, fontWeight: "600", color: colors.foreground },

  listContent: { padding: 16, gap: 12 },

  card: {
    height: CARD_HEIGHT, borderRadius: 20, overflow: "hidden",
    backgroundColor: colors.card,
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
    // bottom-heavy gradient via an inner overlay
  },
  cardContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  cardName: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 4 },
  distanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  distanceText: { fontSize: 13, color: colors.gold, fontWeight: "600" },
  cardDesc: { fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 16 },

  empty: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 12,
  },
  emptyText: { fontSize: 15, color: colors.foregroundMuted },

  // Dropdown
  dropdownBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "flex-end", justifyContent: "flex-start",
    paddingTop: 80, paddingRight: 16,
  },
  dropdown: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16, overflow: "hidden",
    minWidth: 220,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  dropdownItem: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  dropdownItemActive: {
    backgroundColor: `rgba(201,168,76,0.12)`,
  },
  dropdownItemText: { flex: 1, fontSize: 14, color: "rgba(255,255,255,0.7)" },
  dropdownItemTextActive: { color: colors.gold, fontWeight: "600" },
  activeDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.gold,
  },
  divider: { height: 0.5, backgroundColor: "rgba(255,255,255,0.06)" },
  dropdownToggleRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  dropdownToggleText: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.6)" },
});
