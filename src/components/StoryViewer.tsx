import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Animated,
  PanResponder,
  ScrollView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Crown, MapPin, Navigation, Phone, Mail, ChevronUp, X } from "lucide-react-native";
import type { BusinessStory } from "@/hooks/useBusinessStories";
import { useMarkStoryViewed } from "@/hooks/useStoryViews";
import { colors } from "@/lib/colors";

const { width: W, height: H } = Dimensions.get("window");
const STORY_DURATION = 5000;
const PREMIUM_DURATION = 8000;
const TICK_MS = 50;

export type StoryType = "favorite" | "premium" | "regular";

export interface StoryGroupData {
  placeId: number;
  placeName: string;
  placeCategory?: string | null;
  placeLocation?: string | null;
  placeLat?: number | null;
  placeLng?: number | null;
  logoUrl: string | null;
  storyType: StoryType;
  stories: BusinessStory[];
}

interface Props {
  groups: StoryGroupData[];
  initialGroupIndex: number;
  onClose: () => void;
  hasPremiumAccess?: boolean;
  onPremiumBlocked?: (groupIndex: number) => void;
}

export function StoryViewer({
  groups,
  initialGroupIndex,
  onClose,
  hasPremiumAccess = false,
  onPremiumBlocked,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const markViewed = useMarkStoryViewed();

  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dealOpen, setDealOpen] = useState(false);
  const isPausedRef = useRef(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const dealTranslateY = useRef(new Animated.Value(300)).current;

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const isPremium = group?.storyType === "premium";
  const duration = isPremium ? PREMIUM_DURATION : STORY_DURATION;

  // Mark story as viewed
  useEffect(() => {
    if (story?.id) {
      markViewed.mutate(story.id);
    }
    setDealOpen(false);
  }, [groupIdx, storyIdx]);

  const handleClose = useCallback(() => {
    Animated.timing(translateY, {
      toValue: H,
      duration: 250,
      useNativeDriver: true,
    }).start(onClose);
  }, [onClose, translateY]);

  const goNext = useCallback(() => {
    const g = groups[groupIdx];
    if (!g) return;
    if (storyIdx < g.stories.length - 1) {
      setStoryIdx((i) => i + 1);
      setProgress(0);
    } else if (groupIdx < groups.length - 1) {
      const next = groupIdx + 1;
      if (!hasPremiumAccess && groups[next]?.storyType === "premium") {
        handleClose();
        onPremiumBlocked?.(next);
        return;
      }
      setGroupIdx(next);
      setStoryIdx(0);
      setProgress(0);
    } else {
      handleClose();
    }
  }, [storyIdx, groupIdx, groups, hasPremiumAccess, handleClose, onPremiumBlocked]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
      setProgress(0);
    } else if (groupIdx > 0) {
      const prev = groupIdx - 1;
      if (!hasPremiumAccess && groups[prev]?.storyType === "premium") return;
      setGroupIdx(prev);
      setStoryIdx(groups[prev].stories.length - 1);
      setProgress(0);
    }
  }, [storyIdx, groupIdx, groups, hasPremiumAccess]);

  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  // Auto-advance timer
  useEffect(() => {
    setProgress(0);
    if (dealOpen) return;

    let currentProgress = 0;
    const interval = setInterval(() => {
      if (isPausedRef.current) return;
      currentProgress += (TICK_MS / duration) * 100;
      if (currentProgress >= 100) {
        clearInterval(interval);
        goNextRef.current();
        return;
      }
      setProgress(currentProgress);
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [storyIdx, groupIdx, dealOpen, duration]);

  // Deal sheet animation
  const openDeal = () => {
    setDealOpen(true);
    isPausedRef.current = true;
    Animated.spring(dealTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 25,
      stiffness: 300,
    }).start();
  };

  const closeDeal = () => {
    Animated.timing(dealTranslateY, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setDealOpen(false);
      isPausedRef.current = false;
    });
  };

  // Swipe down to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => !dealOpen && g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => { isPausedRef.current = true; },
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100) {
          Animated.timing(translateY, { toValue: H, duration: 200, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          isPausedRef.current = false;
        }
      },
    })
  ).current;

  if (!group || !story) return null;

  const placeName = group.placeName.split(/\s*[-–—]\s*/)[0].split(/\s*[,]\s*/)[0].trim();

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      <StatusBar hidden />

      {/* Story image */}
      <Image source={{ uri: story.image_url }} style={styles.image} resizeMode="cover" />

      {/* Gradients */}
      <View style={styles.topGradient} />
      <View style={styles.bottomGradient} />

      {/* Progress bars */}
      <View style={[styles.progressContainer, { top: insets.top + 8 }]}>
        {group.stories.map((_, i) => (
          <View key={i} style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${i < storyIdx ? 100 : i === storyIdx ? Math.min(progress, 100) : 0}%`,
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header: logo + name (tappable → place detail) */}
      <TouchableOpacity
        style={[styles.header, { top: insets.top + 24 }]}
        onPress={() => { onClose(); router.push(`/place/${group.placeId}` as any); }}
        activeOpacity={0.85}
      >
        <View style={styles.logoWrapper}>
          {group.logoUrl ? (
            <Image source={{ uri: group.logoUrl }} style={styles.logo} resizeMode="cover" />
          ) : (
            <View style={[styles.logo, styles.logoPlaceholder]} />
          )}
        </View>
        <Text style={styles.placeName}>{placeName}</Text>
      </TouchableOpacity>

      {/* Crown badge for premium */}
      {isPremium && (
        <View style={[styles.crownBadge, { top: insets.top + 24 }]}>
          <Crown size={16} color="#1a1200" />
        </View>
      )}

      {/* Premium info boxes */}
      {isPremium && (
        <View style={styles.infoBoxes}>
          {group.placeLocation && (
            <View style={styles.infoBox}>
              <View style={styles.infoBoxHeader}>
                <MapPin size={10} color={colors.gold} />
                <Text style={styles.infoBoxLabel}>PLATS</Text>
              </View>
              <Text style={styles.infoBoxValue}>{group.placeLocation}</Text>
            </View>
          )}
          {group.placeCategory && (
            <View style={styles.infoBox}>
              <View style={styles.infoBoxHeader}>
                <MapPin size={10} color={colors.gold} />
                <Text style={styles.infoBoxLabel}>KATEGORI</Text>
              </View>
              <Text style={styles.infoBoxValue}>
                {group.placeCategory.split(",")[0].trim()}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Caption */}
      {story.caption && !dealOpen && (
        <View style={[styles.captionContainer, { bottom: insets.bottom + (isPremium && story.deal_text ? 80 : 32) }]}>
          <Text style={styles.caption}>{story.caption}</Text>
        </View>
      )}

      {/* Premium deal button */}
      {isPremium && story.deal_text && !dealOpen && (
        <TouchableOpacity
          style={[styles.dealButton, { bottom: insets.bottom + 24 }]}
          onPress={openDeal}
        >
          <Crown size={16} color="#1a1200" />
          <Text style={styles.dealButtonText}>Visa erbjudande</Text>
          <ChevronUp size={16} color="#1a1200" />
        </TouchableOpacity>
      )}

      {/* Deal coupon sheet */}
      {dealOpen && (
        <>
          <TouchableOpacity style={styles.dealBackdrop} onPress={closeDeal} activeOpacity={1} />
          <Animated.View
            style={[
              styles.dealSheet,
              { bottom: insets.bottom + 16, transform: [{ translateY: dealTranslateY }] },
            ]}
          >
            {/* Ticket top */}
            <View style={styles.ticketEdge} />
            <View style={styles.dealSheetInner}>
              <View style={styles.dealSheetHeader}>
                <Crown size={16} color="#1a1200" />
                <Text style={styles.dealSheetLabel}>SPECIALERBJUDANDE</Text>
              </View>
              <Text style={styles.dealSheetTitle}>{story.deal_text}</Text>
              <Text style={styles.dealSheetPlace}>{group.placeName}</Text>
            </View>
            {/* Ticket bottom */}
            <View style={styles.ticketEdge} />
          </Animated.View>
        </>
      )}

      {/* Tap zones: left=prev, right=next */}
      <TouchableOpacity
        style={styles.tapLeft}
        onPress={goPrev}
        onLongPress={() => { isPausedRef.current = true; }}
        onPressOut={() => { if (!dealOpen) isPausedRef.current = false; }}
        activeOpacity={1}
      />
      <TouchableOpacity
        style={styles.tapRight}
        onPress={dealOpen ? closeDeal : goNext}
        onLongPress={() => { isPausedRef.current = true; }}
        onPressOut={() => { if (!dealOpen) isPausedRef.current = false; }}
        activeOpacity={1}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 100,
  },
  image: { width: W, height: H },

  topGradient: {
    position: "absolute", top: 0, left: 0, right: 0, height: 220,
    backgroundColor: "rgba(0,0,0,0.55)",
    // fades to transparent downward via opacity layering
  },
  bottomGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  // Progress
  progressContainer: {
    position: "absolute", left: 8, right: 8,
    flexDirection: "row", gap: 4, zIndex: 20,
  },
  progressBar: {
    flex: 1, height: 2.5,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2, overflow: "hidden",
  },
  progressFill: {
    height: "100%", backgroundColor: "#fff", borderRadius: 2,
  },

  // Header
  header: {
    position: "absolute", left: 12, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  logoWrapper: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)",
    overflow: "hidden",
  },
  logo: { width: "100%", height: "100%" },
  logoPlaceholder: { backgroundColor: "rgba(255,255,255,0.25)" },
  placeName: {
    color: "#fff", fontSize: 14, fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Crown
  crownBadge: {
    position: "absolute", right: 14, zIndex: 20,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
  },

  // Premium info boxes
  infoBoxes: {
    position: "absolute", left: 12, bottom: "42%",
    zIndex: 20, gap: 8,
  },
  infoBox: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  infoBoxHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  infoBoxLabel: {
    fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 0.8,
  },
  infoBoxValue: { fontSize: 12, fontWeight: "600", color: "#fff" },

  // Caption
  captionContainer: {
    position: "absolute", left: 16, right: 16, zIndex: 20,
  },
  caption: {
    fontSize: 15, color: "#fff", lineHeight: 22,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Deal button
  dealButton: {
    position: "absolute", alignSelf: "center", left: 40, right: 40,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.gold,
    paddingVertical: 12, borderRadius: 28,
    zIndex: 20,
    shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  dealButtonText: { color: "#1a1200", fontSize: 15, fontWeight: "700" },

  // Deal coupon sheet
  dealBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
    zIndex: 30,
  },
  dealSheet: {
    position: "absolute", left: 24, right: 24,
    zIndex: 40, overflow: "hidden", borderRadius: 16,
  },
  ticketEdge: {
    height: 8, backgroundColor: colors.gold,
  },
  dealSheetInner: {
    backgroundColor: colors.gold,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  dealSheetHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  dealSheetLabel: { fontSize: 10, fontWeight: "800", color: "#1a1200", letterSpacing: 1 },
  dealSheetTitle: { fontSize: 18, fontWeight: "800", color: "#1a1200", marginBottom: 4 },
  dealSheetPlace: { fontSize: 13, color: "rgba(26,18,0,0.7)" },

  // Tap zones
  tapLeft: {
    position: "absolute", left: 0, top: 80, bottom: 100, width: W * 0.33, zIndex: 10,
  },
  tapRight: {
    position: "absolute", right: 0, top: 80, bottom: 100, width: W * 0.67, zIndex: 10,
  },
});
