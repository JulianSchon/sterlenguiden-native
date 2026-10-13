/**
 * Kalender — två lägen, valda med rubriken överst (FÖR DIG · ALLA, som topp-flikarna i de stora
 * apparna):
 *
 * - För dig: EN lista rankad för just den här användaren (src/lib/events.ts), med ett skäl per
 *   event ("Hos en av dina favoritplatser", "Du gillar mat & dryck" …). Överst det bästa valet
 *   som ett stort kort, resten som rader. Fungerar lika bra med tre event som med trettio.
 * - Alla: månadskalendern där varje dag med ett event är en rund bild (MonthCalendar). Under den
 *   månadens event; trycker man på en dag visas bara den dagens, trycker man på eventet (eller
 *   dagen igen när den bara har ett) öppnas eventets panel. Kategorifiltret dämpar dagarna som
 *   inte matchar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { CalendarHeart, ChevronLeft, ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { addMonths, format, max as maxDate, min as minDate, parseISO, startOfMonth } from "date-fns";
import { sv } from "date-fns/locale";
import { useEvents, type Event } from "@/hooks/useEvents";
import { useFavorites, useToggleEventFavorite } from "@/hooks/useFavorites";
import { useVisits } from "@/hooks/useVisits";
import { usePlaces } from "@/hooks/usePlaces";
import { useProfile } from "@/hooks/useProfile";
import { useKnownLocation } from "@/hooks/useUserLocation";
import { registerScrollCallback } from "@/lib/scrollRefs";
import {
  EVENT_CATEGORIES, dayKey, eventDays, lastDay, likedCategories, recommendEvents, type EventPick,
} from "@/lib/events";
import { EventBottomSheet } from "@/components/events/EventSheet";
import { EventHeroCard, EventRow } from "@/components/events/EventCards";
import { MonthCalendar } from "@/components/events/MonthCalendar";
import { LikeBurst, useLikeBurst, type BurstFn } from "@/components/LikeHeart";
import { CategoryHeader } from "@/components/CategoryHeader";
import { Skeleton } from "@/components/Skeleton";
import { FLOATING_NAV_HEIGHT } from "@/components/navigation/FloatingNav";
import { darkColors } from "@/theme/colors";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const GOLD_LT = "#E8C674";

type Mode = "foryou" | "all";
const MODES: { id: Mode; label: string }[] = [
  { id: "foryou", label: "För dig" },
  { id: "all", label: "Alla" },
];
/** Så många visas på "För dig" — resten finns i kalendern */
const FOR_YOU_MAX = 12;

/** Snabb inglidning för de första korten/raderna, kort efter varandra */
const enterAt = (index: number) => (index < 8 ? FadeInDown.delay(index * 45).duration(300) : undefined);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("foryou");
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: events = [], isLoading } = useEvents();
  const { data: favorites = [] } = useFavorites();
  const { data: visits = [] } = useVisits();
  const { data: places = [] } = usePlaces();
  const { data: profile } = useProfile();
  const location = useKnownLocation();

  // Sparade event, och vad man gillar (favoritplatser, besök) — det "För dig" rankar efter
  const savedIds = useMemo(() => new Set(favorites.flatMap((f) => (f.event_id != null ? [f.event_id] : []))), [favorites]);
  const favoritePlaceIds = useMemo(() => new Set(favorites.flatMap((f) => (f.place_id != null ? [f.place_id] : []))), [favorites]);
  const visitedPlaceIds = useMemo(() => new Set(visits.map((v) => v.place_id)), [visits]);
  const picks = useMemo(() => recommendEvents({
    events,
    places,
    favoritePlaceIds,
    savedEventIds: savedIds,
    visitedPlaceIds,
    categoryCounts: likedCategories(places, visitedPlaceIds, favoritePlaceIds),
    location,
  }).slice(0, FOR_YOU_MAX), [events, places, favoritePlaceIds, savedIds, visitedPlaceIds, location]);

  // Spara-hjärtat: samma som på Favoriter, sparas direkt
  const { burst, show: showBurst } = useLikeBurst();
  const toggle = useToggleEventFavorite();
  const savedRef = useRef(savedIds);
  savedRef.current = savedIds;
  const toggleSave = useCallback((id: number) => {
    toggle.mutate({ eventId: id, save: !savedRef.current.has(id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fliktrycket i navigeringen scrollar upp det läge som visas
  const forYouRef = useRef<ScrollView>(null);
  const allRef = useRef<ScrollView>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    registerScrollCallback("calendar", () => {
      (modeRef.current === "foryou" ? forYouRef : allRef).current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null;
  const bottomPad = FLOATING_NAV_HEIGHT + insets.bottom + 110;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: Math.max(insets.top, 44), paddingHorizontal: 16, backgroundColor: BG }}>
        <ModeTabs value={mode} onChange={setMode} />
      </View>

      {mode === "foryou" ? (
        <Reanimated.View key="foryou" entering={FadeIn.duration(200)} style={{ flex: 1 }}>
          <ForYouView
            scrollRef={forYouRef}
            loading={isLoading}
            picks={picks}
            firstName={firstName}
            savedIds={savedIds}
            bottomPad={bottomPad}
            onOpen={setOpenId}
            onToggleSave={toggleSave}
            onBurst={showBurst}
            onShowAll={() => setMode("all")}
          />
        </Reanimated.View>
      ) : (
        <Reanimated.View key="all" entering={FadeIn.duration(200)} style={{ flex: 1 }}>
          <AllEventsView
            scrollRef={allRef}
            loading={isLoading}
            events={events}
            savedIds={savedIds}
            bottomPad={bottomPad}
            onOpen={setOpenId}
            onToggleSave={toggleSave}
            onBurst={showBurst}
          />
        </Reanimated.View>
      )}

      <EventBottomSheet eventId={openId} onClose={() => setOpenId(null)} />
      <LikeBurst burst={burst} />
    </View>
  );
}

// ─── Lägena ───────────────────────────────────────────────────────────────────

/**
 * FÖR DIG · ALLA som sidans rubrik: det valda i vitt med ett guldstreck under som glider dit man
 * trycker, det andra nedtonat.
 */
function ModeTabs({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const layouts = useRef<Partial<Record<Mode, { x: number; w: number }>>>({});
  const barX = useSharedValue(0);
  const barW = useSharedValue(0);
  const place = (m: Mode, animate: boolean) => {
    const l = layouts.current[m];
    if (!l) return;
    // Strecket är halva ordets bredd, centrerat under det
    const x = l.x + l.w * 0.25;
    const w = l.w * 0.5;
    const cfg = { duration: 280, easing: Easing.out(Easing.cubic) };
    barX.value = animate ? withTiming(x, cfg) : x;
    barW.value = animate ? withTiming(w, cfg) : w;
  };
  useEffect(() => {
    place(value, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bar = useAnimatedStyle(() => ({ width: barW.value, transform: [{ translateX: barX.value }] }));

  return (
    <View style={s.tabs}>
      {MODES.map((m) => (
        <ModeLabel
          key={m.id}
          label={m.label}
          active={m.id === value}
          onPress={() => {
            if (m.id === value) return;
            Haptics.selectionAsync().catch(() => {});
            onChange(m.id);
          }}
          onLayout={(x, w) => {
            layouts.current[m.id] = { x, w };
            if (m.id === value) place(m.id, false);
          }}
        />
      ))}
      <Reanimated.View style={[s.tabBar, bar]} />
    </View>
  );
}

function ModeLabel({ label, active, onPress, onLayout }: {
  label: string; active: boolean; onPress: () => void; onLayout: (x: number, w: number) => void;
}) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 220 });
  }, [active, on]);
  const style = useAnimatedStyle(() => ({ opacity: 0.32 + on.value * 0.68 }));
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Reanimated.Text style={[s.tabText, style]}>{label}</Reanimated.Text>
    </TouchableOpacity>
  );
}

// ─── För dig ──────────────────────────────────────────────────────────────────

interface ListProps {
  scrollRef: React.RefObject<ScrollView | null>;
  loading: boolean;
  savedIds: Set<number>;
  bottomPad: number;
  onOpen: (id: number) => void;
  onToggleSave: (id: number) => void;
  onBurst: BurstFn;
}

function ForYouView({
  scrollRef, loading, picks, firstName, savedIds, bottomPad, onOpen, onToggleSave, onBurst, onShowAll,
}: ListProps & { picks: EventPick[]; firstName: string | null; onShowAll: () => void }) {
  if (loading) return <ForYouSkeleton />;

  if (picks.length === 0) {
    return (
      <Reanimated.View entering={FadeInDown.duration(300)} style={s.empty}>
        <View style={s.emptyIcon}>
          <CalendarHeart size={28} color={GOLD} strokeWidth={1.5} />
        </View>
        <Text style={s.emptyTitle}>Lugnt på Österlen just nu</Text>
        <Text style={s.emptyText}>
          Inga kommande event än. När företagen lägger ut nya hamnar de som passar dig här.
        </Text>
        <TouchableOpacity style={s.emptyBtn} onPress={onShowAll}>
          <Text style={s.emptyBtnText}>Se kalendern</Text>
        </TouchableOpacity>
      </Reanimated.View>
    );
  }

  const [hero, ...rest] = picks;
  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: bottomPad }}
    >
      {/* Samma hälsning som Förmåner: namnet, och en rad i guld om vad som väntar */}
      <Reanimated.View entering={enterAt(0)}>
        <Text style={s.greeting} numberOfLines={1}>{firstName ? `Hej ${firstName}` : "Hej"}</Text>
        <Text style={s.greetingLine} numberOfLines={1} adjustsFontSizeToFit>
          {picks.length === 1 ? "Det här tror vi du gillar" : `${picks.length} saker vi tror du gillar`}
        </Text>
      </Reanimated.View>

      <Reanimated.View entering={enterAt(1)} style={{ marginTop: 22 }}>
        <EventHeroCard
          event={hero.event}
          reason={hero.reason}
          saved={savedIds.has(hero.event.id)}
          onOpen={onOpen}
          onToggleSave={onToggleSave}
          onBurst={onBurst}
        />
      </Reanimated.View>

      {rest.length > 0 && (
        <>
          <Reanimated.View entering={enterAt(2)}>
            <Text style={s.sectionTitle}>Mer för dig</Text>
          </Reanimated.View>
          <View style={{ gap: 12 }}>
            {rest.map((p, i) => (
              <Reanimated.View key={p.event.id} entering={enterAt(i + 3)}>
                <EventRow
                  event={p.event}
                  reason={p.reason}
                  saved={savedIds.has(p.event.id)}
                  onOpen={onOpen}
                  onToggleSave={onToggleSave}
                  onBurst={onBurst}
                />
              </Reanimated.View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function ForYouSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10 }} pointerEvents="none">
      <Skeleton tone="dark" width={130} height={26} radius={8} />
      <Skeleton tone="dark" width={230} height={26} radius={8} style={{ marginTop: 6 }} />
      <Skeleton tone="dark" width="100%" radius={22} style={{ aspectRatio: 1.3, marginTop: 22 }} />
      <View style={{ gap: 8, marginTop: 14 }}>
        <Skeleton tone="dark" width="45%" height={12} radius={5} />
        <Skeleton tone="dark" width="70%" height={20} radius={6} />
        <Skeleton tone="dark" width="55%" height={13} radius={5} />
      </View>
    </View>
  );
}

// ─── Alla ─────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS = ["Alla kategorier", ...EVENT_CATEGORIES];

function AllEventsView({
  scrollRef, loading, events, savedIds, bottomPad, onOpen, onToggleSave, onBurst,
}: ListProps & { events: Event[] }) {
  const { width, height } = useWindowDimensions();
  const today = dayKey(new Date());
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const [catIndex, setCatIndex] = useState(0);
  const matches = useCallback(
    (e: Event) => catIndex === 0 || e.main_category === EVENT_CATEGORIES[catIndex - 1],
    [catIndex],
  );

  // Varje dag → dess event (ett flerdagarsevent ligger på varje dag), tidigast först
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      for (const d of eventDays(e)) map.set(d, [...(map.get(d) ?? []), e]);
    }
    for (const list of map.values()) list.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
    return map;
  }, [events]);

  // Månaderna man kan bläddra mellan: från första eventet till ett halvår fram (minst)
  const thisMonth = startOfMonth(new Date());
  const dated = events.filter((e) => e.date).map((e) => parseISO(e.date!));
  const firstMonth = startOfMonth(minDate([thisMonth, ...dated]));
  const lastMonth = startOfMonth(maxDate([addMonths(thisMonth, 6), ...dated]));
  const canStep = (dir: 1 | -1) => {
    const next = addMonths(month, dir);
    return next >= firstMonth && next <= lastMonth;
  };
  const step = (dir: 1 | -1) => {
    if (!canStep(dir)) return;
    Haptics.selectionAsync().catch(() => {});
    setMonth((m) => addMonths(m, dir));
    setSelected(null);
  };
  // Svep åt sidan på kalendern byter månad
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (e.translationX < -50 || e.velocityX < -500) step(1);
      else if (e.translationX > 50 || e.velocityX > 500) step(-1);
    });

  // Listan under kalendern: hela månaden, eller bara den valda dagen
  const monthKey = format(month, "yyyy-MM");
  const monthEvents = useMemo(() => {
    const seen = new Set<number>();
    const list: Event[] = [];
    for (const [day, dayEvents] of [...eventsByDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (!day.startsWith(monthKey)) continue;
      for (const e of dayEvents) if (!seen.has(e.id) && matches(e)) { seen.add(e.id); list.push(e); }
    }
    return list;
  }, [eventsByDay, monthKey, matches]);
  const listEvents = selected ? (eventsByDay.get(selected) ?? []).filter(matches) : monthEvents;

  // Trycker man på en dag glider listan fram om den ligger under skärmkanten
  const scrollY = useRef(0);
  const listY = useRef(0);
  const visibleH = height - 260;
  const showList = () => {
    const want = listY.current + 170 - visibleH;
    if (want > scrollY.current) scrollRef.current?.scrollTo({ y: want, animated: true });
  };
  const selectDay = (day: string) => {
    if (day === selected) {
      // Andra trycket: en dag med ett enda event öppnar det, annars visas hela månaden igen
      const dayEvents = (eventsByDay.get(day) ?? []).filter(matches);
      if (dayEvents.length === 1) onOpen(dayEvents[0].id);
      else setSelected(null);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setSelected(day);
    showList();
  };

  const monthName = format(month, "LLLL", { locale: sv });
  const isThisMonth = monthKey === format(thisMonth, "yyyy-MM");

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={32}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomPad }}
    >
      {/* Månaden och pilarna */}
      <View style={s.monthHeader}>
        <Text style={s.monthTitle}>
          {cap(monthName)} <Text style={s.monthYear}>{format(month, "yyyy")}</Text>
        </Text>
        <View style={s.monthActions}>
          {!isThisMonth && (
            <TouchableOpacity
              style={s.todayBtn}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setMonth(thisMonth); setSelected(null); }}
            >
              <Text style={s.todayText}>Idag</Text>
            </TouchableOpacity>
          )}
          <ArrowButton dir={-1} disabled={!canStep(-1)} onPress={() => step(-1)} />
          <ArrowButton dir={1} disabled={!canStep(1)} onPress={() => step(1)} />
        </View>
      </View>

      <GestureDetector gesture={swipe}>
        <Reanimated.View key={monthKey} entering={FadeIn.duration(220)}>
          <MonthCalendar
            month={month}
            width={width - 32}
            eventsByDay={eventsByDay}
            today={today}
            selected={selected}
            savedIds={savedIds}
            matches={matches}
            onSelect={selectDay}
          />
        </Reanimated.View>
      </GestureDetector>

      <View style={{ marginTop: 20 }}>
        <CategoryHeader
          index={catIndex}
          labels={CATEGORY_LABELS}
          onStep={(dir) => { Haptics.selectionAsync().catch(() => {}); setCatIndex((i) => i + dir); }}
          palette={darkColors}
        />
      </View>

      <View onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }} style={{ marginTop: 6 }}>
        <Text style={s.sectionTitle}>
          {selected ? cap(format(parseISO(selected), "EEEE d MMMM", { locale: sv })) : `Hela ${monthName}`}
        </Text>

        {loading ? (
          <View style={{ gap: 12 }} pointerEvents="none">
            {[0, 1, 2].map((i) => <Skeleton key={i} tone="dark" height={108} radius={18} />)}
          </View>
        ) : listEvents.length === 0 ? (
          <Reanimated.View key={`none-${selected ?? monthKey}`} entering={FadeIn.duration(200)}>
            <Text style={s.none}>
              {selected
                ? "Inget händer den här dagen."
                : catIndex > 0 ? `Inga event inom ${CATEGORY_LABELS[catIndex].toLowerCase()} i ${monthName}.` : `Inga event i ${monthName} än.`}
            </Text>
          </Reanimated.View>
        ) : (
          <View key={`${selected ?? monthKey}-${catIndex}`} style={{ gap: 12 }}>
            {listEvents.map((e, i) => (
              <Reanimated.View key={e.id} entering={enterAt(i)}>
                <EventRow
                  event={e}
                  saved={savedIds.has(e.id)}
                  past={(lastDay(e) ?? "") < today}
                  onOpen={onOpen}
                  onToggleSave={onToggleSave}
                  onBurst={onBurst}
                />
              </Reanimated.View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ArrowButton({ dir, disabled, onPress }: { dir: 1 | -1; disabled: boolean; onPress: () => void }) {
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <TouchableOpacity
      style={[s.arrowBtn, disabled && { opacity: 0.3 }]}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={dir === 1 ? "Nästa månad" : "Föregående månad"}
    >
      <Icon size={20} color={FG} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // Lägena som rubrik — samma typsnitt och storlek som PROFIL
  tabs: { flexDirection: "row", alignItems: "center", gap: 26, height: 44, marginBottom: 10 },
  tabText: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: 2, textTransform: "uppercase", color: FG },
  tabBar: { position: "absolute", left: 0, bottom: 2, height: 3, borderRadius: 1.5, backgroundColor: GOLD_LT },

  greeting: { fontFamily: "Montserrat_700Bold", fontSize: 24, lineHeight: 30, letterSpacing: -0.5, color: FG },
  greetingLine: { fontFamily: "Montserrat_700Bold", fontSize: 24, lineHeight: 30, letterSpacing: -0.5, color: GOLD_LT },
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: FG, marginTop: 30, marginBottom: 12 },

  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  monthTitle: { fontFamily: "Montserrat_700Bold", fontSize: 24, letterSpacing: -0.4, color: FG },
  monthYear: { fontFamily: "Montserrat_700Bold", fontSize: 24, color: "rgba(245,241,232,0.35)" },
  monthActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  arrowBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  todayBtn: {
    height: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.45)",
  },
  todayText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: GOLD_LT },
  none: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: MUTED },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40, paddingBottom: 120 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(197,160,89,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: FG, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: MUTED, textAlign: "center" },
  emptyBtn: {
    marginTop: 6, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(197,160,89,0.45)",
  },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD_LT },
});
