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
  Share,
  Animated,
} from "react-native";
import { registerScroll } from "@/lib/scrollRefs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import heroOsterlen from "../../assets/hero-osterlen.jpg";
import { useRouter } from "expo-router";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  MapPin,
  Search,
  ChevronRight,
  Heart,
  Sparkles,
  Share2,
  Utensils,
  BedDouble,
} from "lucide-react-native";
import Svg, {
  Circle as SvgCircle,
  Defs,
  LinearGradient as SvgGradient,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { usePlaces, isPlaceOpen, getTierScore, type Place } from "@/hooks/usePlaces";
import { useEvents, type Event } from "@/hooks/useEvents";
import { useProfile } from "@/hooks/useProfile";
import { useFavorites, useToggleFavorite, useIsFavorite } from "@/hooks/useFavorites";
import { useBusinessStories } from "@/hooks/useBusinessStories";
import { useStoryViews } from "@/hooks/useStoryViews";
import { StoryViewer, type StoryGroupData, type StoryType } from "@/components/StoryViewer";
import { EventBottomSheet } from "./calendar";
import { useNews, type NewsItem } from "@/hooks/useNews";
import { colors } from "@/lib/colors";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import * as Location from "expo-location";
import { sv } from "date-fns/locale";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${Math.round(km)}km`;
}

const HERO_HEIGHT = 208;
const HERO_IMAGE = heroOsterlen;

// Tidsberoende hälsning
function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "God morgon";
  if (h >= 12 && h < 15) return "God dag";
  if (h >= 15 && h < 18) return "God eftermiddag";
  return "God kväll";
}


// Ring colors för FeedPost-avatarer
const RING_GOLD  = "#C9A84C";   // favorit
const RING_GREEN = "#52886A";   // ny story
const RING_SEEN  = "rgba(255,255,255,0.18)";

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


// ─── StoryCircle – metallisk SVG-ring ───────────────────────────────────────

const SC_INNER    = 64;
const SC_GAP      = 2;
const SC_STROKE   = 3.2;   // gradient-ringens strokebredd
const SEG_STROKE  = 3.5;   // animerings-bågens strokebredd – smal och elegant
const SC_RADIUS   = SC_INNER / 2 + SC_GAP + SC_STROKE / 2;  // 35.6
// SC_OUTER rymmer ringen + bågarna (SEG_STROKE/2 utanför radien)
const SC_OUTER    = Math.ceil(2 * (SC_RADIUS + SEG_STROKE / 2) + 2);  // ≈ 78
const SC_CENTER   = SC_OUTER / 2;

// ─── Animering: crescendo-bågar (liten ring → längre båge → hela varvet) ────
const N_SEGS   = 12;    // antal bågsekvenser
const ANIM_MS  = 340;   // total tid – snabbt men inte ryckigt
const SEG_GAP  = -1;    // negativ = varje segment täcker 1 px av föregående → inga skarvar
const SC_CIRC  = 2 * Math.PI * SC_RADIUS;  // ≈ 224 px

// Bågarna varierar i längd: kortast (4 px, ser ut som en ring/punkt) →
// längst (~33 px, tydlig båge). Tillsammans täcker de exakt ett varv.
const SEG_A    = 4;   // kortaste bågstrecket (px)
const SEG_TOTAL = SC_CIRC - N_SEGS * SEG_GAP;
const SEG_B    = (SEG_TOTAL - N_SEGS * SEG_A) / (N_SEGS * (N_SEGS - 1) / 2);

type SegInfo = { dash: number; start: number; color: string };
const SEGMENTS: SegInfo[] = (() => {
  const out: SegInfo[] = [];
  let cum = 0;
  for (let i = 0; i < N_SEGS; i++) {
    const dash = SEG_A + SEG_B * i;
    const t    = i / (N_SEGS - 1);
    // Gult → orange längs banan
    out.push({ dash, start: cum, color: `rgb(255,${Math.round(243 - 121 * t)},${Math.round(71 * t)})` });
    cum += dash + SEG_GAP;
  }
  return out;
})();

// OSEDD – gult kickar igång men orange dominerar och poppar
const GRAD_ACTIVE = {
  stops: [
    { offset: "0%",   color: "#FFF200" },   // starkt citrongult
    { offset: "35%",  color: "#FFB000" },   // guldorange – mjuk övergång
    { offset: "75%",  color: "#FF5000" },   // het orange som poppar
    { offset: "100%", color: "#FF8000" },   // levande orange avslutar
  ],
  x1: "0", y1: "1", x2: "1", y2: "0",
};

// SEDD – diskret mörkgrå
const GRAD_SEEN = {
  stops: [
    { offset: "0%",   color: "#484848" },
    { offset: "100%", color: "#303030" },
  ],
  x1: "0", y1: "1", x2: "1", y2: "0",
};

function StoryCircle({
  group,
  isSeen,
  onPress,
  index,
}: {
  group: StoryGroupData;
  isSeen: boolean;
  onPress: () => void;
  index: number;
}) {
  const imageUrl  = group.logoUrl ?? group.stories[0]?.image_url ?? null;
  const label     = group.placeName.split(/[-–—,]/)[0].trim();
  const gradConf  = isSeen ? GRAD_SEEN : GRAD_ACTIVE;
  const gradId    = `sg-${group.placeId}`;

  // -1 = vilande, 0..N_SEGS = antal synliga bågssegment
  const [dots, setDots] = useState(-1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const handleTap = useCallback(() => {
    if (dots >= 0) return;           // redan igång
    setDots(0);
    let n = 0;
    timer.current = setInterval(() => {
      n++;
      if (n >= N_SEGS) {
        clearInterval(timer.current!);
        timer.current = null;
        setDots(N_SEGS);
        onPress(); // öppna storyn direkt utan fördröjning
        setTimeout(() => setDots(-1), 400); // återställ state när storyn är öppen och ringen ej syns
      } else {
        setDots(n);
      }
    }, ANIM_MS / N_SEGS);
  }, [dots, onPress]);

  const isAnimating = dots >= 0;

  return (
    <TouchableOpacity style={s.storyCircleWrapper} activeOpacity={0.9} onPress={handleTap}>
      <View style={{ width: SC_OUTER, height: SC_OUTER, alignItems: "center", justifyContent: "center" }}>

        {/* SVG: gradient-ring normalt, prickar under TikTok-animering */}
        <Svg width={SC_OUTER} height={SC_OUTER} style={StyleSheet.absoluteFill}>
          {isAnimating ? (
            // Crescendo-bågar: segment 0 = liten "ring", segment 11 = lång båge.
            // Varje segment ritas som en strokeDasharray-båge längs SC_RADIUS-cirkeln.
            // strokeDashoffset = SC_CIRC - seg.start → placerar bågen rätt medsols.
            SEGMENTS.map((seg, i) => {
              if (i >= dots) return null;
              // Första och sista segmentet har rundade ändpunkter för ett fint avslut.
              // Mellansegmenten använder butt + 1px överlapp – inga synliga skarvar.
              const linecap = (i === 0 || i === N_SEGS - 1) ? "round" : "butt";
              return (
                <SvgCircle
                  key={i}
                  cx={SC_CENTER} cy={SC_CENTER} r={SC_RADIUS}
                  stroke={seg.color}
                  strokeWidth={SEG_STROKE}
                  fill="none"
                  strokeDasharray={`${seg.dash} ${SC_CIRC - seg.dash}`}
                  strokeDashoffset={SC_CIRC - seg.start}
                  strokeLinecap={linecap}
                  transform={`rotate(-90, ${SC_CENTER}, ${SC_CENTER})`}
                />
              );
            })
          ) : (
            // Normal gradient-ring
            <>
              <Defs>
                <SvgGradient id={gradId}
                  x1={gradConf.x1} y1={gradConf.y1}
                  x2={gradConf.x2} y2={gradConf.y2}
                >
                  {gradConf.stops.map((stop) => (
                    <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity="1" />
                  ))}
                </SvgGradient>
              </Defs>
              <SvgCircle
                cx={SC_CENTER} cy={SC_CENTER} r={SC_RADIUS}
                stroke={`url(#${gradId})`}
                strokeWidth={SC_STROKE}
                fill="none"
              />
            </>
          )}
        </Svg>

        {/* Bild */}
        <View style={{
          width: SC_INNER, height: SC_INNER,
          borderRadius: SC_INNER / 2,
          overflow: "hidden",
          backgroundColor: colors.surface,
        }}>
          {imageUrl && (
            <Image source={{ uri: imageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          )}
        </View>

      </View>

      <Text style={[s.storyName, isSeen && s.storyNameSeen]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── NearbyCard ──────────────────────────────────────────────────────────────

function NearbyCard({ place, userLat, userLng }: { place: Place; userLat: number | null; userLng: number | null }) {
  const router = useRouter();
  const imageUrl = place.image_url?.split(",")[0].trim() ?? "";
  const category = place.categories?.split(",")[0]?.trim() ?? "";
  const distance =
    userLat !== null && userLng !== null && place.lat && place.lng
      ? getDistanceKm(userLat, userLng, place.lat, place.lng)
      : null;

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
        {category ? (
          <Text style={s.nearbyCategory} numberOfLines={1}>{category.toUpperCase()}</Text>
        ) : null}
        <Text style={s.nearbyName} numberOfLines={2}>{place.name}</Text>
        {distance !== null && (
          <Text style={s.nearbyDist}>{formatDist(distance)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── UpcomingEventCard ────────────────────────────────────────────────────────

function UpcomingEventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const badge = event.date ? formatDateBadge(event.date, event.end_date) : null;
  const imageUrl = event.image_url ?? "";

  return (
    <TouchableOpacity
      style={s.upcomingCard}
      activeOpacity={0.88}
      onPress={onPress}
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
}: {
  place: Place;
  hasStory?: boolean;
  storyType?: StoryType;
  onStoryClick?: () => void;
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
    hasStory && storyType === "favorite" ? RING_GOLD
    : hasStory ? RING_GREEN
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

// ─── NewsCard ─────────────────────────────────────────────────────────────────

// Gradient-färger identiska med story-ringen
const NEWS_GRAD = [
  { offset: "0%",   color: "#FFF200" },
  { offset: "35%",  color: "#FFB000" },
  { offset: "75%",  color: "#FF5000" },
  { offset: "100%", color: "#FF8000" },
] as const;

function NewsCard({ item }: { item: NewsItem }) {
  const router = useRouter();
  const publishedDate = item.published_at ?? item.created_at;
  const dateStr = publishedDate
    ? format(new Date(publishedDate), "d MMM HH:mm", { locale: sv })
    : null;

  return (
    // Yttre wrapper: gradient-fill syns som 1.5 px border
    <TouchableOpacity
      style={s.newsCardOuter}
      activeOpacity={0.85}
      onPress={() => router.push(`/news/${item.id}` as any)}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id="ng" x1="0" y1="1" x2="1" y2="0">
            {NEWS_GRAD.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ng)" rx={16} ry={16} />
      </Svg>
      {/* Inre kort med appens bakgrundsfärg */}
      <View style={s.newsCard}>
      <View style={s.newsCardInner}>
        {/* Vänster: text */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={s.newsMeta}>
            <View style={s.newsBadgePill}>
              <Text style={s.newsBadgeText}>Österlenappen</Text>
            </View>
            {dateStr && <Text style={s.newsDate}>{dateStr}</Text>}
          </View>
          <Text style={s.newsTitle} numberOfLines={2}>{item.title}</Text>
          {item.ingress ? (
            <Text style={s.newsIngress} numberOfLines={2}>{item.ingress}</Text>
          ) : null}
        </View>
        {/* Höger: omslagsbild */}
        {item.cover_image_url ? (
          <Image source={{ uri: item.cover_image_url }} style={s.newsThumbnail} resizeMode="cover" />
        ) : null}
      </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [storyGroupIndex, setStoryGroupIndex] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { registerScroll("home", scrollRef); }, []);


  const { data: profile } = useProfile();
  const { data: places = [], isLoading: placesLoading } = usePlaces();
  const { data: events = [], isLoading: eventsLoading } = useEvents();
  const { data: businessStories = [] } = useBusinessStories();
  const { data: newsItems = [] } = useNews(5);
  const { data: favorites = [] } = useFavorites();
  const { data: storyViews = [] } = useStoryViews();

  const firstName = profile?.display_name?.split(" ")[0] ?? null;
  const viewedIds = useMemo(() => new Set(storyViews.map((v) => v.story_id)), [storyViews]);

  // Story groups – använder place-data inbakad i storyn (JOIN), ej separat usePlaces
  const storyGroups = useMemo((): StoryGroupData[] => {
    const now = new Date().toISOString();
    // Filtrera bort utgångna och stories utan place-data
    const activeStories = businessStories.filter(
      (bs) => bs.place && (!bs.expires_at || bs.expires_at >= now)
    );

    // Gruppera per place
    const byPlace = new Map<number, typeof activeStories>();
    for (const bs of activeStories) {
      if (!byPlace.has(bs.place_id)) byPlace.set(bs.place_id, []);
      byPlace.get(bs.place_id)!.push(bs);
    }

    const result: StoryGroupData[] = [];
    for (const [placeId, stories] of byPlace) {
      const placeData = stories[0]?.place;
      if (!placeData) continue;

      const isFav = favorites.some((f) => f.place_id === placeId);
      stories.sort((a, b) => b.created_at.localeCompare(a.created_at));

      result.push({
        placeId,
        placeName: placeData.name,
        placeCategory: placeData.categories ?? null,
        placeLocation: placeData.nearest_town ?? null,
        logoUrl: placeData.logo_url ?? null,
        storyType: isFav ? "favorite" : "regular",
        stories,
      });
    }

    // Favoriter först, sedan osedda, sedda sist
    return result.sort((a, b) => {
      const aIsSeen = a.stories.every((s) => viewedIds.has(s.id));
      const bIsSeen = b.stories.every((s) => viewedIds.has(s.id));
      if (aIsSeen !== bIsSeen) return aIsSeen ? 1 : -1;
      if (a.storyType === "favorite" && b.storyType !== "favorite") return -1;
      if (b.storyType === "favorite" && a.storyType !== "favorite") return 1;
      return 0;
    });
  }, [businessStories, favorites, viewedIds]);

  const handleStoryPress = useCallback((index: number) => {
    setStoryGroupIndex(index);
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLat(loc.coords.latitude);
      setUserLng(loc.coords.longitude);
    })();
  }, []);

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

  return (
    <View style={s.container}>
      {/* Scrollable — hero och content scrollar tillsammans */}
      <ScrollView
        ref={scrollRef}
        style={s.scrollView}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
      {/* Hero scrollar med innehållet */}
      <View style={s.hero}>
        <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={s.heroOverlay} />
        {/* Hero header */}
        <View style={[s.heroHeader, { paddingTop: insets.top + 12 }]}>
          <View>
            <Text style={s.heroWelcome}>VÄLKOMMEN TILL</Text>
            <Text style={s.heroTitle}>Österlen</Text>
            <Text style={s.heroName}>
              {getGreeting()}{firstName ? `, ${firstName}` : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={s.avatarBtn}
            onPress={() => router.push("/(tabs)/profile" as any)}
            activeOpacity={0.85}
          >
            <View style={s.avatarFallback}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <Text style={s.avatarInitials}>
                  {(profile?.display_name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={s.levelBadge}>
              <Text style={s.levelText}>1</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

        {/* Content */}
        <View style={s.contentCard}>
          {/* ── Stories ── */}
          {storyGroups.length > 0 && (
            <View style={[s.section, { marginTop: 8, marginBottom: 40 }]}>
              <Text style={s.storiesLabel}>JUST NU</Text>
              <FlatList
                data={storyGroups}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(g) => `${g.placeId}-${g.storyType}`}
                contentContainerStyle={s.storiesContainer}
                renderItem={({ item, index }) => {
                  const isSeen = item.stories.every((s) => viewedIds.has(s.id));
                  return (
                    <StoryCircle
                      key={`${item.placeId}-${item.storyType}`}
                      group={item}
                      isSeen={isSeen}
                      index={index}
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
              <Text style={s.categoryLabel}>Äta</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.categoryTile}
              activeOpacity={0.8}
              onPress={() => router.push("/category/boende" as any)}
            >
              <View style={s.categoryIconGlow}>
                <BedDouble size={26} color={colors.gold} />
              </View>
              <Text style={s.categoryLabel}>Sova</Text>
            </TouchableOpacity>
          </View>

          {/* ── Upcoming event ── */}
          {upcomingEvent && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Vad händer på Österlen?</Text>
              <Text style={s.sectionSub}>Nästa stora evenemang nära dig</Text>
              <UpcomingEventCard event={upcomingEvent} onPress={() => setSelectedEventId(upcomingEvent.id)} />
            </View>
          )}

          {/* ── Nearby horizontal scroll ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View>
                <Text style={s.sectionTitle2}>Relevant för dig</Text>
                <Text style={s.sectionSub2}>Utvalda platser nära dig</Text>
              </View>
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
                renderItem={({ item }) => <NearbyCard place={item} userLat={userLat} userLng={userLng} />}
              />
            )}
          </View>

          {/* ── Nyheter ── */}
          {newsItems.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle2, { paddingHorizontal: 20, marginBottom: 16 }]}>Nyheter på Österlen</Text>
              {newsItems.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </View>
          )}

          {/* ── Explore feed or empty CTA ── */}
          <View style={[s.section, s.lastSection]}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle2}>Utforska</Text>
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
                const storyData = storyGroups.find((g) => g.placeId === place.id);
                const storyIdx  = storyData ? storyGroups.indexOf(storyData) : -1;

                return (
                  <FeedPost
                    key={place.id}
                    place={place}
                    hasStory={storyIdx !== -1}
                    storyType={storyData?.storyType}
                    onStoryClick={storyIdx !== -1 ? () => handleStoryPress(storyIdx) : undefined}
                  />
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {/* Event bottom sheet */}
      <EventBottomSheet
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
      />

      {/* Story viewer */}
      <Modal
        visible={storyGroupIndex !== null}
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setStoryGroupIndex(null)}
      >
        {storyGroupIndex !== null && (
          <StoryViewer
            groups={storyGroups}
            initialGroupIndex={storyGroupIndex}
            onClose={() => setStoryGroupIndex(null)}
          />
        )}
      </Modal>

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
    height: HERO_HEIGHT,
    overflow: "hidden",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
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
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "rgba(245,240,232,0.65)",
    letterSpacing: 2,
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 32,
    color: "#F5F0E8",
  },
  heroName: {
    fontFamily: "PlayfairDisplay_400Regular",
    fontSize: 17,
    color: "rgba(245,240,232,0.82)",
    marginTop: 4,
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
    overflow: "hidden",
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
    marginTop: -24,
    minHeight: 600,
    paddingTop: 16,
  },

  // Sections
  section: { marginBottom: 28 },
  lastSection: { marginBottom: 0 },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingHorizontal: 20, marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: colors.foreground,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  sectionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.foregroundMuted,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle2: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: colors.foreground,
  },
  sectionSub2: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: colors.foregroundMuted,
    marginTop: 2,
  },
  seeAllButton: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, color: colors.gold, fontWeight: "600" },

  // Stories
  storiesLabel: {
    fontSize: 12, fontWeight: "600", color: colors.foregroundMuted,
    letterSpacing: 1.6, paddingHorizontal: 20, marginBottom: 18, marginTop: 16,
  },
  storiesContainer: { paddingHorizontal: 16, gap: 14, paddingVertical: 4, paddingTop: 0 },
  storyCircleWrapper: { alignItems: "center", width: 88, position: "relative" },
  storyName: {
    fontSize: 10, color: colors.foregroundMuted,
    marginTop: 6, textAlign: "center", width: "100%",
  },
  storyNameSeen: { color: colors.foregroundSubtle },

  // Category tiles
  categoryRow: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 20, marginBottom: 40,
  },
  categoryTile: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
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
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24, color: "#F5F0E8",
    lineHeight: 28, marginTop: 1,
  },
  upcomingContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 20,
  },
  upcomingTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20, color: "#fff",
    lineHeight: 26,
  },

  // Nearby
  nearbyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  upcomingGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  nearbyList: { paddingHorizontal: 20, gap: 12 },
  nearbyCard: {
    width: NEARBY_CARD_WIDTH, height: NEARBY_CARD_HEIGHT,
    borderRadius: 20, overflow: "hidden",
    backgroundColor: colors.card,
  },
  nearbyImage: { ...StyleSheet.absoluteFillObject },
  nearbyContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 10,
  },
  nearbyCategory: {
    fontSize: 9, fontWeight: "700", color: colors.gold,
    letterSpacing: 1.2, marginBottom: 3,
  },
  nearbyName: {
    fontSize: 13, fontWeight: "700",
    fontFamily: "PlayfairDisplay_700Bold",
    color: "#fff", lineHeight: 17,
  },
  nearbyDist: {
    fontSize: 11, fontWeight: "700", color: colors.gold,
    marginTop: 4,
  },

  // Feed post
  feedPost: {
    marginLeft: 5, marginRight: 5, paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)",
    marginBottom: 20,
  },
  feedHeader: {
    flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12,
  },
  feedAvatar: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, overflow: "hidden",
  },
  feedAvatarImg: {
    width: "100%", height: "100%",
    borderRadius: 20,
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
  feedActions: { flexDirection: "row", gap: 16, marginBottom: 8 },
  feedActionBtn: { padding: 2 },
  feedDesc: { fontSize: 13, color: colors.foregroundMuted, lineHeight: 19 },

  // News
  newsCardOuter: {
    marginHorizontal: 20, marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
  },
  newsCard: {
    backgroundColor: colors.card,
    borderRadius: 15.2,       // outer är 16, margin 0.8 → inner ≈ 15.2
    margin: 0.8,              // tunn gradient-border
    overflow: "hidden",
  },
  newsCardInner: {
    flexDirection: "row", gap: 12,
    padding: 14,
  },
  newsMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  newsBadgePill: {
    alignSelf: "flex-start",
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newsBadgeText: {
    fontSize: 9, fontWeight: "600", color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.5,
  },
  newsDate: { fontSize: 11, color: colors.foregroundMuted },
  newsTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 15, color: colors.foreground, lineHeight: 20,
  },
  newsIngress: { fontSize: 12, color: colors.foregroundMuted, lineHeight: 17, marginTop: 2 },
  newsThumbnail: {
    width: 80, height: 80, borderRadius: 10, flexShrink: 0,
  },

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

});
