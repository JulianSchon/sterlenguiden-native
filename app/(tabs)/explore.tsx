import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Search, X, MapPin } from "lucide-react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSearchPlaces, isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { colors } from "@/lib/colors";

const CHARCOAL = "#121212";
const GOLD = "#C9A24C";

const CATEGORY_PILLS = [
  "Alla",
  "Mat & Dryck",
  "Hotell & B&B",
  "Café & Bageri",
  "Butiker",
  "Natur & Upplevelser",
  "Aktiviteter",
  "Sevärdheter",
  "Design & Hantverk",
];

const GRID_CATEGORIES = [
  { label: "Mat & Dryck",          icon: "cutlery",      fullWidth: false },
  { label: "Hotell & B&B",         icon: "bed",          fullWidth: false },
  { label: "Café & Bageri",        icon: "coffee",       fullWidth: false },
  { label: "Butiker",              icon: "shopping-bag", fullWidth: false },
  { label: "Natur & Upplevelser",  icon: "tree",         fullWidth: false },
  { label: "Aktiviteter",          icon: "star",         fullWidth: false },
  { label: "Sevärdheter",          icon: "camera",       fullWidth: false },
  { label: "Design & Hantverk",    icon: "paint-brush",  fullWidth: false },
  { label: "Vandring & Cykelleder",icon: "map-signs",    fullWidth: true  },
];

const QUICK_ACCESS = [
  { label: "AutoMat",  icon: "car"        },
  { label: "Toalett",  icon: "male"       },
  { label: "Laddning", icon: "bolt"       },
  { label: "Vård",     icon: "heartbeat"  },
  { label: "Tjänster", icon: "cog"        },
];

export default function ExploreScreen() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Alla");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: places = [], isLoading } = useSearchPlaces(query);

  const filtered = activeCategory === "Alla"
    ? places
    : places.filter((p) => (p.category ?? "").toLowerCase().includes(activeCategory.toLowerCase()));

  const showResults = query.trim().length > 0 || activeCategory !== "Alla";

  const handleCategoryCard = (label: string) => {
    setActiveCategory(label);
    setQuery(label);
  };

  const handleQuickAccess = (label: string) => {
    setQuery(label);
    setActiveCategory("Alla");
  };

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
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ─── Sticky header ─── */}
      <View style={s.stickyHeader}>
        <Text style={s.pageTitle}>Sök</Text>

        {/* Search bar */}
        <View style={s.searchBar}>
          <Search size={18} color="#A8A192" />
          <TextInput
            style={s.searchInput}
            placeholder="Sök platser, restauranger..."
            placeholderTextColor="#A8A192"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(""); setActiveCategory("Alla"); }}>
              <X size={18} color="#A8A192" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pillsRow}
        >
          {CATEGORY_PILLS.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[s.pill, activeCategory === cat && s.pillActive]}
              onPress={() => {
                setActiveCategory(cat);
                if (cat !== "Alla") setQuery(cat);
                else setQuery("");
              }}
            >
              <Text style={[s.pillText, activeCategory === cat && s.pillTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ─── Scrollable body ─── */}
      {showResults ? (
        isLoading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={GOLD} />
          </View>
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
        )
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.homeContent}>

          {/* Quick access circles */}
          <View style={s.quickRow}>
            {QUICK_ACCESS.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={s.quickItem}
                onPress={() => handleQuickAccess(item.label)}
                activeOpacity={0.75}
              >
                <View style={s.quickCircle}>
                  <FontAwesome name={item.icon as any} size={22} color="#A8A192" />
                </View>
                <Text style={s.quickLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* KATEGORIER heading */}
          <Text style={s.kategorierHeading}>KATEGORIER</Text>

          {/* Category grid */}
          <View style={s.grid}>
            {GRID_CATEGORIES.filter((c) => !c.fullWidth).reduce<Array<Array<typeof GRID_CATEGORIES[0]>>>((rows, item, i) => {
              if (i % 2 === 0) rows.push([item]);
              else rows[rows.length - 1].push(item);
              return rows;
            }, []).map((row, ri) => (
              <View key={ri} style={s.gridRow}>
                {row.map((cat) => (
                  <TouchableOpacity
                    key={cat.label}
                    style={s.gridCard}
                    activeOpacity={0.8}
                    onPress={() => handleCategoryCard(cat.label)}
                  >
                    <FontAwesome name={cat.icon as any} size={24} color="rgba(255,255,255,0.35)" style={s.gridIcon} />
                    <Text style={s.gridCardText}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}

            {/* Full-width last card */}
            {GRID_CATEGORIES.filter((c) => c.fullWidth).map((cat) => (
              <TouchableOpacity
                key={cat.label}
                style={[s.gridCard, s.gridCardFull]}
                activeOpacity={0.8}
                onPress={() => handleCategoryCard(cat.label)}
              >
                <FontAwesome name={cat.icon as any} size={24} color="rgba(255,255,255,0.35)" style={s.gridIcon} />
                <Text style={s.gridCardText}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHARCOAL },

  // ─ Sticky header ─
  stickyHeader: {
    backgroundColor: CHARCOAL,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F4EFE3",
    marginBottom: 12,
  },

  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: "rgba(38,38,38,0.8)",
    borderRadius: 9999,
    paddingHorizontal: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#F4EFE3",
  },

  // Category pills
  pillsRow: {
    paddingBottom: 8,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 9999,
    backgroundColor: "rgba(38,38,38,0.8)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  pillText: { fontSize: 13, fontWeight: "500", color: "#F4EFE3" },
  pillTextActive: { color: CHARCOAL },

  // ─ Home content ─
  homeContent: { paddingBottom: 32 },

  // Quick access
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  quickItem: { alignItems: "center", gap: 8, flex: 1 },
  quickCircle: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: "rgba(38,38,38,0.8)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontSize: 11, color: "#A8A192", fontWeight: "500", textAlign: "center" },

  // KATEGORIER heading
  kategorierHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#A8A192",
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  // Category grid
  grid: { paddingHorizontal: 16, gap: 12 },
  gridRow: { flexDirection: "row", gap: 12 },
  gridCard: {
    flex: 1,
    height: 120,
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  gridCardFull: {
    flex: 0,
    width: "100%",
  },
  gridIcon: { opacity: 0.7 },
  gridCardText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F4EFE3",
    textAlign: "center",
    paddingHorizontal: 8,
  },

  // ─ Search results ─
  center: { alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyText: { color: "#A8A192", fontSize: 15 },
  list: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  card: {
    backgroundColor: "#1E1E1E",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  cardImage: { width: "100%", height: 160 },
  imagePlaceholder: { backgroundColor: "#2A2A2A" },
  cardBody: { padding: 12 },
  cardName: { fontSize: 16, fontWeight: "700", color: "#F4EFE3", marginBottom: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  locationText: { fontSize: 12, color: "#A8A192" },
  cardDesc: { fontSize: 13, color: "#A8A192", lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardCategory: { fontSize: 12, color: "rgba(255,255,255,0.4)", flex: 1 },
  openBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  openBadgeOpen: { backgroundColor: colors.successBg },
  openBadgeClosed: { backgroundColor: colors.errorBg },
  openBadgeText: { fontSize: 11, fontWeight: "600" },
  openTextOpen: { color: colors.successText },
  openTextClosed: { color: colors.errorText },
});
