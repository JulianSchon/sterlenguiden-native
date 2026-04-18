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
import {
  Search, X, MapPin,
  UtensilsCrossed, BedDouble, Coffee, ShoppingBag, Trees,
  Zap, Landmark, Palette, Mountain,
  Store, Toilet, Plug, Heart, Wrench,
} from "lucide-react-native";
import { useSearchPlaces, isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { colors } from "@/lib/colors";

const CHARCOAL = "#121212";
const GOLD = "#C9A24C";
const MUTED = "#A8A192";

const CATEGORY_PILLS = [
  "Alla", "Mat & Dryck", "Hotell & B&B", "Café & Bageri",
  "Butiker", "Natur & Upplevelser", "Aktiviteter", "Sevärdheter", "Design & Hantverk",
];

const QUICK_ACCESS = [
  { label: "AutoMat",  Icon: Store  },
  { label: "Toalett",  Icon: Toilet },
  { label: "Laddning", Icon: Plug   },
  { label: "Vård",     Icon: Heart  },
  { label: "Tjänster", Icon: Wrench },
];

const GRID_CATEGORIES = [
  { label: "Mat & Dryck",           Icon: UtensilsCrossed, fullWidth: false },
  { label: "Hotell & B&B",          Icon: BedDouble,       fullWidth: false },
  { label: "Café & Bageri",         Icon: Coffee,          fullWidth: false },
  { label: "Butiker",               Icon: ShoppingBag,     fullWidth: false },
  { label: "Natur & Upplevelser",   Icon: Trees,           fullWidth: false },
  { label: "Aktiviteter",           Icon: Zap,             fullWidth: false },
  { label: "Sevärdheter",           Icon: Landmark,        fullWidth: false },
  { label: "Design & Hantverk",     Icon: Palette,         fullWidth: false },
  { label: "Vandring & Cykelleder", Icon: Mountain,        fullWidth: true  },
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

  const PillsRow = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.pillsContent}
      style={s.pillsScroll}
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
  );

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
              <MapPin size={12} color={MUTED} />
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
    <View style={s.container}>

      {/* ── Sticky header: title + search only ── */}
      <View style={[s.stickyHeader, { paddingTop: insets.top + 44 }]}>
        <Text style={s.pageTitle}>Sök</Text>

        <View style={s.searchBarWrapper}>
          <View style={s.searchBar}>
            <View style={s.searchIconSlot}>
              <Search size={20} color={MUTED} strokeWidth={2} />
            </View>
            <TextInput
              style={s.searchInput}
              placeholder="Sök platser, restauranger..."
              placeholderTextColor={MUTED}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity
                style={s.clearBtn}
                onPress={() => { setQuery(""); setActiveCategory("Alla"); }}
              >
                <X size={18} color={MUTED} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* ── Scrollable body ── */}
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
            ListHeaderComponent={<PillsRow />}
            ListEmptyComponent={
              <View style={s.center}>
                <Text style={s.emptyText}>Inga platser hittades</Text>
              </View>
            }
          />
        )
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

          {/* Pills — in scrollable content */}
          <PillsRow />

          {/* Quick access circles */}
          <View style={s.quickRow}>
            {QUICK_ACCESS.map(({ label, Icon }) => (
              <TouchableOpacity
                key={label}
                style={s.quickItem}
                onPress={() => handleQuickAccess(label)}
                activeOpacity={0.75}
              >
                <View style={s.quickCircle}>
                  <Icon size={24} color={MUTED} strokeWidth={2} />
                </View>
                <Text style={s.quickLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* KATEGORIER heading */}
          <Text style={s.kategorierHeading}>KATEGORIER</Text>

          {/* 2-col grid */}
          <View style={s.grid}>
            {/* Paired rows */}
            {GRID_CATEGORIES
              .filter((c) => !c.fullWidth)
              .reduce<Array<Array<typeof GRID_CATEGORIES[0]>>>((rows, item, i) => {
                if (i % 2 === 0) rows.push([item]);
                else rows[rows.length - 1].push(item);
                return rows;
              }, [])
              .map((row, ri) => (
                <View key={ri} style={s.gridRow}>
                  {row.map(({ label, Icon }) => (
                    <TouchableOpacity
                      key={label}
                      style={s.gridCard}
                      activeOpacity={0.8}
                      onPress={() => handleCategoryCard(label)}
                    >
                      <Icon size={24} color={MUTED} strokeWidth={2} />
                      <Text style={s.gridCardText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

            {/* Full-width last card */}
            {GRID_CATEGORIES.filter((c) => c.fullWidth).map(({ label, Icon }) => (
              <TouchableOpacity
                key={label}
                style={[s.gridCard, s.gridCardFull]}
                activeOpacity={0.8}
                onPress={() => handleCategoryCard(label)}
              >
                <Icon size={24} color={MUTED} strokeWidth={2} />
                <Text style={s.gridCardText}>{label}</Text>
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

  // Sticky header
  stickyHeader: {
    backgroundColor: CHARCOAL,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: "700",
    fontFamily: "serif",
    color: "#F4EFE3",
    marginBottom: 12,
  },

  // Search bar
  searchBarWrapper: {
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: "#1F1F1F",
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(46,46,46,0.5)",
  },
  searchIconSlot: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#F4EFE3",
    paddingVertical: 8,
  },
  clearBtn: { paddingHorizontal: 16 },

  // Pills
  pillsScroll: { paddingTop: 12, marginBottom: 16 },
  pillsContent: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 9999,
    backgroundColor: "#262626",
  },
  pillActive: { backgroundColor: "#F4EFE3" },
  pillText: { fontSize: 14, fontWeight: "500", color: "#F4EFE3" },
  pillTextActive: { color: CHARCOAL },

  // Quick access
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  quickItem: { alignItems: "center", gap: 8, flex: 1 },
  quickCircle: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: "#1F1F1F",
    borderWidth: 1,
    borderColor: "rgba(46,46,46,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontSize: 12, color: MUTED, fontWeight: "500", textAlign: "center" },

  // KATEGORIER
  kategorierHeading: {
    fontSize: 14,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    marginTop: 24,
    marginBottom: 16,
  },

  // Grid
  grid: { paddingHorizontal: 12, gap: 12 },
  gridRow: { flexDirection: "row", gap: 12 },
  gridCard: {
    flex: 1,
    aspectRatio: 4 / 3,
    backgroundColor: "#1E1E1E",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(46,46,46,0.5)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  gridCardFull: {
    flex: 0,
    width: "100%",
    aspectRatio: 16 / 5,
  },
  gridCardText: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255,255,255,0.90)",
    textAlign: "center",
    paddingHorizontal: 8,
  },

  // Results list
  center: { alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyText: { color: MUTED, fontSize: 15 },
  list: { paddingHorizontal: 12, paddingBottom: 24, gap: 12 },
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
  locationText: { fontSize: 12, color: MUTED },
  cardDesc: { fontSize: 13, color: MUTED, lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardCategory: { fontSize: 12, color: "rgba(255,255,255,0.4)", flex: 1 },
  openBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  openBadgeOpen: { backgroundColor: colors.successBg },
  openBadgeClosed: { backgroundColor: colors.errorBg },
  openBadgeText: { fontSize: 11, fontWeight: "600" },
  openTextOpen: { color: colors.successText },
  openTextClosed: { color: colors.errorText },
});
