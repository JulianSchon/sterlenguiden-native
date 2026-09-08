/**
 * /category/:categoryId – kategori-detaljsida
 * Spec: native-category-spec.md
 *
 * En enda skärm med CATEGORY_CONFIG-map för alla 8 kategorier.
 * Sticky header animeras med Reanimated. Gradienter via SVG (expo-linear-gradient
 * kräver native rebuild – byts ut sedan).
 */
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  Image, StyleSheet, Dimensions, Pressable,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Crown, MapPin } from "lucide-react-native";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Rect as SvgRect,
} from "react-native-svg";
import * as Location from "expo-location";
import {
  usePlaces, isPlaceOpen, getTierScore, type Place,
} from "@/hooks/usePlaces";
import { useBusinessStories } from "@/hooks/useBusinessStories";

const { width: SW } = Dimensions.get("window");

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BG    = "#121212";
const FG    = "#F5F2EA";
const GOLD  = "#C5A059";
const MUTED = "rgba(255,255,255,0.45)";

const HEADER_H  = 200;
const CARD_SIZE = 168;

// ─── Haversine ─────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function drivingKm(raw: number) { return Math.round(raw * 1.3 + 1); }

// ─── Hjälpare: kategori-match ───────────────────────────────────────────────────
function matchesCat(categories: string | null, dbValues: string[]): boolean {
  if (!categories) return false;
  const parts = categories.split(",").map((s) => s.trim().toLowerCase());
  return dbValues.some((v) =>
    parts.some(
      (p) =>
        p === v.toLowerCase() ||
        p.includes(v.toLowerCase()) ||
        v.toLowerCase().includes(p),
    ),
  );
}

function matchesSub(subCat: string | null, key: string): boolean {
  if (!subCat) return false;
  const parts = subCat.split(",").map((s) => {
    const t = s.trim().toLowerCase();
    return t === "kyrka" ? "kyrkor" : t; // normalise
  });
  const k = key.toLowerCase();
  return parts.some((p) => p === k || p.includes(k) || k.includes(p));
}

// ─── Kategori-konfiguration ─────────────────────────────────────────────────────
interface SubCat { key: string; title: string; subtitle: string }
interface CatConfig {
  title: string;
  dbValues: string[];
  solidColor: string;
  g1: string; // gradient stop 1
  g2: string; // gradient stop 2
  showPrice: boolean;
  spaRule?: boolean;
  subs: SubCat[];
}

const CFG: Record<string, CatConfig> = {
  "mat-dryck": {
    title: "Mat & Dryck", dbValues: ["Mat", "Mat & Dryck"],
    solidColor: "#7C2D12", g1: "rgba(124,58,17,0.8)", g2: "rgba(67,20,7,0.4)",
    showPrice: true, subs: [
      { key: "Fine Dining", title: "Utsökt matupplevelse",  subtitle: "Österlen finest dining" },
      { key: "Casual",      title: "Avslappnat & gott",     subtitle: "Vardagens favoriter" },
      { key: "Pizza",       title: "Pizza med känsla",       subtitle: "Från vedeldad ugn till favoriter" },
      { key: "Streetfood",  title: "Smaker från världen",    subtitle: "En smakrik upplevelse från hela världen" },
      { key: "Pub & Bar",   title: "Kvällen ut",             subtitle: "Dryck, mat och bra stämning" },
    ],
  },
  "hotell-bb": {
    title: "Hotell & B&B", dbValues: ["Hotell & B&B", "Boende"],
    solidColor: "#312E81", g1: "rgba(49,46,129,0.8)", g2: "rgba(30,27,75,0.4)",
    showPrice: true, subs: [
      { key: "Hotell", title: "Hotell",           subtitle: "Klassiska hotellupplevelser" },
      { key: "B&B",    title: "Bed & Breakfast",  subtitle: "Hemtrevligt och personligt" },
      { key: "Spa",    title: "Spa & Avkoppling", subtitle: "Spa, massage och välbefinnande" },
    ],
  },
  "cafe-bageri": {
    title: "Café & Bageri", dbValues: ["Café & Bageri", "Cafe & Bageri"],
    solidColor: "#C4B280", g1: "rgba(245,222,179,0.7)", g2: "rgba(245,222,179,0.3)",
    showPrice: false, subs: [
      { key: "Café",     title: "Mysiga caféer",       subtitle: "Slå dig ner och njut" },
      { key: "Bageri",   title: "Bagerier",            subtitle: "Nybakat bröd och bullar" },
      { key: "Glass",    title: "Glassställen",        subtitle: "Söta stunder i solen" },
      { key: "Trädgård", title: "Trädgårdscaféer",     subtitle: "Fika under öppen himmel" },
      { key: "Snabbt",   title: "Take-away fika",      subtitle: "Kaffe på språng" },
    ],
  },
  "butiker": {
    title: "Butiker", dbValues: ["Butiker", "Gårdsbutik"],
    solidColor: "#881337", g1: "rgba(136,19,55,0.8)", g2: "rgba(76,5,25,0.4)",
    showPrice: false, subs: [
      { key: "Livsmedel & Dagligvaror", title: "Livsmedel & Dagligvaror", subtitle: "Mat och dryck att ta med hem" },
      { key: "Kläder & Mode",           title: "Kläder & Mode",           subtitle: "Shopping med stil" },
      { key: "Hem & Inredning",         title: "Hem & Inredning",         subtitle: "Vackra ting till hemmet" },
      { key: "Sport & Fritid",          title: "Sport & Fritid",          subtitle: "Utrustning för aktiva dagar" },
    ],
  },
  "natur-upplevelser": {
    title: "Natur & Upplevelser", dbValues: ["Natur", "Natur & Upplevelser"],
    solidColor: "#064E3B", g1: "rgba(6,78,59,0.8)", g2: "rgba(2,44,34,0.4)",
    showPrice: false, subs: [
      { key: "Stränder", title: "Stränder",        subtitle: "Havets lugn och bruset av vågor" },
      { key: "Vandring", title: "Vandring",         subtitle: "Utforska naturen till fots" },
      { key: "Utsikt",   title: "Vackra utsikter",  subtitle: "Platser som tar andan ur dig" },
      { key: "Djur",     title: "Djurupplevelser",  subtitle: "Nära naturen och djuren" },
      { key: "Spa",      title: "Spa & Avkoppling", subtitle: "Spa, massage och välbefinnande" },
    ],
  },
  "aktiviteter": {
    title: "Aktiviteter", dbValues: ["Aktiviteter"],
    solidColor: "#0C4A6E", g1: "rgba(12,74,110,0.8)", g2: "rgba(8,47,73,0.4)",
    showPrice: false, spaRule: true, subs: [
      { key: "Sport",  title: "Sport & Rörelse",  subtitle: "Golf, padel och äventyr" },
      { key: "Barn",   title: "Barnvänligt",       subtitle: "Kul för hela familjen" },
      { key: "Hälsa",  title: "Hälsa & Välmående", subtitle: "Spa, yoga och avkoppling" },
      { key: "Spa",    title: "Spa & Avkoppling",  subtitle: "Spa, massage och välbefinnande" },
    ],
  },
  "sevardheter": {
    title: "Sevärdheter", dbValues: ["Sevärdheter", "Konst"],
    solidColor: "#581C87", g1: "rgba(88,28,135,0.8)", g2: "rgba(59,7,100,0.4)",
    showPrice: false, subs: [
      { key: "Historia", title: "Historiska platser", subtitle: "Slott, borgar och fornlämningar" },
      { key: "Museum",   title: "Museer",              subtitle: "Upptäck lokala skatter" },
      { key: "Konst",    title: "Konst & Gallerier",   subtitle: "Kreativa upplevelser" },
      { key: "Kyrkor",   title: "Kyrkor",              subtitle: "Arkitektur och stillhet" },
    ],
  },
  "hantverk-service": {
    title: "Design & Hantverk", dbValues: ["Hantverk & Service", "Hantverk"],
    solidColor: "#134E4A", g1: "rgba(19,78,74,0.8)", g2: "rgba(4,47,46,0.4)",
    showPrice: false, subs: [
      { key: "Ateljéer",             title: "Ateljéer",             subtitle: "Konstnärernas kreativa rum" },
      { key: "Gallerier",            title: "Gallerier",            subtitle: "Konst att uppleva" },
      { key: "Verkstäder",           title: "Verkstäder",           subtitle: "Hantverk på riktigt" },
      { key: "Inredning & Livsstil", title: "Inredning & Livsstil", subtitle: "Design för hemmet" },
    ],
  },
};

// ─── PlaceCard ─────────────────────────────────────────────────────────────────
interface PlaceCardProps {
  place: Place & { _dist: number | null };
  showPrice: boolean;
  isPremium: boolean;
}

function PlaceCard({ place, showPrice, isPremium }: PlaceCardProps) {
  const router  = useRouter();
  const imgUri  = place.image_url?.split(",")[0].trim();
  const distKm  = place._dist !== null ? drivingKm(place._dist) : null;

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && { transform: [{ scale: 0.97 }] }]}
      onPress={() => router.push(`/place/${place.id}` as any)}
    >
      {/* Bild */}
      {imgUri ? (
        <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1E1E1E" }]} />
      )}

      {/* Gradient nerifrån */}
      <View style={s.cardGradWrap} pointerEvents="none">
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
        >
          <Defs>
            <SvgGrad id={`cg${place.id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor="#000" stopOpacity={0}    />
              <Stop offset="40%"  stopColor="#000" stopOpacity={0.35} />
              <Stop offset="100%" stopColor="#000" stopOpacity={0.85} />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill={`url(#cg${place.id})`} />
        </Svg>
      </View>

      {/* Prisbadge – uppe vänster */}
      {showPrice && place.price_level ? (
        <View style={s.priceBadge}>
          <Text style={s.priceBadgeText}>{"$".repeat(place.price_level)}</Text>
        </View>
      ) : null}

      {/* Kronbadge – uppe höger */}
      {isPremium && (
        <View style={s.crownBadge}>
          <Crown size={12} color="#1C1C1C" strokeWidth={2.2} />
        </View>
      )}

      {/* Text – nere */}
      <View style={s.cardText}>
        <Text style={s.cardName} numberOfLines={2}>{place.name}</Text>
        {distKm !== null && (
          <View style={s.distRow}>
            <MapPin size={12} color="rgba(255,255,255,0.75)" strokeWidth={2} />
            <Text style={s.distText}>{distKm} km</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── SubCategoryRow ────────────────────────────────────────────────────────────
interface RowProps {
  sub: SubCat;
  places: Array<Place & { _dist: number | null }>;
  showPrice: boolean;
  premiumIds: Set<number>;
}

function SubCategoryRow({ sub, places, showPrice, premiumIds }: RowProps) {
  const renderCard = useCallback(
    ({ item }: { item: Place & { _dist: number | null } }) => (
      <PlaceCard
        key={item.id}
        place={item}
        showPrice={showPrice}
        isPremium={premiumIds.has(item.id)}
      />
    ),
    [showPrice, premiumIds],
  );

  return (
    <View style={s.row}>
      <View style={s.rowHeader}>
        <Text style={s.rowTitle}>{sub.title}</Text>
        <Text style={s.rowSubtitle}>{sub.subtitle}</Text>
      </View>
      <FlatList
        horizontal
        data={places}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderCard}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.rowList}
        nestedScrollEnabled
        removeClippedSubviews
        initialNumToRender={6}
      />
    </View>
  );
}

// ─── CategoryScreen ────────────────────────────────────────────────────────────
export default function CategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  const cfg = CFG[categoryId ?? ""] ?? null;
  const { data: allPlaces = [] } = usePlaces();
  const { data: stories  = [] } = useBusinessStories();

  // GPS
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== "granted") return;
      Location.getCurrentPositionAsync({}).then(({ coords }) =>
        setUserLoc({ lat: coords.latitude, lng: coords.longitude }),
      );
    });
  }, []);

  // Premium-IDs
  const premiumIds = useMemo(() => {
    const now = new Date().toISOString();
    return new Set(
      stories
        .filter((s) => s.is_premium && (!s.expires_at || s.expires_at >= now))
        .map((s) => s.place_id),
    );
  }, [stories]);

  // Filtrerade + sorterade platser
  const catPlaces = useMemo(() => {
    if (!cfg) return [];
    let list = allPlaces.filter((p) => matchesCat(p.category, cfg.dbValues));

    // Spa-specialregel för Aktiviteter
    if (cfg.spaRule) {
      const ids = new Set(list.map((p) => p.id));
      allPlaces.forEach((p) => {
        if (!ids.has(p.id) && matchesSub(p.sub_category, "Spa")) {
          list.push(p);
          ids.add(p.id);
        }
      });
    }

    return list
      .map((p) => ({
        ...p,
        _dist:
          userLoc && p.lat && p.lng
            ? haversineKm(userLoc.lat, userLoc.lng, p.lat, p.lng)
            : null,
      }))
      .sort((a, b) => getTierScore(b.business_tier) - getTierScore(a.business_tier));
  }, [cfg, allPlaces, userLoc]);

  // Öppet just nu
  const openNow = useMemo(
    () => catPlaces.filter((p) => isPlaceOpen(p.opening_hours as any)),
    [catPlaces],
  );

  // Underkateg-rader (ordning = spec-ordning, tomma rader döljs)
  const subRows = useMemo(() => {
    if (!cfg) return [];
    return cfg.subs
      .map((sub) => ({
        sub,
        places: catPlaces.filter((p) => matchesSub(p.sub_category, sub.key)),
      }))
      .filter((r) => r.places.length > 0);
  }, [cfg, catPlaces]);

  // Scroll handler (Reanimated)
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  const THRESHOLD = HEADER_H - 60;

  const stickyAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [THRESHOLD, THRESHOLD + 40], [0, 1], Extrapolation.CLAMP),
    transform: [{
      translateY: interpolate(scrollY.value, [THRESHOLD, THRESHOLD + 40], [-8, 0], Extrapolation.CLAMP),
    }],
    pointerEvents: scrollY.value > THRESHOLD ? "auto" : "none",
  }));

  if (!cfg) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: MUTED }}>Kategori hittades inte</Text>
      </View>
    );
  }

  const headerTop = Math.max(insets.top, 44);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Sticky kompakt header ── */}
      <Animated.View
        style={[s.stickyHeader, { height: headerTop + 52, paddingTop: headerTop }, stickyAnimStyle]}
        pointerEvents="box-none"
      >
        <View style={s.stickyRow}>
          <TouchableOpacity style={s.backBtnSmall} onPress={() => router.back()}>
            <ArrowLeft size={16} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.stickyTitle} numberOfLines={1}>{cfg.title}</Text>
        </View>
      </Animated.View>

      {/* ── Scrollbart innehåll ── */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        {/* Stor header */}
        <View style={s.bigHeader}>
          {/* Färggradient uppifrån */}
          <Svg
            width="100%"
            height="100%"
            style={StyleSheet.absoluteFill}
            preserveAspectRatio="none"
          >
            <Defs>
              <SvgGrad id="headerGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor={cfg.g1} stopOpacity={1} />
                <Stop offset="55%"  stopColor={cfg.g2} stopOpacity={1} />
                <Stop offset="100%" stopColor="#000"   stopOpacity={0} />
              </SvgGrad>
            </Defs>
            <SvgRect width="100%" height="100%" fill="url(#headerGrad)" />
          </Svg>

          {/* Tillbaka-knapp */}
          <View style={[s.headerContent, { paddingTop: headerTop + 8 }]}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <ArrowLeft size={20} color={FG} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={s.bigTitle}>{cfg.title}</Text>
          </View>
        </View>

        {/* "Öppet just nu" – visas om minst en plats är öppen */}
        {openNow.length > 0 && (
          <SubCategoryRow
            sub={{ key: "__open__", title: "Öppet just nu", subtitle: "Platser med öppet denna stund" }}
            places={openNow}
            showPrice={cfg.showPrice}
            premiumIds={premiumIds}
          />
        )}

        {/* Underkategori-rader */}
        {subRows.length > 0 ? (
          subRows.map(({ sub, places }) => (
            <SubCategoryRow
              key={sub.key}
              sub={sub}
              places={places}
              showPrice={cfg.showPrice}
              premiumIds={premiumIds}
            />
          ))
        ) : (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>Inga platser hittades i denna kategori</Text>
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Sticky header
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    justifyContent: "flex-end",
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  stickyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  backBtnSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  stickyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: FG,
    flex: 1,
  },

  // Stor header
  bigHeader: {
    height: HEADER_H,
    overflow: "hidden",
  },
  headerContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  bigTitle: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: 36,
    color: FG,
    marginTop: 24,
  },

  // Underkategori-rad
  row: { marginBottom: 32 },
  rowHeader: { paddingHorizontal: 20, marginBottom: 12 },
  rowTitle: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: 18,
    color: FG,
  },
  rowSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#A09880",
    marginTop: 2,
  },
  rowList: { paddingHorizontal: 20, gap: 12 },

  // Platskort
  card: {
    width: CARD_SIZE,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1E1E1E",
  },
  cardGradWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: Math.round(CARD_SIZE * (2 / 3)),
  },
  cardText: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
  },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  distText: { fontSize: 11, color: "rgba(255,255,255,0.75)" },
  priceBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  priceBadgeText: { fontSize: 11, fontWeight: "600", color: "#fff" },
  crownBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(197,160,89,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Tom-state
  emptyState: { alignItems: "center", paddingVertical: 48 },
  emptyText: { fontSize: 14, color: MUTED, textAlign: "center", paddingHorizontal: 24 },
});
