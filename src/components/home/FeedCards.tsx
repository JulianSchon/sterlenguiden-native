/**
 * Korten i flödet på Hem. Samma regler som resten av appen: stor bild med rundade hörn och all
 * text UNDER bilden (inget ovanpå, utom evenemangens datumruta), hjärtat till höger. Varje kort har
 * en liten rad överst som säger varför det visas ("I dag", "Eftersom du gillar Café & Bageri", "Nytt
 * erbjudande" …), med en ikon som betyder något — eller platsens kategorifärg som prick, som på
 * kartan. Inga dekorativa symboler.
 *
 * Alla kort är memo: de ritas bara om när det egna kortet ändras (ett hjärta), inte när flödet gör det.
 */
import { memo, useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { CalendarDays, Check, ChevronRight, CloudOff, Crown, Heart, Newspaper, Users, type LucideIcon } from "lucide-react-native";
import { firstImageUrl, type Place } from "@/hooks/usePlaces";
import type { Event } from "@/hooks/useEvents";
import type { NewsItem } from "@/hooks/useNews";
import type { FriendVisit } from "@/hooks/useFriendVisits";
import type { Collectible } from "@/hooks/useCollectibles";
import { useTheme } from "@/theme/ThemeProvider";
import { findCategory } from "@/theme/categories";
import { dayKey, eventWhen, liveReason, type EventPick } from "@/lib/events";
import { distanceLabel } from "@/lib/mapFilters";
import { openInfo } from "@/lib/search";
import type { Offer } from "@/lib/offers";
import type { NearbyPlace } from "@/lib/homeFeed";
import { formatDate } from "@/i18n/dates";
import { DateBox } from "@/components/events/EventCards";
import { HeartButton, type BurstFn } from "@/components/LikeHeart";
import { Avatar } from "@/components/profile/Avatar";
import { CATEGORY_DOT, CategoryLine, useOpenColors } from "@/components/search/SearchParts";
import { OfferTicket } from "@/components/offers/OfferTicket";
import type { OriginRect, TearEdge } from "@/components/offers/OfferDrawer";
import { NearbyRail } from "@/components/place/PlaceNearby";
import { TreasureHint } from "@/components/place/PlaceSocial";
import { Skeleton } from "@/components/Skeleton";
import { DiscoverCard, ShortcutRow } from "./HomeShortcuts";

export const FEED_GUTTER = 16;
/** "I dag" och "Pågår nu": samma orange som på Kalender */
const LIVE = "#FF8000";
const LIVE_LIGHT = "#C2410C";

// ── Raden överst på varje kort ───────────────────────────────────────────────

function Eyebrow({ Icon, live, dot, text, color, filled }: {
  Icon?: LucideIcon; live?: boolean;
  /** En prick i den här färgen i stället för en ikon (platsens kategori, skatternas lila) */
  dot?: string;
  text: string; color: string; filled?: boolean;
}) {
  return (
    <View style={s.eyebrow}>
      {live ? <LiveDot color={color} />
        : dot ? <View style={[s.dot, { backgroundColor: dot }]} />
          : Icon ? <Icon size={14} color={color} fill={filled ? color : "transparent"} strokeWidth={2.3} /> : null}
      <Text style={[s.eyebrowText, { color }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** Lugnt pulserande prick för det som händer i dag */
function LiveDot({ color }: { color: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 1.6 }] }));
  return (
    <View style={s.liveWrap}>
      <Reanimated.View style={[s.liveDot, { backgroundColor: color, position: "absolute" }, halo]} />
      <View style={[s.liveDot, { backgroundColor: color }]} />
    </View>
  );
}

const useLiveColor = () => (useTheme().scheme === "dark" ? LIVE : LIVE_LIGHT);

// ── Evenemang ────────────────────────────────────────────────────────────────

export const FeedEventCard = memo(function FeedEventCard({ pick, hero, saved, onOpen, onToggleSave, onBurst }: {
  pick: EventPick;
  /** Det första kortet: det som händer i dag */
  hero: boolean;
  saved: boolean;
  onOpen: (event: Event) => void;
  onToggleSave: (id: number) => void;
  onBurst: BurstFn;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const liveColor = useLiveColor();
  const e = pick.event;
  const today = dayKey(new Date());
  // Skälet följer hjärtat direkt ("Du har sparat det" ↔ nästa bästa skäl)
  const reason = liveReason(pick, saved);
  const live = hero || reason.kind === "today" || reason.kind === "ongoing";
  const liveText = t(e.date && e.date < today ? "home.live.ongoing" : "home.live.today");
  const personal = reason.kind === "saved" || reason.kind === "favoritePlace";
  const where = e.location ?? e.place?.name ?? null;
  return (
    <View style={s.card}>
      {live
        ? <Eyebrow live text={hero ? liveText : reason.text} color={liveColor} />
        : <Eyebrow Icon={personal ? Heart : CalendarDays} filled={personal} text={reason.text} color={personal ? colors.danger : colors.goldText} />}
      <Pressable onPress={() => onOpen(e)} style={[s.image, { aspectRatio: hero ? 1.05 : 1.35, backgroundColor: colors.fill }]}>
        {e.image_url && <ExpoImage source={{ uri: e.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />}
        <DateBox event={e} style={s.dateBox} />
      </Pressable>
      <View style={s.info}>
        <Pressable style={{ flex: 1, gap: 5 }} onPress={() => onOpen(e)}>
          <Text style={[hero ? s.titleHero : s.title, { color: colors.text }]} numberOfLines={2}>{e.title}</Text>
          <Text style={[s.meta, { color: colors.muted }]} numberOfLines={1}>{[eventWhen(e), where].filter(Boolean).join("  ·  ")}</Text>
        </Pressable>
        <HeartButton isFav={saved} onToggle={() => onToggleSave(e.id)} onBurst={onBurst} list="saved" />
      </View>
    </View>
  );
});

// ── Plats ────────────────────────────────────────────────────────────────────

export const FeedPlaceCard = memo(function FeedPlaceCard({ place, reason, km, saved, onOpen, onToggleSave, onBurst }: {
  place: Place;
  reason: string;
  km: number | null;
  saved: boolean;
  onOpen: (place: Place) => void;
  onToggleSave: (id: number) => void;
  onBurst: BurstFn;
}) {
  const { colors, scheme } = useTheme();
  useTranslation(); // ritas om när språket byts (öppettiderna, kategorin)
  const openColors = useOpenColors();
  const image = firstImageUrl(place.image_url);
  const open = openInfo(place);
  const cat = findCategory(place.category)?.id;
  return (
    <View style={s.card}>
      <Eyebrow dot={cat ? CATEGORY_DOT[scheme][cat] : colors.faint} text={reason} color={colors.goldText} />
      <Pressable onPress={() => onOpen(place)} style={[s.image, { aspectRatio: 1.25, backgroundColor: colors.fill }]}>
        {image && <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />}
      </Pressable>
      <View style={s.info}>
        <Pressable style={{ flex: 1, gap: 5 }} onPress={() => onOpen(place)}>
          <Text style={[s.title, { color: colors.text }]} numberOfLines={2}>{place.name}</Text>
          <CategoryLine place={place} extra={km != null ? distanceLabel(km) : null} />
          {open && <Text style={[s.open, { color: open.open ? openColors.open : openColors.closed }]}>{open.label}</Text>}
        </Pressable>
        <HeartButton isFav={saved} onToggle={() => onToggleSave(place.id)} onBurst={onBurst} />
      </View>
    </View>
  );
});

// ── Nyhet ────────────────────────────────────────────────────────────────────

export const FeedNewsCard = memo(function FeedNewsCard({ news, onOpen }: { news: NewsItem; onOpen: (news: NewsItem) => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const published = news.published_at ?? news.created_at;
  return (
    <View style={s.card}>
      <Eyebrow Icon={Newspaper} text={`${t("home.news")}${published ? `  ·  ${formatDate(published, "d MMM")}` : ""}`} color={colors.goldText} />
      <Pressable onPress={() => onOpen(news)} style={{ gap: 12 }}>
        {news.cover_image_url && (
          <View style={[s.image, { aspectRatio: 16 / 9, backgroundColor: colors.fill }]}>
            <ExpoImage source={{ uri: news.cover_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />
          </View>
        )}
        <View style={{ gap: 6, paddingHorizontal: 2 }}>
          <Text style={[s.title, { color: colors.text }]} numberOfLines={3}>{news.title}</Text>
          {!!news.ingress && <Text style={[s.body, { color: colors.muted }]} numberOfLines={2}>{news.ingress}</Text>}
        </View>
      </Pressable>
    </View>
  );
});

// ── Vänner ───────────────────────────────────────────────────────────────────

/** "i dag", "i går", "för 3 dagar sedan", "12 okt" */
function ago(iso: string, t: TFunction): string {
  const d = new Date(iso);
  const days = Math.round((new Date(dayKey(new Date())).getTime() - new Date(dayKey(d)).getTime()) / 86_400_000);
  if (days <= 0) return t("time.today");
  if (days === 1) return t("time.yesterday");
  if (days < 7) return t("time.daysAgoOther", { count: days });
  return formatDate(d, "d MMM");
}

export const FeedFriendCard = memo(function FeedFriendCard({ visit, place, onOpenPlace, onOpenFriend }: {
  visit: FriendVisit;
  place: Place;
  onOpenPlace: (place: Place) => void;
  onOpenFriend: (userId: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const first = visit.name.trim().split(/\s+/)[0] || visit.name;
  const image = firstImageUrl(place.image_url);
  return (
    <View style={s.card}>
      <Eyebrow Icon={Users} text={t("home.friends")} color={colors.goldText} />
      <Pressable
        onPress={() => onOpenPlace(place)}
        style={[s.friend, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => onOpenFriend(visit.userId)} activeOpacity={0.8} hitSlop={6}>
          <Avatar size={46} path={visit.avatarPath} name={visit.name} color={visit.circleColor ?? "#2A2A2A"} ring={visit.avatarRing} />
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[s.friendText, { color: colors.text }]} numberOfLines={2}>
            <Trans i18nKey="home.friendWasAt" values={{ name: first, place: place.name }} components={{ b: <Text style={s.bold} /> }} />
          </Text>
          <Text style={[s.meta, { color: colors.muted }]} numberOfLines={1}>
            {[ago(visit.visitedAt, t), place.nearest_town].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <View style={[s.friendThumb, { backgroundColor: colors.fill }]}>
          {image && <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />}
        </View>
      </Pressable>
    </View>
  );
});

// ── Erbjudande ───────────────────────────────────────────────────────────────

export const FeedOfferCard = memo(function FeedOfferCard({ offer, isNew, torn, edge, scrollAt, onOpen }: {
  offer: Offer;
  isNew: boolean;
  torn: boolean;
  edge: TearEdge;
  scrollAt: SharedValue<number>;
  onOpen: (offer: Offer, origin: OriginRect | null) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={s.card}>
      <Eyebrow Icon={Crown} text={t(isNew ? "home.offerNew" : "home.offer")} color={colors.goldText} />
      <OfferTicket offer={offer} used={false} torn={torn} edge={edge} scrollAt={scrollAt} onOpen={onOpen} />
    </View>
  );
});

// ── Skatt ────────────────────────────────────────────────────────────────────

export const FeedTreasureCard = memo(function FeedTreasureCard({ collectible, meters, onOpen }: {
  collectible: Collectible; meters: number; onOpen: (collectible: Collectible) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={s.card}>
      <Eyebrow dot={colors.purple} text={t("home.treasureNear")} color={colors.purple} />
      <TreasureHint meters={meters} found={false} name={collectible.name} onPress={() => onOpen(collectible)} />
    </View>
  );
});

// ── Verktygen i flödet ───────────────────────────────────────────────────────

/** Upptäck (svepet) som ett kort i flödet */
export const FeedDiscover = memo(function FeedDiscover() {
  return (
    <View style={s.card}>
      <DiscoverCard />
    </View>
  );
});

/** Genvägarna in i Sök */
export const FeedShortcuts = memo(function FeedShortcuts() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={s.card}>
      <Text style={[s.railTitle, { color: colors.text, marginBottom: 12 }]}>{t("home.whatToDo")}</Text>
      <ShortcutRow gutter={FEED_GUTTER} />
    </View>
  );
});

// ── Raderna att svepa i sidled ───────────────────────────────────────────────

function RailHead({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={s.railHead}>
      <Text style={[s.railTitle, { color: colors.text }]}>{title}</Text>
      <TouchableOpacity onPress={onAction} hitSlop={10} style={s.railAction}>
        <Text style={[s.railActionText, { color: colors.goldText }]}>{action}</Text>
        <ChevronRight size={15} color={colors.goldText} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
}

export const OpenNowRail = memo(function OpenNowRail({ items, onOpen, onShowAll }: {
  items: NearbyPlace[]; onOpen: (place: Place) => void; onShowAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={s.card}>
      <RailHead title={t("home.openNowNear")} action={t("home.showAll")} onAction={onShowAll} />
      <NearbyRail items={items} onPress={onOpen} />
    </View>
  );
});

export const WeekendRail = memo(function WeekendRail({ events, onOpen, onShowAll }: {
  events: Event[]; onOpen: (event: Event) => void; onShowAll: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={s.card}>
      <RailHead title={t("home.weekend")} action={t("home.calendar")} onAction={onShowAll} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail} style={{ marginHorizontal: -FEED_GUTTER }}>
        {events.map((e) => (
          <TouchableOpacity key={e.id} style={s.mini} activeOpacity={0.85} onPress={() => onOpen(e)}>
            <View style={[s.miniImage, { backgroundColor: colors.fill }]}>
              {e.image_url && <ExpoImage source={{ uri: e.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />}
              <DateBox event={e} small style={s.miniDate} />
            </View>
            <Text style={[s.miniTitle, { color: colors.text }]} numberOfLines={2}>{e.title}</Text>
            <Text style={[s.miniMeta, { color: colors.muted }]} numberOfLines={1}>{e.location ?? e.place?.name ?? eventWhen(e)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

// ── Laddar, och slutet ───────────────────────────────────────────────────────

export function FeedSkeleton() {
  return (
    <View style={{ paddingHorizontal: FEED_GUTTER, gap: 34 }} pointerEvents="none">
      {[0, 1].map((i) => (
        <View key={i} style={{ gap: 12 }}>
          <Skeleton width={140} height={12} radius={6} />
          <Skeleton height={260} radius={20} />
          <Skeleton width="70%" height={18} radius={7} />
          <Skeleton width="45%" height={13} radius={6} />
        </View>
      ))}
    </View>
  );
}

/** Inget kunde hämtas (oftast inget nät): säg det, och låt en försöka igen */
export function FeedOffline({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[s.footer, s.end]}>
      <View style={[s.endIcon, { backgroundColor: colors.fill }]}>
        <CloudOff size={22} color={colors.muted} strokeWidth={2.2} />
      </View>
      <Text style={[s.endTitle, { color: colors.text, textAlign: "center" }]}>{t("home.offline.title")}</Text>
      <Text style={[s.endSub, { color: colors.muted, textAlign: "center" }]}>{t("home.offline.sub")}</Text>
      <TouchableOpacity style={[s.moreBtn, { backgroundColor: colors.card, borderColor: colors.borderStrong, alignSelf: "stretch" }]} activeOpacity={0.75} onPress={onRetry}>
        <Text style={[s.moreText, { color: colors.text }]}>{t("home.offline.retry")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function FeedFooter({ hasMore, onMore, onDiscover }: { hasMore: boolean; onMore: () => void; onDiscover: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (hasMore) {
    return (
      <View style={s.footer}>
        <TouchableOpacity style={[s.moreBtn, { backgroundColor: colors.card, borderColor: colors.borderStrong }]} activeOpacity={0.75} onPress={onMore}>
          <Text style={[s.moreText, { color: colors.text }]}>{t("home.showMore")}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={[s.footer, s.end]}>
      <View style={[s.endIcon, { backgroundColor: colors.goldSoft }]}>
        <Check size={22} color={colors.goldText} strokeWidth={2.4} />
      </View>
      <Text style={[s.endTitle, { color: colors.text }]}>{t("home.caughtUp")}</Text>
      <Text style={[s.endSub, { color: colors.muted }]}>{t("home.caughtUpSub")}</Text>
      <TouchableOpacity style={[s.moreBtn, { backgroundColor: colors.card, borderColor: colors.borderStrong, alignSelf: "stretch" }]} activeOpacity={0.75} onPress={onDiscover}>
        <Text style={[s.moreText, { color: colors.text }]}>{t("home.toDiscover")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { paddingHorizontal: FEED_GUTTER, marginBottom: 34 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 },
  eyebrowText: { flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  liveWrap: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 3 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },

  image: { width: "100%", borderRadius: 20, overflow: "hidden" },
  dateBox: { position: "absolute", top: 12, right: 12 },
  info: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 14, paddingHorizontal: 2 },
  titleHero: { fontFamily: "Montserrat_700Bold", fontSize: 23, lineHeight: 28, letterSpacing: -0.4 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13.5 },
  open: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  body: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21 },

  friend: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
  },
  friendText: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 20 },
  bold: { fontFamily: "Inter_700Bold" },
  friendThumb: { width: 60, height: 60, borderRadius: 12, overflow: "hidden" },

  railHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
  railTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.3 },
  railAction: { flexDirection: "row", alignItems: "center", gap: 3 },
  railActionText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5 },
  rail: { paddingHorizontal: FEED_GUTTER, gap: 12 },
  mini: { width: 156, gap: 4 },
  miniImage: { width: 156, height: 112, borderRadius: 14, overflow: "hidden", marginBottom: 5 },
  miniDate: { position: "absolute", top: 6, left: 6 },
  miniTitle: { fontFamily: "Montserrat_700Bold", fontSize: 14.5, lineHeight: 19, letterSpacing: -0.2 },
  miniMeta: { fontFamily: "Inter_400Regular", fontSize: 12 },

  footer: { paddingHorizontal: FEED_GUTTER, paddingTop: 4 },
  moreBtn: { height: 50, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  moreText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  end: { alignItems: "center", gap: 8 },
  endIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  endTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18 },
  endSub: { fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 10 },
});
