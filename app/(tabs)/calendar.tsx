import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView, Modal,
  Dimensions, Pressable, Animated, Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Flame, CalendarDays, LayoutGrid, ChevronLeft, ChevronRight, X, MapPin,
  Globe, Heart, CalendarPlus,
} from "lucide-react-native";
import { useEvents, type Event } from "@/hooks/useEvents";
import { usePopularEvents } from "@/hooks/usePopularEvents";
import { useIsFavorite } from "@/hooks/useFavorites";
import { colors } from "@/lib/colors";
import { supabase } from "@/integrations/supabase/client";
import {
  format, eachDayOfInterval, startOfMonth, endOfMonth,
  addMonths, subMonths, isToday, getDay, parseISO,
} from "date-fns";
import { sv } from "date-fns/locale";

type EventTab = "popular" | "calendar" | "month";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.93;

const GOLD = "#C9A24C";
const CHARCOAL = "#121212";
const MUTED = "#A8A192";

// ─── Date utils ────────────────────────────────────────────────────────────

function getEventDates(date: string | null, endDate?: string | null): string[] {
  if (!date) return [];
  const start = parseISO(date);
  if (!endDate || endDate === date) return [date];
  const end = parseISO(endDate);
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

function formatDateBadge(date: string | null, endDate?: string | null): { day: string; month: string } {
  if (!date) return { day: "", month: "" };
  const start = new Date(date + "T00:00");
  const month = format(start, "MMM", { locale: sv });
  if (!endDate || endDate === date) {
    return { day: format(start, "d"), month };
  }
  const end = new Date(endDate + "T00:00");
  const endMonth = format(end, "MMM", { locale: sv });
  const crossMonth = start.getMonth() !== end.getMonth();
  return {
    day: `${format(start, "d")}–${format(end, "d")}`,
    month: crossMonth ? `${month}/${endMonth}` : month,
  };
}

// ─── Event detail hooks ────────────────────────────────────────────────────

type EventDetail = Event & {
  place?: { name: string; logo_url: string | null; lat: number | null; lng: number | null } | null;
};

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
        await supabase.from("favorites").insert({
          user_id: user.id,
          event_id: eventId,
          place_id: null,
          service_point_id: null,
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });
}

function googleCalendarUrl(event: EventDetail): string {
  const date = event.date ? format(new Date(event.date), "yyyyMMdd") : "";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${date}/${date}`,
    details: event.description ?? "",
    location: (event as any).location ?? "Österlen",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// ─── Bottom sheet ──────────────────────────────────────────────────────────

function EventBottomSheet({ eventId, onClose }: { eventId: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [closeIconWhite, setCloseIconWhite] = useState(false);

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  const closeRotate = useRef(new Animated.Value(0)).current;
  const closeBgAnim = useRef(new Animated.Value(0)).current;
  const shimmerX = useRef(new Animated.Value(-200)).current;
  const calBtnScale = useRef(new Animated.Value(1)).current;

  const { data: event, isLoading } = useEventDetail(eventId);
  const isFavServer = useIsFavorite(undefined, eventId ?? 0);
  const [localFav, setLocalFav] = useState<boolean | null>(null);
  const isFav = localFav !== null ? localFav : isFavServer;
  const toggleFav = useToggleFavoriteEvent(eventId ?? 0);

  // Reset local fav state when eventId changes
  useEffect(() => {
    setLocalFav(null);
  }, [eventId]);

  // Open animation when eventId set
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
        Animated.spring(translateY, { toValue: 0, damping: 30, stiffness: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [eventId]);

  // Shimmer loop
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.timing(shimmerX, { toValue: 400, duration: 700, useNativeDriver: true }),
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
    ]).start(() => {
      setVisible(false);
      onClose();
    });
  }, []);

  const handleClose = () => {
    setCloseIconWhite(true);
    Animated.timing(closeRotate, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    Animated.timing(closeBgAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
    setTimeout(() => {
      closeRotate.setValue(0);
      closeBgAnim.setValue(0);
      setCloseIconWhite(false);
      closeSheet();
    }, 280);
  };

  const handleHeart = () => {
    setLocalFav(!isFav);
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.25, duration: 100, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 0.95, duration: 70, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1.08, duration: 60, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1, duration: 60, useNativeDriver: true }),
    ]).start();
    toggleFav.mutate();
  };

  const closeRotateDeg = closeRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const closeBgColor = closeBgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#1F1F1F", "rgba(220,38,38,0.7)"],
  });

  if (!visible) return null;

  const eventDate = event?.date ? new Date(event.date) : null;
  const location = (event as any)?.location as string | null;
  const websiteUrl = (event as any)?.website_url as string | null;
  const logoUrl = event?.place?.logo_url ?? null;
  const websiteHostname = websiteUrl
    ? (() => { try { return new URL(websiteUrl).hostname.replace(/^www\./, ""); } catch { return websiteUrl.replace(/^https?:\/\//, "").split("/")[0]; } })()
    : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View style={[bs.backdrop, { opacity: backdropOpacity }]}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[bs.sheet, { transform: [{ translateY }] }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

          {/* Hero image with title overlay */}
          <View style={bs.heroContainer}>
            {event?.image_url ? (
              <Image source={{ uri: event.image_url }} style={bs.heroImage} resizeMode="cover" />
            ) : (
              <View style={[bs.heroImage, bs.heroPlaceholder]} />
            )}
            {event && (
              <View style={bs.heroOverlay}>
                <Text style={bs.heroTitle}>{event.title}</Text>
              </View>
            )}
          </View>

          {/* Loading */}
          {isLoading && (
            <View style={bs.center}>
              <ActivityIndicator size="large" color={GOLD} />
            </View>
          )}

          {event && (
            <>
            <View style={{ marginTop: 16 }}>
              {/* Website */}
              {websiteUrl && (
                <TouchableOpacity style={bs.infoRow} onPress={() => Linking.openURL(websiteUrl)}>
                  <View style={bs.iconCircle}>
                    {logoUrl ? (
                      <Image source={{ uri: logoUrl }} style={bs.iconCircleImage} resizeMode="cover" />
                    ) : (
                      <Globe size={20} color={GOLD} strokeWidth={2} />
                    )}
                  </View>
                  <Text style={bs.infoText} numberOfLines={1}>{websiteHostname}</Text>
                  <ChevronRight size={20} color={MUTED} />
                </TouchableOpacity>
              )}

              {/* Date */}
              {eventDate && (
                <View style={bs.infoRow}>
                  <View style={bs.iconCircle}><CalendarDays size={20} color={GOLD} strokeWidth={2} /></View>
                  <Text style={bs.infoText}>
                    {format(eventDate, "EEEE d MMMM yyyy", { locale: sv })}
                  </Text>
                </View>
              )}

              {/* Location */}
              {location && (
                <View style={bs.infoRow}>
                  <View style={bs.iconCircle}><MapPin size={20} color={GOLD} strokeWidth={2} /></View>
                  <Text style={bs.infoText}>{location}</Text>
                </View>
              )}
            </View>

              {/* Om evenemanget */}
              {event.description && (
                <View style={bs.section}>
                  <Text style={bs.sectionTitle}>Om evenemanget</Text>
                  <Text style={bs.sectionBody}>{event.description}</Text>
                </View>
              )}
            </>
          )}

        </ScrollView>

        {/* Sticky bottom bar */}
        <View style={[bs.bottomBar, { paddingBottom: 20 + insets.bottom }]}>
          {/* Gold calendar button */}
          <TouchableOpacity
            activeOpacity={1}
            style={bs.calBtn}
            onPressIn={() => Animated.timing(calBtnScale, { toValue: 0.97, duration: 80, useNativeDriver: true }).start()}
            onPressOut={() => Animated.timing(calBtnScale, { toValue: 1, duration: 80, useNativeDriver: true }).start()}
            onPress={() => event && Linking.openURL(googleCalendarUrl(event))}
          >
            <Animated.View style={[bs.calBtnInner, { transform: [{ scale: calBtnScale }] }]}>
              <View style={bs.calBtnContent}>
                <CalendarPlus size={20} color={CHARCOAL} strokeWidth={2} />
                <Text style={bs.calBtnText}>Lägg till i kalender</Text>
              </View>
              <Animated.View style={[bs.shimmer, { transform: [{ translateX: shimmerX }, { skewX: "-20deg" }] }]} />
            </Animated.View>
          </TouchableOpacity>

          {/* Heart */}
          <TouchableOpacity onPress={handleHeart} activeOpacity={1}>
            <Animated.View style={[bs.iconBtn, { transform: [{ scale: heartScale }] }]}>
              <Heart
                size={20}
                color={isFav ? "#EF4444" : MUTED}
                fill={isFav ? "#EF4444" : "transparent"}
                strokeWidth={2}
              />
            </Animated.View>
          </TouchableOpacity>

          {/* Close */}
          <TouchableOpacity onPress={handleClose} activeOpacity={1}>
            <Animated.View style={[bs.iconBtn, { backgroundColor: closeBgColor }]}>
              <Animated.View style={{ transform: [{ rotate: closeRotateDeg }] }}>
                <X size={20} color={closeIconWhite ? "#FFFFFF" : MUTED} strokeWidth={2} />
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const bs = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.60)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: CHARCOAL,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(46,46,46,0.10)",
    overflow: "hidden",
  },
  heroContainer: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  heroImage: { width: "100%", height: "100%" },
  heroPlaceholder: { backgroundColor: "#2A2A2A" },
  heroOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.50)",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "serif",
    color: "#F4EFE3",
  },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    backgroundColor: "rgba(201,162,76,0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  iconCircleImage: {
    width: 48,
    height: 48,
    borderRadius: 9999,
  },
  infoText: { flex: 1, fontSize: 15, fontWeight: "500", color: "#F4EFE3" },
  section: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "serif",
    color: "#F4EFE3",
    marginBottom: 8,
  },
  sectionBody: { fontSize: 14, lineHeight: 14 * 1.625, color: MUTED },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
    backgroundColor: CHARCOAL,
    zIndex: 101,
  },
  calBtn: { flex: 1 },
  calBtnInner: {
    height: 56,
    borderRadius: 9999,
    backgroundColor: GOLD,
    overflow: "hidden",
    justifyContent: "center",
  },
  calBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  calBtnText: { fontSize: 15, fontWeight: "600", color: CHARCOAL },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  iconBtn: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: "#1F1F1F",
    borderWidth: 1,
    borderColor: "rgba(46,46,46,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Tab bar ───────────────────────────────────────────────────────────────

const TABS: { id: EventTab; icon: React.ComponentType<any>; label: string }[] = [
  { id: "popular", icon: Flame, label: "Populärt" },
  { id: "calendar", icon: CalendarDays, label: "Kalender" },
  { id: "month", icon: LayoutGrid, label: "Månad" },
];

function EventTabBar({ activeTab, onTabChange }: { activeTab: EventTab; onTabChange: (t: EventTab) => void }) {
  return (
    <View style={s.tabBar}>
      {TABS.map(({ id, icon: Icon, label }) => {
        const active = activeTab === id;
        return (
          <TouchableOpacity key={id} style={s.tabBtn} onPress={() => onTabChange(id)}>
            <Icon size={22} color={active ? colors.gold : colors.foregroundMuted} />
            <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
            {active && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Full-width image event card (Popular + Månad) ────────────────────────

function BigEventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const badge = formatDateBadge(event.date, event.end_date);
  return (
    <TouchableOpacity style={s.bigCard} activeOpacity={0.9} onPress={onPress}>
      <Image
        source={{ uri: event.image_url ?? undefined }}
        style={s.bigCardImage}
      />
      <View style={s.bigCardGradient} />
      {badge.day ? (
        <View style={s.dateBadge}>
          <Text style={s.dateBadgeMonth}>{badge.month.toUpperCase()}</Text>
          <Text style={s.dateBadgeDay}>{badge.day}</Text>
        </View>
      ) : null}
      <View style={s.bigCardBottom}>
        {event.location ? (
          <Text style={s.bigCardLocation}>{event.location.toUpperCase()}</Text>
        ) : null}
        <Text style={s.bigCardTitle} numberOfLines={2}>{event.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Popular tab ───────────────────────────────────────────────────────────

function PopularView({ events, onPress }: { events: Event[]; onPress: (id: number) => void }) {
  if (events.length === 0) {
    return <View style={s.center}><Text style={s.emptyText}>Inga evenemang att visa</Text></View>;
  }
  return (
    <FlatList
      data={events}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={s.bigCardList}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => <BigEventCard event={item} onPress={() => onPress(item.id)} />}
    />
  );
}

// ─── Calendar grid tab ─────────────────────────────────────────────────────

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function MonthGrid({
  month,
  eventsByDate,
  onEventPress,
  onDayPopup,
}: {
  month: Date;
  eventsByDate: Map<string, Event[]>;
  onEventPress: (id: number) => void;
  onDayPopup: (dateKey: string) => void;
}) {
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const d = getDay(startOfMonth(month));
  const startOffset = d === 0 ? 6 : d - 1;
  const cellSize = (SCREEN_WIDTH - 40 - 6 * 4) / 7;

  return (
    <View style={s.monthGrid}>
      <Text style={s.monthTitle}>
        {format(month, "MMMM yyyy", { locale: sv }).charAt(0).toUpperCase() +
          format(month, "MMMM yyyy", { locale: sv }).slice(1)}
      </Text>
      <View style={s.weekdayRow}>
        {WEEKDAYS.map((wd) => (
          <Text key={wd} style={[s.weekdayLabel, { width: cellSize }]}>{wd}</Text>
        ))}
      </View>
      <View style={s.daysGrid}>
        {Array.from({ length: startOffset }).map((_, i) => (
          <View key={`empty-${i}`} style={{ width: cellSize, height: cellSize }} />
        ))}
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate.get(dateKey) ?? [];
          const today = isToday(day);
          const firstEvent = dayEvents[0];
          const hasMultiple = dayEvents.length > 1;

          return (
            <View key={dateKey} style={{ width: cellSize, height: cellSize, alignItems: "center", justifyContent: "center" }}>
              {firstEvent ? (
                <TouchableOpacity
                  style={[
                    s.dayCircle,
                    { width: cellSize - 2, height: cellSize - 2, borderRadius: (cellSize - 2) / 2 },
                    today ? s.dayCircleToday : s.dayCircleEvent,
                  ]}
                  onPress={() => hasMultiple ? onDayPopup(dateKey) : onEventPress(firstEvent.id)}
                >
                  <Image
                    source={{ uri: firstEvent.image_url ?? undefined }}
                    style={{ width: "100%", height: "100%", borderRadius: (cellSize - 2) / 2 }}
                  />
                  {hasMultiple && (
                    <View style={s.multiOverlay}>
                      <Text style={s.multiCount}>{dayEvents.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={today ? [s.todayCircle, { width: cellSize * 0.7, height: cellSize * 0.7, borderRadius: cellSize * 0.35 }] : undefined}>
                  <Text style={[s.dayNum, today && s.dayNumToday]}>{format(day, "d")}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DayPopupModal({
  dateKey,
  events,
  onEventPress,
  onClose,
}: {
  dateKey: string;
  events: Event[];
  onEventPress: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={s.popupBackdrop} onPress={onClose}>
        <Pressable style={s.popupSheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.popupHeader}>
            <Text style={s.popupDate}>
              {format(new Date(dateKey), "d MMMM", { locale: sv })}
            </Text>
            <TouchableOpacity style={s.popupClose} onPress={onClose}>
              <X size={20} color={colors.foregroundMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
            {events.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={s.popupCard}
                onPress={() => { onClose(); onEventPress(event.id); }}
              >
                <Image source={{ uri: event.image_url ?? undefined }} style={s.popupCardImage} />
                <View style={s.popupCardGradient} />
                <View style={s.popupCardContent}>
                  <Text style={s.popupCardTitle} numberOfLines={1}>{event.title}</Text>
                  {event.location && (
                    <View style={s.popupCardLocation}>
                      <MapPin size={11} color={colors.gold} />
                      <Text style={s.popupCardLocationText} numberOfLines={1}>{event.location}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CalendarView({ events, onEventPress }: { events: Event[]; onEventPress: (id: number) => void }) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [popupDateKey, setPopupDateKey] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((e) => {
      const dates = getEventDates(e.date, e.end_date ?? null);
      for (const dateKey of dates) {
        const existing = map.get(dateKey) ?? [];
        if (!existing.some((x) => x.id === e.id)) {
          map.set(dateKey, [...existing, e]);
        }
      }
    });
    return map;
  }, [events]);

  const secondMonth = addMonths(currentMonth, 1);
  const popupEvents = popupDateKey ? (eventsByDate.get(popupDateKey) ?? []) : [];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <View style={s.calNavRow}>
        <TouchableOpacity style={s.calNavBtn} onPress={() => setCurrentMonth((m) => subMonths(m, 2))}>
          <ChevronLeft size={20} color={colors.foregroundMuted} />
        </TouchableOpacity>
        <Text style={s.calNavLabel}>
          {format(currentMonth, "MMM", { locale: sv })} – {format(secondMonth, "MMM yyyy", { locale: sv })}
        </Text>
        <TouchableOpacity style={s.calNavBtn} onPress={() => setCurrentMonth((m) => addMonths(m, 2))}>
          <ChevronRight size={20} color={colors.foregroundMuted} />
        </TouchableOpacity>
      </View>

      <MonthGrid month={currentMonth} eventsByDate={eventsByDate} onEventPress={onEventPress} onDayPopup={setPopupDateKey} />
      <MonthGrid month={secondMonth} eventsByDate={eventsByDate} onEventPress={onEventPress} onDayPopup={setPopupDateKey} />

      {popupDateKey && popupEvents.length > 0 && (
        <DayPopupModal
          dateKey={popupDateKey}
          events={popupEvents}
          onEventPress={onEventPress}
          onClose={() => setPopupDateKey(null)}
        />
      )}
    </ScrollView>
  );
}

// ─── Månad tab ─────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Maj", "Juni",
  "Juli", "Aug", "Sep", "Okt", "Nov", "Dec",
];

function MonthView({ events, onPress }: { events: Event[]; onPress: (id: number) => void }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const currentYear = new Date().getFullYear();

  const filtered = useMemo(() => events.filter((e) => {
    if (!e.date) return false;
    const d = new Date(e.date);
    if (d.getMonth() === selectedMonth && d.getFullYear() === currentYear) return true;
    if (e.end_date) {
      const end = new Date(e.end_date);
      return d < new Date(currentYear, selectedMonth, 1) && end >= new Date(currentYear, selectedMonth, 1);
    }
    return false;
  }), [events, selectedMonth, currentYear]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pillRow}
      >
        {MONTHS.map((name, idx) => (
          <TouchableOpacity
            key={idx}
            style={[s.pill, selectedMonth === idx && s.pillActive]}
            onPress={() => setSelectedMonth(idx)}
          >
            <Text style={[s.pillText, selectedMonth === idx && s.pillTextActive]} numberOfLines={1}>{name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={s.center}><Text style={s.emptyText}>Inga evenemang denna månad</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={s.bigCardList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <BigEventCard event={item} onPress={() => onPress(item.id)} />}
        />
      )}
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const [activeTab, setActiveTab] = useState<EventTab>("popular");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const { data: allEvents = [], isLoading } = useEvents();
  const { data: popularEvents = [], isLoading: isLoadingPopular } = usePopularEvents();

  const handleEventPress = useCallback((id: number) => {
    setSelectedEventId(id);
  }, []);

  const loading = activeTab === "popular" ? isLoadingPopular : isLoading;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Evenemang</Text>
        <Text style={s.headerSub}>Upptäck vad som händer på Österlen</Text>
      </View>

      <EventTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : (
        <>
          {activeTab === "popular" && (
            <PopularView events={popularEvents} onPress={handleEventPress} />
          )}
          {activeTab === "calendar" && (
            <CalendarView events={allEvents} onEventPress={handleEventPress} />
          )}
          {activeTab === "month" && (
            <MonthView events={allEvents} onPress={handleEventPress} />
          )}
        </>
      )}

      <EventBottomSheet
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: colors.foreground },
  headerSub: { fontSize: 13, color: colors.foregroundMuted, marginTop: 2, marginBottom: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyText: { color: colors.foregroundSubtle, fontSize: 15 },

  // Tab bar
  tabBar: { flexDirection: "row", justifyContent: "space-around", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { alignItems: "center", gap: 4, paddingVertical: 10, paddingHorizontal: 24, position: "relative" },
  tabLabel: { fontSize: 11, fontWeight: "700", color: colors.foregroundMuted, letterSpacing: 0.3 },
  tabLabelActive: { color: colors.gold },
  tabUnderline: { position: "absolute", bottom: 0, height: 2, width: 32, borderRadius: 1, backgroundColor: colors.gold },

  // Big image cards
  bigCardList: { padding: 20, gap: 20 },
  bigCard: { borderRadius: 20, overflow: "hidden", width: "100%", aspectRatio: 1 },
  bigCardImage: { width: "100%", height: "100%" },
  bigCardGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: "55%",
    backgroundColor: "rgba(0,0,0,0)",
  },
  dateBadge: {
    position: "absolute", top: 12, right: 12,
    backgroundColor: "rgba(18,18,18,0.85)",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  dateBadgeMonth: { fontSize: 10, fontWeight: "800", color: colors.gold, letterSpacing: 1.5 },
  dateBadgeDay: { fontSize: 24, fontWeight: "800", color: colors.foreground, lineHeight: 28 },
  bigCardBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, padding: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  bigCardLocation: { fontSize: 11, fontWeight: "700", color: colors.gold, letterSpacing: 1, marginBottom: 4 },
  bigCardTitle: { fontSize: 20, fontWeight: "800", color: "#FFFFFF", lineHeight: 26 },

  // Calendar grid
  calNavRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 8 },
  calNavBtn: { padding: 8 },
  calNavLabel: { fontSize: 14, fontWeight: "600", color: colors.foregroundMuted },
  monthGrid: { marginBottom: 32 },
  monthTitle: { fontSize: 16, fontWeight: "800", color: colors.foreground, textAlign: "center", marginBottom: 10, textTransform: "capitalize" },
  weekdayRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  weekdayLabel: { textAlign: "center", fontSize: 10, fontWeight: "700", color: colors.foregroundMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  dayCircle: { overflow: "hidden" },
  dayCircleToday: { borderWidth: 2, borderColor: colors.gold },
  dayCircleEvent: { borderWidth: 1.5, borderColor: colors.gold + "80" },
  multiOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  multiCount: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  todayCircle: { backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  dayNum: { fontSize: 13, fontWeight: "500", color: colors.foregroundMuted + "99" },
  dayNumToday: { fontWeight: "800", color: colors.background },

  // Day popup modal
  popupBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  popupSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "80%", paddingHorizontal: 16, paddingTop: 4,
    borderTopWidth: 1, borderColor: colors.border,
  },
  popupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16 },
  popupDate: { fontSize: 22, fontWeight: "800", color: colors.foreground },
  popupClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  popupCard: { borderRadius: 16, overflow: "hidden", aspectRatio: 16 / 9 },
  popupCardImage: { width: "100%", height: "100%" },
  popupCardGradient: { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  popupCardContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 12 },
  popupCardTitle: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  popupCardLocation: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  popupCardLocationText: { fontSize: 11, color: "rgba(255,255,255,0.7)" },

  // Month pills
  pillRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 0,
    borderRadius: 20,
    width: 64,
    height: 44,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.foregroundMuted, textAlign: "center" },
  pillTextActive: { color: colors.background },
});
