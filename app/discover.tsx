import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Heart, X, Home, MapPin } from "lucide-react-native";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useDismissals, useDismissPlace } from "@/hooks/useDismissals";
import { colors } from "@/lib/colors";

const { width: W, height: H } = Dimensions.get("window");
const SWIPE_THRESHOLD = 100;
const CARD_HORIZONTAL = 24;
const CARD_WIDTH = W - CARD_HORIZONTAL * 2;

function getImageUrl(place: Place): string {
  return place.image_url ? place.image_url.split(",")[0].trim() : "";
}

function SwipeCard({
  place,
  onSwipeLeft,
  onSwipeRight,
}: {
  place: Place;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const triggered = useRef(false);
  const exitDir = useRef<"left" | "right" | null>(null);

  const rotate = pan.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ["-12deg", "0deg", "12deg"],
    extrapolate: "clamp",
  });

  const redOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD * 1.5, -SWIPE_THRESHOLD / 2, 0],
    outputRange: [0.7, 0.3, 0],
    extrapolate: "clamp",
  });

  const greenOpacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD / 2, SWIPE_THRESHOLD * 1.5],
    outputRange: [0, 0.3, 0.7],
    extrapolate: "clamp",
  });

  // Like / Nope label opacity
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
          exitDir.current = "right";
          Animated.timing(pan, {
            toValue: { x: W * 1.5, y: g.dy },
            duration: 250,
            useNativeDriver: false,
          }).start(() => onSwipeRight());
        } else if (g.dx < -SWIPE_THRESHOLD) {
          triggered.current = true;
          exitDir.current = "left";
          Animated.timing(pan, {
            toValue: { x: -W * 1.5, y: g.dy },
            duration: 250,
            useNativeDriver: false,
          }).start(() => onSwipeLeft());
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const imageUrl = getImageUrl(place);
  const category = place.categories?.split(",")[0]?.trim() ?? "";

  return (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Red glow border */}
      <Animated.View style={[styles.glowBorder, { borderColor: "rgba(239,68,68,1)", opacity: redOpacity }]} />
      {/* Green glow border */}
      <Animated.View style={[styles.glowBorder, { borderColor: "rgba(34,197,94,1)", opacity: greenOpacity }]} />

      {/* Image */}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, { backgroundColor: colors.surface }]} />
      )}

      {/* Gradient overlay */}
      <View style={styles.cardGradient} />

      {/* Like / Nope labels */}
      <Animated.View style={[styles.likeLabel, { opacity: likeOpacity }]}>
        <Text style={styles.likeLabelText}>GILLAR</Text>
      </Animated.View>
      <Animated.View style={[styles.nopeLabel, { opacity: nopeOpacity }]}>
        <Text style={styles.nopeLabelText}>SKIPPA</Text>
      </Animated.View>

      {/* Content */}
      <View style={styles.cardContent}>
        <Text style={styles.cardCategory}>{category.toUpperCase()}</Text>
        <Text style={styles.cardName}>{place.name}</Text>
        {place.short_description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{place.short_description}</Text>
        ) : null}
        {place.nearest_town ? (
          <View style={styles.cardLocation}>
            <MapPin size={12} color="rgba(255,255,255,0.6)" />
            <Text style={styles.cardLocationText}>{place.nearest_town}</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function EmptyCard() {
  return (
    <View style={styles.card}>
      <View style={[styles.cardImage, { backgroundColor: colors.surface }]} />
      <View style={styles.cardGradient} />
      <View style={styles.cardContent}>
        <Text style={styles.cardCategory}>ÖSTERLEN</Text>
        <Text style={styles.cardName}>Utforska</Text>
        <Text style={styles.cardDesc}>Svajpa för att utforska fler platser</Text>
      </View>
    </View>
  );
}

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: places = [] } = usePlaces();
  const { data: favorites = [] } = useFavorites();
  const { data: dismissedIds = [] } = useDismissals();
  const toggleFavorite = useToggleFavorite();
  const dismissPlace = useDismissPlace();

  const [topIndex, setTopIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const shuffledRef = useRef<Place[] | null>(null);

  const buffer = useMemo(() => {
    const favIds = new Set(favorites.map((f) => f.place_id).filter(Boolean) as number[]);
    const excluded = new Set([...dismissedIds, ...favIds]);
    const available = places.filter((p) => !excluded.has(p.id));

    // Stable shuffle — only recompute when length changes
    if (!shuffledRef.current || shuffledRef.current.length !== available.length) {
      const arr = [...available];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      shuffledRef.current = arr;
    }
    return shuffledRef.current;
  }, [places, favorites, dismissedIds]);

  const currentPlace = buffer[topIndex] ?? null;
  const nextPlace = buffer[topIndex + 1] ?? null;

  const advance = useCallback(() => {
    setTransitioning(true);
    setTimeout(() => {
      setTopIndex((i) => i + 1);
      setTransitioning(false);
    }, 400);
  }, []);

  const handleSwipeRight = useCallback(() => {
    if (!currentPlace || transitioning) return;
    toggleFavorite.mutate({ placeId: currentPlace.id });
    advance();
  }, [currentPlace, transitioning, toggleFavorite, advance]);

  const handleSwipeLeft = useCallback(() => {
    if (!currentPlace || transitioning) return;
    dismissPlace.mutate(currentPlace.id);
    advance();
  }, [currentPlace, transitioning, dismissPlace, advance]);

  const hasCards = currentPlace !== null;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Back button */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Home size={20} color={colors.foregroundMuted} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Utforska</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Card stack */}
      <View style={styles.cardArea}>
        {!hasCards ? (
          // Empty state
          <View style={styles.emptyState}>
            <Heart size={48} color={colors.primary} />
            <Text style={styles.emptyTitle}>Alla platser utforskade!</Text>
            <Text style={styles.emptySub}>
              Du har sett alla platser. Kom tillbaka snart för nya upptäckter.
            </Text>
          </View>
        ) : (
          <>
            {/* Next card (behind, scaled down) */}
            {nextPlace && !transitioning && (
              <View style={[styles.card, styles.cardBehind]} pointerEvents="none">
                {getImageUrl(nextPlace) ? (
                  <Image source={{ uri: getImageUrl(nextPlace) }} style={styles.cardImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.cardImage, { backgroundColor: colors.surface }]} />
                )}
                <View style={styles.cardGradient} />
                <View style={styles.cardContent}>
                  <Text style={styles.cardName} numberOfLines={1}>{nextPlace.name}</Text>
                </View>
              </View>
            )}

            {/* Transition card (rapeseed-style) */}
            {transitioning && <EmptyCard />}

            {/* Top swipeable card */}
            {!transitioning && currentPlace && (
              <SwipeCard
                key={currentPlace.id}
                place={currentPlace}
                onSwipeRight={handleSwipeRight}
                onSwipeLeft={handleSwipeLeft}
              />
            )}
          </>
        )}
      </View>

      {/* Action buttons */}
      {hasCards && (
        <View style={styles.actions}>
          {/* Pass */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPass]}
            onPress={handleSwipeLeft}
            activeOpacity={0.8}
          >
            <X size={32} color="#EF4444" />
          </TouchableOpacity>

          {/* Home */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnHome]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Home size={20} color={colors.foregroundMuted} />
          </TouchableOpacity>

          {/* Like */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnLike]}
            onPress={handleSwipeRight}
            activeOpacity={0.8}
          >
            <Heart size={32} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const CARD_HEIGHT = H * 0.65;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  topTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground },

  cardArea: {
    flex: 1, alignItems: "center", justifyContent: "center",
  },

  card: {
    position: "absolute",
    width: CARD_WIDTH, height: CARD_HEIGHT,
    borderRadius: 28, overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  cardBehind: {
    transform: [{ scale: 0.95 }],
    zIndex: 10,
  },
  glowBorder: {
    position: "absolute", inset: 0,
    borderRadius: 28, borderWidth: 3,
    zIndex: 5,
  },
  cardImage: { width: "100%", height: "100%", position: "absolute" },
  cardGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: "55%",
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 1,
  },

  // Like / Nope labels
  likeLabel: {
    position: "absolute", top: 40, left: 20, zIndex: 10,
    borderWidth: 3, borderColor: "#22C55E", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 4,
    transform: [{ rotate: "-15deg" }],
  },
  likeLabelText: { fontSize: 22, fontWeight: "900", color: "#22C55E" },
  nopeLabel: {
    position: "absolute", top: 40, right: 20, zIndex: 10,
    borderWidth: 3, borderColor: "#EF4444", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 4,
    transform: [{ rotate: "15deg" }],
  },
  nopeLabelText: { fontSize: 22, fontWeight: "900", color: "#EF4444" },

  cardContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 24, paddingBottom: 28, zIndex: 2,
  },
  cardCategory: {
    fontSize: 11, fontWeight: "700", color: colors.gold,
    letterSpacing: 1.5, marginBottom: 6,
  },
  cardName: {
    fontSize: 30, fontWeight: "800", color: "#FFFFFF",
    lineHeight: 36, marginBottom: 8,
  },
  cardDesc: { fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 20, marginBottom: 8 },
  cardLocation: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardLocationText: { fontSize: 12, color: "rgba(255,255,255,0.6)" },

  // Empty state
  emptyState: {
    alignItems: "center", paddingHorizontal: 40, gap: 16,
  },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: "center" },
  emptySub: { fontSize: 15, color: colors.foregroundMuted, textAlign: "center", lineHeight: 22 },

  // Action buttons
  actions: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 20, paddingVertical: 24, paddingHorizontal: 40,
  },
  actionBtn: {
    alignItems: "center", justifyContent: "center", borderRadius: 50,
    backgroundColor: colors.card, borderWidth: 1.5,
  },
  actionBtnPass: { width: 64, height: 64, borderColor: "rgba(239,68,68,0.4)" },
  actionBtnHome: { width: 44, height: 44, borderColor: colors.border },
  actionBtnLike: { width: 64, height: 64, borderColor: "rgba(82,136,106,0.4)" },
});
