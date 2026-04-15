import {
  View,
  Text,
  ScrollView,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  Share,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useMemo, useRef, useCallback } from "react";
import {
  MapPin,
  Search,
  ChevronRight,
  Crown,
  Heart,
  Sparkles,
  Share2,
  Utensils,
  BedDouble,
} from "lucide-react-native";
import { usePlaces, isPlaceOpen, getTierScore, type Place } from "@/hooks/usePlaces";
import { useEvents, type Event } from "@/hooks/useEvents";
import { useProfile } from "@/hooks/useProfile";
import { useFavorites, useToggleFavorite, useIsFavorite } from "@/hooks/useFavorites";
import { useBusinessStories } from "@/hooks/useBusinessStories";
import { useStoryViews } from "@/hooks/useStoryViews";
import { StoryViewer, type StoryGroupData, type StoryType } from "@/components/StoryViewer";
import { colors } from "@/lib/colors";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { sv } from "date-fns/locale";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const HERO_HEIGHT = 260;
const HERO_IMAGE = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=600&fit=crop";


// Ring colors
const RING_SILVER = "#B8B8B8";
const RING_GOLD = "#C9A84C";
const RING_BRONZE = "#8B5E3C";
const RING_SEEN = "rgba(255,255,255,0.2)";

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Idag";
  if (isTomorrow(date)) return "Imorgon";
  if (isThisWeek(date)) return format(date, "EEEE", { locale: sv });
  return format(date, "d MMM", { locale: sv });
}

function formatDateBadge(dateStr: string, endDateStr?: string | null): { month: string; day: string } {
  const d = new Date(dateStr);
  const month = format(d, "MMM", { locale: sv }).toUpperCase();
  if (endDateStr) {
    const end = new Date(endDateStr);
    const startDay = format(d, "d");
    const endDay = format(end, "d");
    if (startDay !== endDay) return { month, day: `${startDay}–${endDay}` };
  }
  return { month, day: format(d, "d") };
}

function getRingColor(storyType: StoryType, isSeen: boolean): string {
  if (isSeen) return RING_SEEN;
  switch (storyType) {
    case "favorite": return RING_SILVER;
    case "premium": return RING_GOLD;
    default: return RING_BRONZE;
  }
}

// ─── StoryCircle ────────────────────────────────────────────────────────────

function StoryCircle({
  group,
  isSeen,
  onPress,
}: {
  group: StoryGroupData;
  isSeen: boolean;
  onPress: () => void;
}) {
  const ringColor = getRingColor(group.storyType, isSeen);
  const imageUrl =
    group.storyType === "premium"
      ? (group.logoUrl ?? group.stories[0]?.image_url)
      : group.stories[0]?.image_url;
  const label = group.placeName.split(/\s*[-–—]\s*/)[0].split(/\s*[,]\s*/)[0].trim();

  return (
    <TouchableOpacity style={s.storyCircleWrapper} activeOpacity={0.8} onPress={onPress}>
      <View style={[s.storyRing, { borderColor: ringColor }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={s.storyImage} resizeMode="cover" />
        ) : (
          <View style={[s.storyImage, { backgroundColor: colors.surface }]} />
        )}
      </View>
      {group.storyType === "premium" && (
        <View style={s.crownBadge}>
          <Crown size={9} color="#1a1200" />
        </View>
      )}
      <Text style={[s.storyName, isSeen && s.storyNameSeen]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── PremiumModal ────────────────────────────────────────────────────────────

function PremiumModal({ onClose, onUpgrade }: { onClose: () => void; onUpgrade: () => void }) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable style={s.premiumModal} onPress={(e) => e.stopPropagation()}>
          <View style={s.premiumCrown}>
            <Crown size={32} color="#1a1200" />
          </View>
          <Text style={s.premiumTitle}>Exklusivt innehåll</Text>
          <Text style={s.premiumSub}>
            Lås upp exklusiva deals och erbjudanden med{" "}
            <Text style={{ color: colors.gold }}>Österlenpasset</Text>
          </Text>
          <TouchableOpacity style={s.premiumBtn} onPress={onUpgrade}>
            <Text style={s.premiumBtnText}>Köp Österlenpasset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.premiumSkip} onPress={onClose}>
            <Text style={s.premiumSkipText}>Kanske senare, fortsätt</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── NearbyCard ──────────────────────────────────────────────────────────────

function NearbyCard({ place }: { place: Place }) {
  const router = useRouter();
  const imageUrl = place.image_url?.split(",")[0].trim() ?? "";

  return (
    <TouchableOpacity
      style={s.nearbyCard}
      activeOpacity={0.85}
      onPress={() => router.push(`/place/${place.id}` as any)}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={s.nearbyImage} resizeMode="cover" />
      ) : (
        <View style={[s.nearbyImage, { backgroundColor: colors.surface }]} />
      )}
      <View style={s.nearbyOverlay} />
      <View style={s.nearbyContent}>
        <Text style={s.nearbyName} numberOfLines={2}>{place.name}</Text>
        {place.nearest_town && (
          <View style={s.nearbyLocation}>
            <MapPin size={10} color="rgba(255,255,255,0.6)" />
            <Text style={s.nearbyLocationText}>{place.nearest_town}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── UpcomingEventCard ────────────────────────────────────────────────────────

function UpcomingEventCard({ event }: { event: Event }) {
  const router = useRouter();
  const badge = event.date ? formatDateBadge(event.date, event.end_date) : null;
  const imageUrl = event.image_url ?? "";

  return (
    <TouchableOpacity
      style={s.upcomingCard}
      activeOpacity={0.88}
      onPress={() => router.push(`/event/${event.id}` as any)}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#3D2B1A" }]} />
      )}
      <View style={s.upcomingGradient} />

      {badge && (
        <View style={s.upcomingBadge}>
          <Text style={s.upcomingBadgeMonth}>{badge.month}</Text>
          <Text style={s.upcomingBadgeDay}>{badge.day}</Text>
        </View>
      )}

      <View style={s.upcomingContent}>
        <Text style={s.upcomingTitle} numberOfLines={2}>{event.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── FeedPost ─────────────────────────────────────────────────────────────────

function FeedPost({
  place,
  hasStory = false,
  storyType,
  onStoryClick,
  hasPremiumStory = false,
  hasOsterlenPass = false,
  onPremiumStoryClick,
}: {
  place: Place;
  hasStory?: boolean;
  storyType?: StoryType;
  onStoryClick?: () => void;
  hasPremiumStory?: boolean;
  hasOsterlenPass?: boolean;
  onPremiumStoryClick?: () => void;
}) {
  const router = useRouter();
  const toggleFavorite = useToggleFavorite();
  const isFav = useIsFavorite(place.id);

  const imageUrls = (place.image_url ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const displayImage = imageUrls[0] ?? "";
  const logoOrImage = place.logo_url ?? displayImage;

  const ringColor =
    hasStory && storyType === "favorite"
      ? RING_SILVER
      : hasStory && storyType === "regular"
      ? RING_BRONZE
      : "transparent";

  const handleShare = async () => {
    try {
      await Share.share({
        title: place.name,
        message: `Upplev ${place.name} på Österlen`,
      });
    } catch {}
  };

  return (
    <View style={s.feedPost}>
      {/* Header */}
      <View style={s.feedHeader}>
        <TouchableOpacity
          style={[s.feedAvatar, { borderColor: ringColor }]}
          onPress={() => (hasStory && onStoryClick ? onStoryClick() : router.push(`/place/${place.id}` as any))}
          activeOpacity={0.8}
        >
          {logoOrImage ? (
            <Image source={{ uri: logoOrImage }} style={s.feedAvatarImg} resizeMode="cover" />
          ) : (
            <View style={[s.feedAvatarImg, { backgroundColor: colors.surface }]} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => router.push(`/place/${place.id}` as any)}
          activeOpacity={0.7}
        >
          <Text style={s.feedPlaceName} numberOfLines={1}>{place.name}</Text>
          <View style={s.feedMeta}>
            <MapPin size={10} color={colors.foregroundSubtle} />
            <Text style={s.feedCategory}>
              {place.categories?.split(",")[0]?.trim() ?? ""}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Image */}
      <TouchableOpacity
        style={s.feedImageContainer}
        activeOpacity={0.92}
        onPress={() => router.push(`/place/${place.id}` as any)}
      >
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={s.feedImage} resizeMode="cover" />
        ) : (
          <View style={[s.feedImage, { backgroundColor: colors.surface }]} />
        )}

        {hasPremiumStory && (
          <TouchableOpacity
            style={s.feedCrownBtn}
            onPress={() => {
              if (hasOsterlenPass) onPremiumStoryClick?.();
            }}
            activeOpacity={0.85}
          >
            <Crown size={18} color="#1a1200" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Actions */}
      <View style={s.feedActions}>
        <TouchableOpacity
          style={s.feedActionBtn}
          onPress={() => toggleFavorite.mutate({ placeId: place.id })}
          activeOpacity={0.7}
        >
          <Heart
            size={24}
            color={isFav ? "#EF4444" : colors.foreground}
            fill={isFav ? "#EF4444" : "transparent"}
          />
        </TouchableOpacity>
        <TouchableOpacity style={s.feedActionBtn} onPress={handleShare} activeOpacity={0.7}>
          <Share2 size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Description */}
      {(place.short_description || place.description) && (
        <Text style={s.feedDesc} numberOfLines={3}>
          {place.short_description || place.description}
        </Text>
      )}
    </View>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [storyGroupIndex, setStoryGroupIndex] = useState<number | null>(null);
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

  const { data: profile } = useProfile();
  const { data: places = [], isLoading: placesLoading } = usePlaces();
  const { data: events = [], isLoading: eventsLoading } = useEvents();
  const { data: businessStories = [] } = useBusinessStories();
  const { data: favorites = [] } = useFavorites();
  const { data: storyViews = [] } = useStoryViews();

  const hasPremiumAccess = profile?.is_member ?? false;
  const firstName = profile?.display_name?.split(" ")[0] ?? null;
  const viewedIds = useMemo(() => new Set(storyViews.map((v) => v.story_id)), [storyViews]);

  // Story groups
  const storyGroups = useMemo((): StoryGroupData[] => {
    const now = new Date().toISOString();
    const activeStories = businessStories.filter((bs) => !bs.expires_at || bs.expires_at >= now);

    const byPlace = new Map<number, { regular: typeof activeStories; premium: typeof activeStories }>();
    for (const bs of activeStories) {
      if (!byPlace.has(bs.place_id)) byPlace.set(bs.place_id, { regular: [], premium: [] });
      const group = byPlace.get(bs.place_id)!;
      if (bs.is_premium) group.premium.push(bs);
      else group.regular.push(bs);
    }

    const result: StoryGroupData[] = [];
    for (const [placeId, { regular, premium }] of byPlace) {
      const place = places.find((p) => p.id === placeId);
      if (!place) continue;
      const isFav = favorites.some((f) => f.place_id === placeId);

      if (regular.length > 0) {
        regular.sort((a, b) => b.created_at.localeCompare(a.created_at));
        result.push({
          placeId,
          placeName: place.name,
          placeCategory: place.categories,
          placeLocation: place.nearest_town,
          logoUrl: place.logo_url ?? null,
          storyType: isFav ? "favorite" : "regular",
          stories: regular,
        });
      }
      if (premium.length > 0) {
        premium.sort((a, b) => b.created_at.localeCompare(a.created_at));
        result.push({
          placeId,
          placeName: place.name,
          placeCategory: place.categories,
          placeLocation: place.nearest_town,
          logoUrl: place.logo_url ?? null,
          storyType: "premium",
          stories: premium,
        });
      }
    }

    const priority: Record<StoryType, number> = { favorite: 0, premium: 1, regular: 2 };
    return result.sort((a, b) => {
      const aIsSeen = a.storyType === "premium" ? false : a.stories.every((s) => viewedIds.has(s.id));
      const bIsSeen = b.storyType === "premium" ? false : b.stories.every((s) => viewedIds.has(s.id));
      if (aIsSeen !== bIsSeen) return aIsSeen ? 1 : -1;
      return priority[a.storyType] - priority[b.storyType];
    });
  }, [businessStories, places, favorites, viewedIds]);

  const handleStoryPress = useCallback((index: number) => {
    const group = storyGroups[index];
    if (group.storyType === "premium" && !hasPremiumAccess) {
      setPremiumModalOpen(true);
      return;
    }
    setStoryGroupIndex(index);
  }, [storyGroups, hasPremiumAccess]);

  // Top places (nearby section)
  const nearbyPlaces = useMemo(
    () => [...places].sort((a, b) => getTierScore(b.business_tier) - getTierScore(a.business_tier)).slice(0, 8),
    [places]
  );

  // Feed places (exclude nearby)
  const feedPlaces = useMemo(() => {
    const nearbyIds = new Set(nearbyPlaces.map((p) => p.id));
    return favorites.length > 0
      ? places.filter((p) => !nearbyIds.has(p.id)).slice(0, 20)
      : [];
  }, [places, nearbyPlaces, favorites]);

  // Upcoming event
  const upcomingEvent = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayEvent = events.find((e) => {
      if (!e.date) return false;
      if (e.end_date) return e.date <= today && e.end_date >= today;
      return e.date === today;
    });
    if (todayEvent) return todayEvent;
    return events
      .filter((e) => e.date && e.date > today)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0] ?? null;
  }, [events]);

  // Parallax hero transform
  const heroTranslate = scrollY.interpolate({
    inputRange: [-100, 0, HERO_HEIGHT],
    outputRange: [50, 0, -HERO_HEIGHT * 0.4],
    extrapolate: "clamp",
  });

  return (
    <View style={s.container}>
      {/* Hero image — fixed behind scroll */}
      <Animated.View style={[s.hero, { transform: [{ translateY: heroTranslate }] }]}>
        <Image source={{ uri: HERO_IMAGE }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={s.heroOverlay} />
        {/* Hero header */}
        <View style={[s.heroHeader, { paddingTop: insets.top + 12 }]}>
          <View>
            <Text style={s.heroWelcome}>VÄLKOMMEN TILL</Text>
            <Text style={s.heroTitle}>Österlen</Text>
            {firstName && <Text style={s.heroName}>{firstName}</Text>}
          </View>
          <TouchableOpacity
            style={s.avatarBtn}
            onPress={() => router.push("/(tabs)/profile" as any)}
            activeOpacity={0.85}
          >
            <View style={s.avatarFallback}>
              <Text style={s.avatarInitials}>
                {(profile?.display_name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={s.levelBadge}>
              <Text style={s.levelText}>1</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Scrollable content card */}
      <Animated.ScrollView
        style={s.scrollView}
        contentContainerStyle={{ paddingTop: HERO_HEIGHT - 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        {/* Content layer that slides up over hero */}
        <View style={s.contentCard}>
          {/* ── Stories ── */}
          {storyGroups.length > 0 && (
            <View style={s.section}>
              <Text style={s.storiesLabel}>UTVALDA PLATSER</Text>
              <FlatList
                data={storyGroups}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(g) => `${g.placeId}-${g.storyType}`}
                contentContainerStyle={s.storiesContainer}
                renderItem={({ item, index }) => {
                  const isSeen =
                    item.storyType !== "premium" && item.stories.every((s) => viewedIds.has(s.id));
                  return (
                    <StoryCircle
                      group={item}
                      isSeen={isSeen}
                      onPress={() => handleStoryPress(index)}
                    />
                  );
                }}
              />
            </View>
          )}

          {/* ── Category tiles ── */}
          <View style={s.categoryRow}>
            <TouchableOpacity
              style={s.categoryTile}
              activeOpacity={0.8}
              onPress={() => router.push("/discover" as any)}
            >
              <View style={s.categoryIconGlow}>
                <Heart size={26} color={colors.gold} />
              </View>
              <Text style={s.categoryLabel}>Upptäck</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.categoryTile}
              activeOpacity={0.8}
              onPress={() => router.push("/category/lunch" as any)}
            >
              <View style={s.categoryIconGlow}>
                <Utensils size={26} color={colors.gold} />
              </View>
              <Text style={s.categoryLabel}>Äta idag</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.categoryTile}
              activeOpacity={0.8}
              onPress={() => router.push("/category/boende" as any)}
            >
              <View style={s.categoryIconGlow}>
                <BedDouble size={26} color={colors.gold} />
              </View>
              <Text style={s.categoryLabel}>Sova inatt</Text>
            </TouchableOpacity>
          </View>

          {/* ── Upcoming event ── */}
          {upcomingEvent && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Vad händer på Österlen?</Text>
              <Text style={s.sectionSub}>Missa aldrig något som kan bli ett minne för livet</Text>
              <UpcomingEventCard event={upcomingEvent} />
            </View>
          )}

          {/* ── Nearby horizontal scroll ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View>
                <Text style={s.sectionTitle2}>I närheten</Text>
                <Text style={s.sectionSub2}>Utforska platser nära dig</Text>
              </View>
              <TouchableOpacity style={s.seeAllButton} onPress={() => router.push("/(tabs)/explore" as any)}>
                <Text style={s.seeAllText}>Se alla</Text>
                <ChevronRight size={14} color={colors.gold} />
              </TouchableOpacity>
            </View>
            {placesLoading ? (
              <ActivityIndicator color={colors.gold} style={{ marginTop: 8 }} />
            ) : (
              <FlatList
                data={nearbyPlaces}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={s.nearbyList}
                renderItem={({ item }) => <NearbyCard place={item} />}
              />
            )}
          </View>

          {/* ── Explore feed or empty CTA ── */}
          <View style={[s.section, s.lastSection]}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle2}>Utforska</Text>
              <TouchableOpacity style={s.seeAllButton} onPress={() => router.push("/(tabs)/explore" as any)}>
                <Text style={s.seeAllText}>Se alla</Text>
                <ChevronRight size={14} color={colors.gold} />
              </TouchableOpacity>
            </View>

            {favorites.length === 0 ? (
              // Empty CTA
              <View style={s.emptyFeed}>
                <Sparkles size={40} color={colors.gold} />
                <Text style={s.emptyFeedTitle}>Gör appen personlig!</Text>
                <Text style={s.emptyFeedSub}>
                  Svajpa fram dina favoriter för att få ett flöde anpassat efter dig.
                </Text>
                <TouchableOpacity
                  style={s.discoverBtn}
                  onPress={() => router.push("/discover" as any)}
                  activeOpacity={0.85}
                >
                  <Heart size={16} color="#1a1200" />
                  <Text style={s.discoverBtnText}>Upptäck platser</Text>
                </TouchableOpacity>
              </View>
            ) : placesLoading ? (
              <ActivityIndicator color={colors.gold} style={{ marginTop: 20 }} />
            ) : (
              feedPlaces.map((place) => {
                const storyData = storyGroups.find(
                  (g) => g.placeId === place.id && g.storyType !== "premium"
                );
                const storyIdx = storyData ? storyGroups.indexOf(storyData) : -1;
                const premiumData = storyGroups.find(
                  (g) => g.placeId === place.id && g.storyType === "premium"
                );
                const premiumIdx = premiumData ? storyGroups.indexOf(premiumData) : -1;

                return (
                  <FeedPost
                    key={place.id}
                    place={place}
                    hasStory={storyIdx !== -1}
                    storyType={storyData?.storyType}
                    onStoryClick={storyIdx !== -1 ? () => handleStoryPress(storyIdx) : undefined}
                    hasPremiumStory={premiumIdx !== -1}
                    hasOsterlenPass={hasPremiumAccess}
                    onPremiumStoryClick={
                      premiumIdx !== -1
                        ? () => {
                            if (hasPremiumAccess) handleStoryPress(premiumIdx);
                            else setPremiumModalOpen(true);
                          }
                        : undefined
                    }
                  />
                );
              })
            )}
          </View>
        </View>
      </Animated.ScrollView>

      {/* Story viewer */}
      <Modal
        visible={storyGroupIndex !== null}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setStoryGroupIndex(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {storyGroupIndex !== null && (
            <StoryViewer
              groups={storyGroups}
              initialGroupIndex={storyGroupIndex}
              hasPremiumAccess={hasPremiumAccess}
              onClose={() => setStoryGroupIndex(null)}
              onPremiumBlocked={() => {
                setStoryGroupIndex(null);
                setPremiumModalOpen(true);
              }}
            />
          )}
        </View>
      </Modal>

      {/* Premium modal */}
      {premiumModalOpen && (
        <PremiumModal
          onClose={() => setPremiumModalOpen(false)}
          onUpgrade={() => setPremiumModalOpen(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const NEARBY_CARD_WIDTH = 160;
const NEARBY_CARD_HEIGHT = 192;
const UPCOMING_ASPECT = (SCREEN_WIDTH - 40) * (3 / 4);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Hero
  hero: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: HERO_HEIGHT,
    overflow: "hidden",
    zIndex: 0,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  heroHeader: {
    position: "absolute",
    left: 20, right: 20, top: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    zIndex: 2,
  },
  heroWelcome: {
    fontSize: 10, fontWeight: "600", color: "rgba(245,240,232,0.7)",
    letterSpacing: 2, marginBottom: 2,
  },
  heroTitle: {
    fontSize: 30, fontWeight: "800", color: "#F5F0E8",
  },
  heroName: {
    fontSize: 16, color: "rgba(245,240,232,0.8)", marginTop: 2,
  },
  avatarBtn: {
    position: "relative",
    width: 50, height: 50,
  },
  avatarFallback: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: colors.card,
    borderWidth: 2.5, borderColor: colors.gold,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { fontSize: 16, fontWeight: "700", color: colors.foreground },
  levelBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.background,
  },
  levelText: { fontSize: 10, fontWeight: "800", color: "#1a1200" },

  // Scroll
  scrollView: { flex: 1, zIndex: 1 },

  // Content card slides over hero
  contentCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 600,
    paddingTop: 8,
  },

  // Sections
  section: { marginBottom: 20 },
  lastSection: { marginBottom: 0 },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingHorizontal: 20, marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18, fontWeight: "700", color: colors.foreground,
    paddingHorizontal: 20, marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13, color: colors.foregroundMuted,
    paddingHorizontal: 20, marginBottom: 12,
  },
  sectionTitle2: {
    fontSize: 18, fontWeight: "700", color: colors.foreground,
  },
  sectionSub2: {
    fontSize: 12, color: colors.foregroundMuted, marginTop: 1,
  },
  seeAllButton: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, color: colors.gold, fontWeight: "600" },

  // Stories
  storiesLabel: {
    fontSize: 11, fontWeight: "700", color: colors.foregroundSubtle,
    letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 10, marginTop: 16,
  },
  storiesContainer: { paddingHorizontal: 16, gap: 14, paddingVertical: 4 },
  storyCircleWrapper: { alignItems: "center", width: 78, position: "relative" },
  storyRing: {
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 2.5, padding: 2, overflow: "hidden",
  },
  storyImage: {
    width: "100%", height: "100%", borderRadius: 100,
    backgroundColor: colors.surface,
  },
  crownBadge: {
    position: "absolute", bottom: 18, left: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.background,
  },
  storyName: {
    fontSize: 10, color: colors.foregroundMuted,
    marginTop: 5, textAlign: "center", width: "100%",
  },
  storyNameSeen: { color: colors.foregroundSubtle },

  // Category tiles
  categoryRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 20, marginBottom: 24,
  },
  categoryTile: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 18,
  },
  categoryIconGlow: {
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.gold, shadowOpacity: 0.8, shadowRadius: 10,
    elevation: 6,
  },
  categoryLabel: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  // Upcoming event
  upcomingCard: {
    marginHorizontal: 20,
    height: UPCOMING_ASPECT,
    borderRadius: 20, overflow: "hidden",
    backgroundColor: colors.card,
  },
  upcomingGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  upcomingBadge: {
    position: "absolute", top: 12, right: 12,
    backgroundColor: "rgba(26,26,26,0.9)",
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  upcomingBadgeMonth: {
    fontSize: 9, fontWeight: "800", color: colors.gold,
    letterSpacing: 1.5, lineHeight: 12,
  },
  upcomingBadgeDay: {
    fontSize: 24, fontWeight: "800", color: "#F5F0E8",
    lineHeight: 28, marginTop: 1,
  },
  upcomingContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 20,
  },
  upcomingTitle: {
    fontSize: 20, fontWeight: "800", color: "#fff",
    lineHeight: 26,
  },

  // Nearby
  nearbyList: { paddingHorizontal: 20, gap: 12 },
  nearbyCard: {
    width: NEARBY_CARD_WIDTH, height: NEARBY_CARD_HEIGHT,
    borderRadius: 20, overflow: "hidden",
    backgroundColor: colors.card,
  },
  nearbyImage: { ...StyleSheet.absoluteFillObject },
  nearbyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  nearbyContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 10,
  },
  nearbyName: {
    fontSize: 13, fontWeight: "600", color: "#fff", lineHeight: 17,
  },
  nearbyLocation: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  nearbyLocationText: { fontSize: 10, color: "rgba(255,255,255,0.6)" },

  // Feed post
  feedPost: {
    paddingHorizontal: 20, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    marginBottom: 20,
  },
  feedHeader: {
    flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12,
  },
  feedAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, overflow: "hidden",
  },
  feedAvatarImg: {
    width: "100%", height: "100%",
    backgroundColor: colors.surface,
  },
  feedPlaceName: { fontSize: 14, fontWeight: "700", color: colors.foreground },
  feedMeta: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  feedCategory: { fontSize: 11, color: colors.foregroundSubtle },
  feedImageContainer: {
    aspectRatio: 4 / 5, borderRadius: 14, overflow: "hidden",
    backgroundColor: colors.surface, marginBottom: 10,
  },
  feedImage: { width: "100%", height: "100%" },
  feedCrownBtn: {
    position: "absolute", bottom: 12, left: 12,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
  },
  feedActions: { flexDirection: "row", gap: 16, marginBottom: 8 },
  feedActionBtn: { padding: 2 },
  feedDesc: { fontSize: 13, color: colors.foregroundMuted, lineHeight: 19 },

  // Empty feed CTA
  emptyFeed: {
    alignItems: "center", paddingHorizontal: 20, paddingVertical: 32, gap: 12,
  },
  emptyFeedTitle: { fontSize: 19, fontWeight: "800", color: colors.foreground, textAlign: "center" },
  emptyFeedSub: {
    fontSize: 14, color: colors.foregroundMuted, textAlign: "center", lineHeight: 20, maxWidth: 280,
  },
  discoverBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.gold,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24,
    marginTop: 4,
  },
  discoverBtnText: { fontSize: 15, fontWeight: "700", color: "#1a1200" },

  // Premium modal
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  premiumModal: {
    backgroundColor: colors.card, borderRadius: 28,
    padding: 28, width: "100%", maxWidth: 360, alignItems: "center",
    borderWidth: 1, borderColor: "rgba(201,168,76,0.2)",
  },
  premiumCrown: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
    shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  premiumTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground, marginBottom: 8 },
  premiumSub: {
    fontSize: 14, color: colors.foregroundMuted, textAlign: "center", lineHeight: 20, marginBottom: 24,
  },
  premiumBtn: {
    backgroundColor: colors.gold, borderRadius: 16,
    paddingVertical: 14, width: "100%", alignItems: "center", marginBottom: 12,
  },
  premiumBtnText: { fontSize: 15, fontWeight: "700", color: "#1a1200" },
  premiumSkip: { paddingVertical: 8 },
  premiumSkipText: { fontSize: 14, color: colors.foregroundSubtle },
});
