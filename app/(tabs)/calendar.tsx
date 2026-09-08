/**
 * Kalender / Evenemang – native implementation
 * Spec: native-calendar-spec.md
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView, Modal,
  Dimensions, Pressable, Animated, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Flame, CalendarDays, LayoutGrid,
  ChevronLeft, ChevronRight, X, MapPin, Globe,
  Heart, CalendarPlus, Clock, ChevronDown,
} from "lucide-react-native";
import { useEvents, type Event } from "@/hooks/useEvents";
import { usePopularEvents } from "@/hooks/usePopularEvents";
import { useIsFavorite } from "@/hooks/useFavorites";
import { supabase } from "@/integrations/supabase/client";
import {
  format, eachDayOfInterval, startOfMonth, endOfMonth,
  addMonths, subMonths, isToday, getDay, parseISO,
} from "date-fns";
import { sv } from "date-fns/locale";

// ─── Constants ───────────────────────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get("window");
const SHEET_HEIGHT = SH * 0.93;
const GOLD         = "#C5A059";
const CHARCOAL     = "#121212";
const BG           = "#121212";
const CARD_BG      = "#1C1C1C";
const FG           = "#F5F1E8";
const MUTED        = "rgba(245,241,232,0.55)";
const BORDER       = "rgba(255,255,255,0.10)";

type EventTab = "foryou" | "popular" | "calendar" | "month";

// ─── Date utils ───────────────────────────────────────────────────────────────
function getEventDates(date: string | null, endDate?: string | null): string[] {
  if (!date) return [];
  const start = new Date(date + "T00:00");
  if (!endDate || endDate === date) return [date];
  const end = new Date(endDate + "T00:00");
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

function formatDateBadge(date: string | null, endDate?: string | null): { day: string; month: string } {
  if (!date) return { day: "", month: "" };
  const start = new Date(date + "T00:00");
  const month = format(start, "MMM", { locale: sv });
  if (!endDate || endDate === date) return { day: format(start, "d"), month };
  const end = new Date(endDate + "T00:00");
  const crossMonth = start.getMonth() !== end.getMonth();
  const endMonth = format(end, "MMM", { locale: sv });
  return {
    day: `${format(start, "d")}–${format(end, "d")}`,
    month: crossMonth ? `${month}/${endMonth}` : month,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────
type EventDetail = Event & {
  place?: { name: string; logo_url: string | null; lat: number | null; lng: number | null } | null;
};

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useEventDetail(id: number | null) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("events")
        .select("*, place:places!events_place_id_fkey(name, logo_url, lat, lng)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as EventDetail;
    },
    enabled: !!id,
  });
}

function useToggleFavoriteEvent(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: existing } = await supabase
        .from("favorites").select("id")
        .eq("user_id", user.id).eq("event_id", eventId).maybeSingle();
      if (existing) {
        await supabase.from("favorites").delete().eq("id", existing.id);
      } else {
        await supabase.from("favorites").insert({ user_id: user.id, event_id: eventId, place_id: null, service_point_id: null });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });
}

// ─── EventBottomSheet ─────────────────────────────────────────────────────────
export function EventBottomSheet({ eventId, onClose }: { eventId: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [closeIconWhite, setCloseIconWhite] = useState(false);

  const translateY      = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const heartScale      = useRef(new Animated.Value(1)).current;
  const closeRotate     = useRef(new Animated.Value(0)).current;
  const closeBgAnim     = useRef(new Animated.Value(0)).current;
  const shimmerX        = useRef(new Animated.Value(-200)).current;
  const calBtnScale     = useRef(new Animated.Value(1)).current;

  const { data: event, isLoading } = useEventDetail(eventId);
  const isFavServer = useIsFavorite(undefined, eventId ?? 0);
  const [localFav, setLocalFav]   = useState<boolean | null>(null);
  const isFav     = localFav !== null ? localFav : isFavServer;
  const toggleFav = useToggleFavoriteEvent(eventId ?? 0);

  useEffect(() => { setLocalFav(null); }, [eventId]);

  useEffect(() => {
    if (eventId !== null) {
      setVisible(true);
      setCloseIconWhite(false);
      translateY.setValue(SHEET_HEIGHT);
      backdropOpacity.setValue(0);
      closeRotate.setValue(0);
      closeBgAnim.setValue(0);
      shimmerX.setValue(-200);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 30, stiffness: 300, mass: 0.8, useNativeDriver: true }),
      ]).start();
    }
  }, [eventId]);

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.timing(shimmerX, { toValue: SW + 100, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmerX, { toValue: -200, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: SHEET_HEIGHT, damping: 30, stiffness: 300, useNativeDriver: true }),
    ]).start(() => { setVisible(false); onClose(); });
  }, []);

  const handleClose = () => {
    setCloseIconWhite(true);
    Animated.timing(closeRotate, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    Animated.timing(closeBgAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
    setTimeout(() => { closeRotate.setValue(0); closeBgAnim.setValue(0); setCloseIconWhite(false); closeSheet(); }, 280);
  };

  const handleHeart = () => {
    setLocalFav(!isFav);
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.25, duration: 100, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 0.95, duration: 70,  useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1.08, duration: 60,  useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1,    duration: 60,  useNativeDriver: true }),
    ]).start();
    toggleFav.mutate();
  };

  const closeRotateDeg = closeRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const closeBgColor   = closeBgAnim.interpolate({ inputRange: [0, 1], outputRange: ["#1F1F1F", "rgba(220,38,38,0.7)"] });

  if (!visible) return null;

  const location     = (event as any)?.location as string | null;
  const websiteUrl   = (event as any)?.website_url as string | null;
  const logoUrl      = event?.place?.logo_url ?? null;
  const websiteHost  = websiteUrl
    ? (() => { try { return new URL(websiteUrl).hostname.replace(/^www\./, ""); } catch { return websiteUrl.replace(/^https?:\/\//, "").split("/")[0]; } })()
    : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[bs.backdrop, { opacity: backdropOpacity }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.60)" }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      </Animated.View>

      <Animated.View style={[bs.sheet, { transform: [{ translateY }] }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Hero */}
          <View style={bs.heroContainer}>
            {event?.image_url
              ? <Image source={{ uri: event.image_url }} style={bs.heroImage} resizeMode="cover" />
              : <View style={[bs.heroImage, bs.heroPlaceholder]} />
            }
            <View style={bs.heroGradient} />
            {event && <Text style={bs.heroTitle}>{event.title}</Text>}
          </View>

          {isLoading && <View style={bs.center}><ActivityIndicator size="large" color={GOLD} /></View>}

          {event && (
            <View style={{ marginTop: 16 }}>
              {websiteUrl && (
                <TouchableOpacity style={bs.infoRow} onPress={() => Linking.openURL(websiteUrl)}>
                  <View style={bs.iconCircle}>
                    {logoUrl
                      ? <Image source={{ uri: logoUrl }} style={bs.iconCircleImg} resizeMode="cover" />
                      : <Globe size={20} color={GOLD} strokeWidth={2} />
                    }
                  </View>
                  <Text style={bs.infoText} numberOfLines={1}>{websiteHost}</Text>
                  <ChevronRight size={16} color={MUTED} />
                </TouchableOpacity>
              )}
              {event.date && (
                <View style={bs.infoRow}>
                  <View style={bs.iconCircle}><CalendarDays size={20} color={GOLD} strokeWidth={2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={bs.infoText}>
                      {format(new Date(event.date + "T00:00"), "EEEE d MMMM yyyy", { locale: sv })}
                    </Text>
                    {(event as any).time && <Text style={bs.infoSub}>{(event as any).time}</Text>}
                  </View>
                </View>
              )}
              {location && (
                <TouchableOpacity
                  style={bs.infoRow}
                  onPress={() => Linking.openURL(`maps://maps.apple.com/?q=${encodeURIComponent(location + ", Österlen")}`)}
                >
                  <View style={bs.iconCircle}><MapPin size={20} color={GOLD} strokeWidth={2} /></View>
                  <Text style={bs.infoText} numberOfLines={1}>{location}</Text>
                  <ChevronRight size={16} color={MUTED} />
                </TouchableOpacity>
              )}
              {event.description && (
                <View style={bs.section}>
                  <Text style={bs.sectionTitle}>Om evenemanget</Text>
                  <Text style={bs.sectionBody}>{event.description}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom bar */}
        <View style={[bs.bottomBar, { paddingBottom: 20 + insets.bottom }]}>
          <TouchableOpacity
            activeOpacity={1}
            style={{ flex: 1 }}
            onPressIn={() => Animated.timing(calBtnScale, { toValue: 0.97, duration: 80, useNativeDriver: true }).start()}
            onPressOut={() => Animated.timing(calBtnScale, { toValue: 1, duration: 80, useNativeDriver: true }).start()}
            onPress={() => {
              if (!event?.date) return;
              const d = format(new Date(event.date + "T00:00"), "yyyyMMdd");
              const p = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${d}/${d}`, details: event.description ?? "", location: location ?? "Österlen" });
              Linking.openURL(`https://calendar.google.com/calendar/render?${p}`);
            }}
          >
            <Animated.View style={[bs.calBtn, { transform: [{ scale: calBtnScale }] }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <CalendarPlus size={20} color={CHARCOAL} strokeWidth={2} />
                <Text style={bs.calBtnText}>Lägg till i kalender</Text>
              </View>
              <Animated.View style={[bs.shimmer, { transform: [{ translateX: shimmerX }, { skewX: "-20deg" }] }]} />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleHeart} activeOpacity={1}>
            <Animated.View style={[bs.iconBtn, { transform: [{ scale: heartScale }] }]}>
              <Heart size={20} color={isFav ? "#EF4444" : MUTED} fill={isFav ? "#EF4444" : "transparent"} strokeWidth={2} />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleClose} activeOpacity={1}>
            <Animated.View style={[bs.iconBtn, { backgroundColor: closeBgColor as any }]}>
              <Animated.View style={{ transform: [{ rotate: closeRotateDeg }] }}>
                <X size={20} color={closeIconWhite ? "#FFF" : MUTED} strokeWidth={2} />
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const bs = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 200 },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: SHEET_HEIGHT,
    backgroundColor: BG, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden", zIndex: 201,
  },
  heroContainer: { width: "100%", aspectRatio: 4 / 3, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  heroImage: { width: "100%", height: "100%", position: "absolute" },
  heroPlaceholder: { backgroundColor: "#2A2A2A" },
  heroGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", backgroundColor: "rgba(0,0,0,0.55)" },
  heroTitle: { position: "absolute", bottom: 12, left: 20, right: 20, fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: FG },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, gap: 12 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(197,160,89,0.15)", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  iconCircleImg: { width: 48, height: 48, borderRadius: 24 },
  infoText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15, color: FG },
  infoSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 2 },
  section: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: FG, marginBottom: 8 },
  sectionBody: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22, color: MUTED },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, gap: 12, backgroundColor: BG, zIndex: 202 },
  calBtn: { height: 56, borderRadius: 999, backgroundColor: GOLD, overflow: "hidden", justifyContent: "center" },
  calBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: CHARCOAL },
  shimmer: { position: "absolute", top: 0, bottom: 0, width: 60, backgroundColor: "rgba(255,255,255,0.24)" },
  iconBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#1F1F1F", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
});

// ─── Card components ──────────────────────────────────────────────────────────

function PremiumCard({ event, size = "lg", onPress }: { event: Event; size?: "lg" | "md"; onPress: () => void }) {
  const width  = size === "lg" ? 280 : 200;
  const height = size === "lg" ? 360 : 220;
  const badge  = formatDateBadge(event.date, event.end_date);
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={{ width, height, borderRadius: 28, overflow: "hidden", backgroundColor: "#1A1A1A" }}
    >
      {event.image_url && (
        <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "65%", backgroundColor: "rgba(0,0,0,0.01)" }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />
      </View>
      {badge.day ? (
        <View style={c.badge}>
          <Text style={c.badgeMonth}>{badge.month.toUpperCase()}</Text>
          <Text style={[c.badgeDay, size === "md" && { fontSize: 18 }]}>{badge.day}</Text>
        </View>
      ) : null}
      <View style={c.cardBottom}>
        {(event as any).location ? (
          <Text style={c.cardLocation}>{((event as any).location as string).toUpperCase()}</Text>
        ) : null}
        <Text style={[c.cardTitle, size === "md" && { fontSize: 16 }]} numberOfLines={2}>{event.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

function CompactCard({ event, onPress }: { event: Event; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={{ width: 140, height: 180, borderRadius: 16, overflow: "hidden", backgroundColor: "#1A1A1A" }}
    >
      {event.image_url && (
        <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%", backgroundColor: "rgba(0,0,0,0.7)" }} />
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 10 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 13, color: FG, lineHeight: 17 }} numberOfLines={2}>{event.title}</Text>
        {(event as any).time ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
            <Clock size={10} color={GOLD} strokeWidth={2} />
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: GOLD }}>{(event as any).time}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function BigEventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const badge = formatDateBadge(event.date, event.end_date);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={c.bigCard}>
      {event.image_url && <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%", backgroundColor: "rgba(0,0,0,0.7)" }} />
      {badge.day ? (
        <View style={c.badge}>
          <Text style={c.badgeMonth}>{badge.month.toUpperCase()}</Text>
          <Text style={c.badgeDay}>{badge.day}</Text>
        </View>
      ) : null}
      <View style={c.cardBottom}>
        {(event as any).location ? (
          <Text style={c.cardLocation}>{((event as any).location as string).toUpperCase()}</Text>
        ) : null}
        <Text style={c.cardTitle} numberOfLines={2}>{event.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

const c = StyleSheet.create({
  bigCard: { borderRadius: 16, overflow: "hidden", width: "100%", aspectRatio: 1, backgroundColor: "#1A1A1A" },
  badge: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(18,18,18,0.90)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "rgba(197,160,89,0.25)" },
  badgeMonth: { fontFamily: "Inter_700Bold", fontSize: 9, color: GOLD, letterSpacing: 1.5, textTransform: "uppercase" },
  badgeDay: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: FG, lineHeight: 28 },
  cardBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16 },
  cardLocation: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: GOLD, letterSpacing: 1, marginBottom: 4 },
  cardTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: "#FFF", lineHeight: 26 },
});

// ─── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
      <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG }}>{title}</Text>
      {subtitle ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 4 }}>{subtitle}</Text> : null}
    </View>
  );
}

// ─── ForYou view ──────────────────────────────────────────────────────────────
function ForYouView({ events, onPress }: { events: Event[]; onPress: (id: number) => void }) {
  const today = useMemo(() => {
    const d = new Date();
    return format(d, "yyyy-MM-dd");
  }, []);

  // Today's events
  const todayEvents = useMemo(() =>
    events
      .filter((e) => e.date === today)
      .sort((a, b) => {
        const ta = (a as any).time ?? "99:99";
        const tb = (b as any).time ?? "99:99";
        return ta.localeCompare(tb);
      })
      .slice(0, 10),
    [events, today]
  );

  // "Utvalt för dig" – featured + upcoming
  const featuredEvents = useMemo(() =>
    events
      .filter((e) => e.date && e.date >= today)
      .sort((a, b) => {
        const sa = (a as any).is_featured ? 2 : 0;
        const sb = (b as any).is_featured ? 2 : 0;
        return sb - sa || (a.date ?? "").localeCompare(b.date ?? "");
      })
      .slice(0, 5),
    [events, today]
  );

  // "Nära dig" – upcoming, not in featured
  const featuredIds = new Set(featuredEvents.map((e) => e.id));
  const nearbyEvents = useMemo(() =>
    events
      .filter((e) => e.date && e.date >= today && !featuredIds.has(e.id) && (e as any).location)
      .slice(0, 8),
    [events, today, featuredIds]
  );

  // Weekend events (upcoming Fri–Sun)
  const weekendEvents = useMemo(() => {
    const d = new Date();
    const dow = d.getDay(); // 0=Sun
    const daysToFri = dow === 0 ? 5 : dow <= 5 ? 5 - dow : 6;
    const fri = new Date(d); fri.setDate(d.getDate() + daysToFri);
    const sun = new Date(fri); sun.setDate(fri.getDate() + 2);
    const friFmt = format(fri, "yyyy-MM-dd");
    const sunFmt = format(sun, "yyyy-MM-dd");
    return events
      .filter((e) => e.date && e.date >= friFmt && e.date <= sunFmt)
      .slice(0, 6);
  }, [events]);

  const allEmpty = todayEvents.length === 0 && featuredEvents.length === 0 && nearbyEvents.length === 0 && weekendEvents.length === 0;

  if (allEmpty) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64, paddingHorizontal: 20 }}>
        <Sparkles size={28} color={`${GOLD}99`} strokeWidth={1.5} />
        <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: FG, marginTop: 16, textAlign: "center" }}>Din personliga guide byggs upp</Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, marginTop: 8, textAlign: "center" }}>Spara favoriter så lär appen känna dig.</Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
      {todayEvents.length > 0 && (
        <View style={{ marginBottom: 40 }}>
          <SectionHeader title="Idag på Österlen" subtitle="Händer just nu" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {todayEvents.map((e) => <CompactCard key={e.id} event={e} onPress={() => onPress(e.id)} />)}
          </ScrollView>
        </View>
      )}

      {featuredEvents.length > 0 && (
        <View style={{ marginBottom: 40 }}>
          <SectionHeader title="Utvalt för dig" subtitle="Vi tror du kommer gilla detta" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {featuredEvents.map((e) => <PremiumCard key={e.id} event={e} size="lg" onPress={() => onPress(e.id)} />)}
          </ScrollView>
        </View>
      )}

      {nearbyEvents.length > 0 && (
        <View style={{ marginBottom: 40 }}>
          <SectionHeader title="Nära dig" subtitle="Upptäck runt hörnet" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {nearbyEvents.map((e) => <PremiumCard key={e.id} event={e} size="md" onPress={() => onPress(e.id)} />)}
          </ScrollView>
        </View>
      )}

      {weekendEvents.length > 0 && (
        <View style={{ marginBottom: 40 }}>
          <SectionHeader title="Missa inte i helgen" subtitle="Det här pratar folk om" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {weekendEvents.map((e) => <PremiumCard key={e.id} event={e} size="lg" onPress={() => onPress(e.id)} />)}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Popular view ─────────────────────────────────────────────────────────────
function PopularView({ events, onPress }: { events: Event[]; onPress: (id: number) => void }) {
  if (events.length === 0) {
    return <View style={{ flex: 1, alignItems: "center", paddingTop: 60 }}><Text style={{ fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED }}>Inga evenemang att visa</Text></View>;
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 20 }}>
      {events.map((event, i) => (
        <Animated.View key={event.id} style={{ opacity: 1 }}>
          <BigEventCard event={event} onPress={() => onPress(event.id)} />
        </Animated.View>
      ))}
    </ScrollView>
  );
}

// ─── Calendar grid ────────────────────────────────────────────────────────────
const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function DayPopup({ dateKey, events, onEventPress, onClose }: { dateKey: string; events: Event[]; onEventPress: (id: number) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, damping: 28, stiffness: 300, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const close = () => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 60, damping: 28, stiffness: 300, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Modal transparent animationType="none" visible onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "flex-end" }} onPress={close}>
        <Animated.View
          style={{ backgroundColor: CARD_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: SH * 0.85, borderTopWidth: 1, borderColor: BORDER, transform: [{ translateY }], opacity }}
          onStartShouldSetResponder={() => true}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
            <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: FG, textTransform: "capitalize" }}>
              {format(new Date(dateKey + "T00:00"), "d MMMM", { locale: sv })}
            </Text>
            <TouchableOpacity
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#242424", alignItems: "center", justifyContent: "center" }}
              onPress={close}
            >
              <X size={18} color={MUTED} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 88 + insets.bottom }}>
            {events.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={{ borderRadius: 16, overflow: "hidden", aspectRatio: 16 / 9, backgroundColor: "#1A1A1A" }}
                onPress={() => { close(); setTimeout(() => onEventPress(event.id), 200); }}
              >
                {event.image_url && <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "80%", backgroundColor: "rgba(0,0,0,0.5)" }} />
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 12 }}>
                  <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: "#FFF" }} numberOfLines={1}>{event.title}</Text>
                  {(event as any).time && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                      <Clock size={12} color={GOLD} strokeWidth={2} />
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{(event as any).time}</Text>
                    </View>
                  )}
                  {(event as any).location && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <MapPin size={11} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)" }} numberOfLines={1}>{(event as any).location}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function MonthGrid({ month, eventsByDate, onEventPress, onDayPopup }: {
  month: Date;
  eventsByDate: Map<string, Event[]>;
  onEventPress: (id: number) => void;
  onDayPopup: (dateKey: string) => void;
}) {
  const days  = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const d     = getDay(startOfMonth(month));
  const offset = d === 0 ? 6 : d - 1;
  const cellSize = (SW - 40 - 6 * 4) / 7;

  return (
    <View style={{ marginBottom: 32 }}>
      <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, textAlign: "center", marginBottom: 8, textTransform: "capitalize" }}>
        {format(month, "MMMM yyyy", { locale: sv })}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        {WEEKDAYS.map((wd) => (
          <Text key={wd} style={{ width: cellSize, textAlign: "center", fontFamily: "Inter_600SemiBold", fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>{wd}</Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {Array.from({ length: offset }).map((_, i) => (
          <View key={`e-${i}`} style={{ width: cellSize, height: cellSize }} />
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate.get(key) ?? [];
          const today = isToday(day);
          const first = dayEvents[0];
          const multi = dayEvents.length > 1;
          const r = (cellSize - 2) / 2;

          return (
            <View key={key} style={{ width: cellSize, height: cellSize, alignItems: "center", justifyContent: "center" }}>
              {first ? (
                <TouchableOpacity
                  style={{ width: cellSize - 2, height: cellSize - 2, borderRadius: r, overflow: "hidden", borderWidth: today ? 2 : 1.5, borderColor: today ? GOLD : `${GOLD}80` }}
                  onPress={() => multi ? onDayPopup(key) : onEventPress(first.id)}
                >
                  {first.image_url && <Image source={{ uri: first.image_url }} style={{ width: "100%", height: "100%", borderRadius: r }} resizeMode="cover" />}
                  {multi && (
                    <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: "#FFF" }}>{dayEvents.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={today ? { width: cellSize * 0.72, height: cellSize * 0.72, borderRadius: cellSize * 0.36, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" } : undefined}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: today ? CHARCOAL : `${MUTED}99` }}>{format(day, "d")}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CalendarView({ events, onEventPress }: { events: Event[]; onEventPress: (id: number) => void }) {
  const [curMonth, setCurMonth]   = useState(() => startOfMonth(new Date()));
  const [popupKey, setPopupKey]   = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((e) => {
      for (const key of getEventDates(e.date, e.end_date ?? null)) {
        const existing = map.get(key) ?? [];
        if (!existing.some((x) => x.id === e.id)) map.set(key, [...existing, e]);
      }
    });
    return map;
  }, [events]);

  const next = addMonths(curMonth, 1);
  const popupEvents = popupKey ? (eventsByDate.get(popupKey) ?? []) : [];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      {/* Nav row */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 8 }}>
        <TouchableOpacity style={{ padding: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setCurMonth((m) => subMonths(m, 2))}>
          <ChevronLeft size={20} color={MUTED} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED }}>
          {format(curMonth, "MMM", { locale: sv })} – {format(next, "MMM yyyy", { locale: sv })}
        </Text>
        <TouchableOpacity style={{ padding: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setCurMonth((m) => addMonths(m, 2))}>
          <ChevronRight size={20} color={MUTED} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <MonthGrid month={curMonth} eventsByDate={eventsByDate} onEventPress={onEventPress} onDayPopup={setPopupKey} />
      <MonthGrid month={next}     eventsByDate={eventsByDate} onEventPress={onEventPress} onDayPopup={setPopupKey} />

      {popupKey && popupEvents.length > 0 && (
        <DayPopup dateKey={popupKey} events={popupEvents} onEventPress={onEventPress} onClose={() => setPopupKey(null)} />
      )}
    </ScrollView>
  );
}

// ─── Utforska (month) view ────────────────────────────────────────────────────
const MONTHS_SV = ["Jan", "Feb", "Mars", "Apr", "Maj", "Juni", "Juli", "Aug", "Sep", "Okt", "Nov", "Dec"];
const CATEGORIES = ["Alla", "Musik", "Matupplevelse", "Konst & Kultur", "Marknad", "Familj", "Natur", "Guidning", "Hälsa & Välmående", "Övrigt"];

function UtforskView({ events, onPress }: { events: Event[]; onPress: (id: number) => void }) {
  const [selMonth,    setSelMonth]    = useState(new Date().getMonth());
  const [selCategory, setSelCategory] = useState("Alla");
  const [catOpen,     setCatOpen]     = useState(false);
  const catChevron = useRef(new Animated.Value(0)).current;
  const pillRef = useRef<ScrollView>(null);
  const year = new Date().getFullYear();

  const toggleCat = () => {
    const toVal = catOpen ? 0 : 1;
    setCatOpen(!catOpen);
    Animated.timing(catChevron, { toValue: toVal, duration: 200, useNativeDriver: true }).start();
  };

  const chevronDeg = catChevron.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  const filtered = useMemo(() => {
    const monthStart = new Date(year, selMonth, 1);
    return events.filter((e) => {
      if (!e.date) return false;
      const start = new Date(e.date + "T00:00");
      const end   = e.end_date ? new Date(e.end_date + "T00:00") : start;
      const inMonth = (start.getMonth() === selMonth && start.getFullYear() === year) || (start < monthStart && end >= monthStart);
      if (!inMonth) return false;
      if (selCategory !== "Alla" && (e as any).main_category !== selCategory) return false;
      return true;
    });
  }, [events, selMonth, selCategory, year]);

  return (
    <View style={{ flex: 1 }}>
      {/* Month pills */}
      <ScrollView ref={pillRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 8 }}>
        {MONTHS_SV.map((name, idx) => (
          <TouchableOpacity
            key={idx}
            style={[{ width: 64, paddingVertical: 10, borderRadius: 999, alignItems: "center", borderWidth: 1 }, selMonth === idx ? { backgroundColor: GOLD, borderColor: GOLD } : { backgroundColor: "rgba(28,28,28,0.5)", borderColor: BORDER }]}
            onPress={() => setSelMonth(idx)}
          >
            <Text style={[{ fontFamily: "Inter_600SemiBold", fontSize: 14, textAlign: "center" }, selMonth === idx ? { color: CHARCOAL } : { color: MUTED }]}>{name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Category dropdown */}
      {catOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={toggleCat} />
      )}

      {catOpen && (
        <View style={{ position: "absolute", top: 56, right: 20, zIndex: 200, backgroundColor: "#1A1A1A", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", minWidth: 220, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.7, shadowRadius: 48, elevation: 20 }}>
          {CATEGORIES.map((cat, i) => (
            <TouchableOpacity
              key={cat}
              style={[{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, i > 0 && { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.03)" }, selCategory === cat && { backgroundColor: "rgba(197,160,89,0.1)" }]}
              onPress={() => { setSelCategory(cat); toggleCat(); }}
            >
              <Text style={[{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(245,241,232,0.70)" }, selCategory === cat && { fontFamily: "Inter_600SemiBold", color: GOLD }]}>{cat}</Text>
              {selCategory === cat && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD }} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Event list */}
      {filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", paddingTop: 48 }}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED }}>
            {selCategory !== "Alla" ? `Inga evenemang i ${selCategory} denna månad` : "Inga evenemang denna månad"}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 20, paddingBottom: 32 }}>
          {filtered.map((event) => (
            <BigEventCard key={event.id} event={event} onPress={() => onPress(event.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Tab bar with sliding indicator ──────────────────────────────────────────
const TABS: { id: EventTab; Icon: React.ComponentType<any>; label: string }[] = [
  { id: "foryou",   Icon: Sparkles,    label: "För dig"  },
  { id: "popular",  Icon: Flame,       label: "Populärt" },
  { id: "calendar", Icon: CalendarDays,label: "Kalender" },
  { id: "month",    Icon: LayoutGrid,  label: "Utforska" },
];
const TAB_W = SW / 4;
const IND_W = 32;

function EventTabBar({ activeTab, onTabChange, catOpen, onCatToggle }: {
  activeTab: EventTab;
  onTabChange: (t: EventTab) => void;
  catOpen?: boolean;
  onCatToggle?: () => void;
}) {
  const indicatorX = useRef(new Animated.Value(TABS.findIndex(t => t.id === activeTab) * TAB_W + (TAB_W - IND_W) / 2)).current;

  const goTo = (id: EventTab) => {
    const idx = TABS.findIndex(t => t.id === id);
    Animated.spring(indicatorX, { toValue: idx * TAB_W + (TAB_W - IND_W) / 2, stiffness: 400, damping: 30, useNativeDriver: true }).start();
    onTabChange(id);
  };

  return (
    <View style={{ marginHorizontal: 12, marginBottom: 20 }}>
      <View style={{ flexDirection: "row" }}>
        {TABS.map(({ id, Icon, label }) => {
          const active = activeTab === id;
          return (
            <TouchableOpacity key={id} style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 8 }} onPress={() => goTo(id)}>
              <Icon size={22} color={active ? GOLD : MUTED} strokeWidth={1.75} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.3, color: active ? GOLD : MUTED }} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Sliding underline */}
      <Animated.View style={{ position: "absolute", bottom: -2, width: IND_W, height: 2, borderRadius: 999, backgroundColor: GOLD, transform: [{ translateX: indicatorX }] }} />
    </View>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ padding: 20, gap: 16 }}>
      {[224, 224, 224].map((h, i) => (
        <Animated.View key={i} style={{ height: h, borderRadius: 16, backgroundColor: "#2A2A2A", opacity }} />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab,       setActiveTab]       = useState<EventTab>("foryou");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [catOpen,         setCatOpen]         = useState(false);

  const { data: allEvents = [],     isLoading }        = useEvents();
  const { data: popularEvents = [], isLoading: popLoad } = usePopularEvents();

  const loading = activeTab === "popular" ? popLoad : isLoading;
  const safeTop = Math.max(insets.top, 44);

  const handleTabChange = (t: EventTab) => {
    setActiveTab(t);
    if (t !== "month") setCatOpen(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: safeTop + 12 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, marginBottom: 16, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 30, color: FG }}>Evenemang</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, marginTop: 4 }}>Upptäck vad som händer på Österlen</Text>
        </View>
        {/* Category chip – only visible in Utforska tab */}
        {activeTab === "month" && (
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", height: 40, borderRadius: 999, paddingHorizontal: 14, gap: 6, backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", marginTop: 4 }}
            onPress={() => setCatOpen((v) => !v)}
          >
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Alla</Text>
            <ChevronDown size={16} color="rgba(255,255,255,0.8)" strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab bar */}
      <EventTabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Content */}
      {loading ? (
        <Skeleton />
      ) : (
        <View style={{ flex: 1 }}>
          {activeTab === "foryou"   && <ForYouView   events={allEvents}     onPress={setSelectedEventId} />}
          {activeTab === "popular"  && <PopularView  events={popularEvents} onPress={setSelectedEventId} />}
          {activeTab === "calendar" && <CalendarView events={allEvents}     onEventPress={setSelectedEventId} />}
          {activeTab === "month"    && <UtforskView  events={allEvents}     onPress={setSelectedEventId} />}
        </View>
      )}

      <EventBottomSheet eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
    </View>
  );
}
