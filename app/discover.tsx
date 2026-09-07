import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { Heart, X, ArrowLeft, MapPin, Plus, ArrowRight } from "lucide-react-native";
import { usePlaces, isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useDismissals, useDismissPlace } from "@/hooks/useDismissals";
import { colors } from "@/lib/colors";
import * as Location from "expo-location";

const { width: W, height: H } = Dimensions.get("window");
const SWIPE_THRESHOLD = 100;

// Haversine distance in km
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function getImageUrl(place: Place): string {
  return place.image_url ? place.image_url.split(",")[0].trim() : "";
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────

function SwipeCard({
  place,
  onSwipeLeft,
  onSwipeRight,
  onNavigate,
  userLat,
  userLng,
}: {
  place: Place;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onNavigate: () => void;
  userLat: number | null;
  userLng: number | null;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const triggered = useRef(false);

  const rotate = pan.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ["-8deg", "0deg", "8deg"],
    extrapolate: "clamp",
  });

  const likeOpacity = pan.x.interpolate({
    inputRange: [10, 60],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const nopeOpacity = pan.x.interpolate({
    inputRange: [-60, -10],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, g) => {
        if (triggered.current) return;
        if (g.dx > SWIPE_THRESHOLD) {
          triggered.current = true;
          Animated.timing(pan, {
            toValue: { x: W * 1.5, y: g.dy },
            duration: 220,
            useNativeDriver: false,
          }).start(() => onSwipeRight());
        } else if (g.dx < -SWIPE_THRESHOLD) {
          triggered.current = true;
          Animated.timing(pan, {
            toValue: { x: -W * 1.5, y: g.dy },
            duration: 220,
            useNativeDriver: false,
          }).start(() => onSwipeLeft());
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const imageUrl = getImageUrl(place);
  const category = place.categories?.split(",")[0]?.trim() ?? "";
  const isOpen = isPlaceOpen(place.opening_hours as Record<string, string> | null);
  const hasOpeningHours = !!place.opening_hours;
  const distance =
    userLat !== null && userLng !== null && place.lat && place.lng
      ? getDistanceKm(userLat, userLng, place.lat, place.lng)
      : null;

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
      {...panResponder.panHandlers}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
      )}
      <View style={styles.cardGradient} />

      {/* GILLAR / SKIPPA */}
      <Animated.View style={[styles.likeLabel, { opacity: likeOpacity }]}>
        <Text style={styles.likeLabelText}>GILLAR</Text>
      </Animated.View>
      <Animated.View style={[styles.nopeLabel, { opacity: nopeOpacity }]}>
        <Text style={styles.nopeLabelText}>SKIPPA</Text>
      </Animated.View>

      {/* Top badges */}
      <View style={styles.cardTopRow}>
        {distance !== null && (
          <View style={styles.distanceBadge}>
            <MapPin size={12} color="#fff" />
            <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
          </View>
        )}
        {hasOpeningHours && (
          <View style={[styles.openBadge, isOpen ? styles.openBadgeOpen : styles.openBadgeClosed]}>
            <Text style={[styles.openBadgeText, isOpen ? styles.openTextOpen : styles.openTextClosed]}>
              {isOpen ? "Öppet nu" : "Stängt"}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom info — leave room for buttons on right */}
      <View style={styles.cardInfo}>
        {category ? <Text style={styles.cardCategory}>{category.toUpperCase()}</Text> : null}
        <Text style={styles.cardName}>{place.name}</Text>
        {place.short_description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{place.short_description}</Text>
        ) : null}
        {place.nearest_town ? (
          <View style={styles.cardLocation}>
            <MapPin size={11} color="rgba(255,255,255,0.55)" />
            <Text style={styles.cardLocationText}>{place.nearest_town}</Text>
          </View>
        ) : null}
      </View>

      {/* Right side buttons (top to bottom inside card) */}
      <View style={styles.cardActions}>
        {/* Plus – listor (ej implementerat) */}
        <TouchableOpacity style={[styles.actionCircle, styles.actionCircleGray]} activeOpacity={0.8}>
          <Plus size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Gul höger-pil – öppna platsen */}
        <TouchableOpacity
          style={[styles.actionCircle, styles.actionCircleGold]}
          onPress={onNavigate}
          activeOpacity={0.8}
        >
          <ArrowRight size={22} color="#1a1200" strokeWidth={2.5} />
        </TouchableOpacity>

        {/* Hjärta – spara */}
        <TouchableOpacity
          style={[styles.actionCircle, styles.actionCircleHeart]}
          onPress={onSwipeRight}
          activeOpacity={0.8}
        >
          <Heart size={22} color="#fff" fill="#fff" />
        </TouchableOpacity>

        {/* X – skippa */}
        <TouchableOpacity
          style={[styles.actionCircle, styles.actionCircleX]}
          onPress={onSwipeLeft}
          activeOpacity={0.8}
        >
          <X size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── DiscoverScreen ────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: places = [], isLoading: placesLoading } = usePlaces();
  const { data: favorites = [], isLoading: favsLoading } = useFavorites();
  const { data: dismissedIds = [], isLoading: dismissalsLoading } = useDismissals();
  const isLoading = placesLoading || favsLoading || dismissalsLoading;

  const toggleFavorite = useToggleFavorite();
  const dismissPlace = useDismissPlace();

  // Fixed card queue — shuffled ONCE when all data has loaded, never touched again.
  // Advancing through it is just incrementing an index.
  const queueRef = useRef<Place[] | null>(null);
  const [topIndex, setTopIndex] = useState(0);

  useEffect(() => {
    // Only initialize once, when all three queries have resolved
    if (queueRef.current !== null) return;
    if (isLoading) return;

    const favIds = new Set(favorites.map((f) => f.place_id).filter(Boolean) as number[]);
    const excluded = new Set([...dismissedIds, ...favIds]);
    const available = places.filter((p) => !excluded.has(p.id));

    // Fisher-Yates shuffle
    const arr = [...available];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    queueRef.current = arr;
    setTopIndex(0); // reset index (safety)
  }, [isLoading]); // only re-run if loading state changes

  const queue = queueRef.current ?? [];
  const currentPlace = queue[topIndex] ?? null;
  const remaining = queue.length - topIndex;

  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLat(loc.coords.latitude);
      setUserLng(loc.coords.longitude);
    })();
  }, []);

  // Advance to next card — just bump the index
  const advance = useCallback(() => {
    setTopIndex((i) => i + 1);
  }, []);

  const handleSwipeRight = useCallback(() => {
    if (!currentPlace) return;
    toggleFavorite.mutate({ placeId: currentPlace.id });
    advance();
  }, [currentPlace, toggleFavorite, advance]);

  const handleSwipeLeft = useCallback(() => {
    if (!currentPlace) return;
    dismissPlace.mutate(currentPlace.id);
    advance();
  }, [currentPlace, dismissPlace, advance]);

  const handleNavigate = useCallback(() => {
    if (!currentPlace) return;
    router.push(`/place/${currentPlace.id}` as any);
  }, [currentPlace, router]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={["top"]} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Upptäck</Text>
          {!isLoading && remaining > 0 && (
            <Text style={styles.headerSub}>{remaining} platser kvar</Text>
          )}
        </View>
        <View style={{ width: 44 }} />
      </SafeAreaView>

      {/* Card area */}
      <View style={[styles.cardArea, { paddingBottom: insets.bottom + 16 }]}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.gold} />
        ) : !currentPlace ? (
          <View style={styles.emptyState}>
            <Heart size={52} color={colors.gold} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Allt utforskat!</Text>
            <Text style={styles.emptySub}>
              Du har sett alla platser på Österlen. Kom tillbaka snart för fler.
            </Text>
          </View>
        ) : (
          <SwipeCard
            key={currentPlace.id}
            place={currentPlace}
            onSwipeRight={handleSwipeRight}
            onSwipeLeft={handleSwipeLeft}
            onNavigate={handleNavigate}
            userLat={userLat}
            userLng={userLng}
          />
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_H = H * 0.72;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  headerCenter: { alignItems: "center" },
  headerTitle: {
    fontSize: 26, fontWeight: "700", color: colors.foreground,
    fontFamily: "PlayfairDisplay_700Bold",
  },
  headerSub: { fontSize: 12, color: colors.foregroundMuted, marginTop: 1 },

  cardArea: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    width: W - 32, height: CARD_H,
    borderRadius: 28, overflow: "hidden",
    backgroundColor: colors.card,
  },
  cardGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: "60%",
    backgroundColor: "rgba(0,0,0,0.72)",
  },

  likeLabel: {
    position: "absolute", top: 36, left: 20, zIndex: 10,
    borderWidth: 3, borderColor: "#22C55E", borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 5,
    transform: [{ rotate: "-12deg" }],
  },
  likeLabelText: { fontSize: 24, fontWeight: "900", color: "#22C55E" },
  nopeLabel: {
    position: "absolute", top: 36, right: 20, zIndex: 10,
    borderWidth: 3, borderColor: "#EF4444", borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 5,
    transform: [{ rotate: "12deg" }],
  },
  nopeLabelText: { fontSize: 24, fontWeight: "900", color: "#EF4444" },

  cardTopRow: {
    position: "absolute", top: 16, left: 16, right: 16,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    zIndex: 5,
  },
  distanceBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
  },
  distanceText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  openBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  openBadgeOpen: { backgroundColor: "rgba(34,197,94,0.25)", borderWidth: 1, borderColor: "rgba(34,197,94,0.6)" },
  openBadgeClosed: { backgroundColor: "rgba(239,68,68,0.2)", borderWidth: 1, borderColor: "rgba(239,68,68,0.5)" },
  openBadgeText: { fontSize: 12, fontWeight: "700" },
  openTextOpen: { color: "#4ADE80" },
  openTextClosed: { color: "#F87171" },

  cardInfo: {
    position: "absolute", bottom: 0, left: 0, right: 80,
    padding: 20, paddingBottom: 24, zIndex: 2,
  },
  cardCategory: {
    fontSize: 11, fontWeight: "700", color: colors.gold,
    letterSpacing: 1.5, marginBottom: 6,
  },
  cardName: { fontSize: 28, fontWeight: "800", color: "#fff", lineHeight: 33, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 18, marginBottom: 8 },
  cardLocation: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardLocationText: { fontSize: 12, color: "rgba(255,255,255,0.55)" },

  cardActions: {
    position: "absolute", right: 14, bottom: 16,
    alignItems: "center", gap: 10, zIndex: 10,
  },
  actionCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  actionCircleGray: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  actionCircleGold: {
    backgroundColor: colors.gold,
    width: 52, height: 52, borderRadius: 26,
  },
  actionCircleHeart: {
    backgroundColor: "#52886A", width: 56, height: 56, borderRadius: 28,
  },
  actionCircleX: {
    backgroundColor: "#EF4444", width: 56, height: 56, borderRadius: 28,
  },

  emptyState: { alignItems: "center", paddingHorizontal: 40, gap: 16 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: "center" },
  emptySub: { fontSize: 15, color: colors.foregroundMuted, textAlign: "center", lineHeight: 22 },
});
