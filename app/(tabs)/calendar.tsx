import { useState, useMemo, useCallback } from "react";
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView, Modal,
  Dimensions, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Flame, CalendarDays, LayoutGrid, ChevronLeft, ChevronRight, X, MapPin } from "lucide-react-native";
import { useEvents, type Event } from "@/hooks/useEvents";
import { usePopularEvents } from "@/hooks/usePopularEvents";
import { colors } from "@/lib/colors";
import {
  format, eachDayOfInterval, startOfMonth, endOfMonth,
  addMonths, subMonths, isToday, getDay, parseISO,
} from "date-fns";
import { sv } from "date-fns/locale";

type EventTab = "popular" | "calendar" | "month";

const SCREEN_WIDTH = Dimensions.get("window").width;

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
      {/* Gradient overlay — simulated with semi-transparent view */}
      <View style={s.bigCardGradient} />

      {/* Date badge top-right */}
      {badge.day ? (
        <View style={s.dateBadge}>
          <Text style={s.dateBadgeMonth}>{badge.month.toUpperCase()}</Text>
          <Text style={s.dateBadgeDay}>{badge.day}</Text>
        </View>
      ) : null}

      {/* Title + location bottom */}
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
  const cellSize = (SCREEN_WIDTH - 40 - 6 * 4) / 7; // 40px padding, 6 gaps of 4

  return (
    <View style={s.monthGrid}>
      <Text style={s.monthTitle}>
        {format(month, "MMMM yyyy", { locale: sv }).charAt(0).toUpperCase() +
          format(month, "MMMM yyyy", { locale: sv }).slice(1)}
      </Text>

      {/* Weekday headers */}
      <View style={s.weekdayRow}>
        {WEEKDAYS.map((wd) => (
          <Text key={wd} style={[s.weekdayLabel, { width: cellSize }]}>{wd}</Text>
        ))}
      </View>

      {/* Day cells */}
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
      {/* Navigation */}
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
  "Jan", "Feb", "Mars", "Apr", "Maj", "Juni",
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
      {/* Month pills */}
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
            <Text style={[s.pillText, selectedMonth === idx && s.pillTextActive]}>{name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Event list */}
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<EventTab>("popular");
  const { data: allEvents = [], isLoading } = useEvents();
  const { data: popularEvents = [], isLoading: isLoadingPopular } = usePopularEvents();

  const handleEventPress = useCallback((id: number) => {
    router.push(`/event/${id}` as any);
  }, [router]);

  const loading = activeTab === "popular" ? isLoadingPopular : isLoading;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Evenemang</Text>
        <Text style={s.headerSub}>Upptäck vad som händer på Österlen</Text>
      </View>

      {/* Tabs */}
      <EventTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Content */}
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
    // Simulated gradient — bottom is dark
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
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, width: 64,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center",
  },
  pillActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.foregroundMuted, textAlign: "center" },
  pillTextActive: { color: colors.background },
});
