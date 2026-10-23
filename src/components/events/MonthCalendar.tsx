/**
 * Månadskalendern på Kalender → Alla. Varje dag med ett event är en rund bild från eventet med
 * siffran ovanpå; dagar utan event är bara siffran. Idag har en ring i berättelsernas gradient
 * (gult nere till vänster → orange uppe till höger), passerade dagar är dämpade. Fler event samma
 * dag syns som en liten siffra i hörnet, ett sparat event som ett litet hjärta.
 *
 * När månaden visas poppar bildcirklarna in en i taget (kort efter varandra).
 */
import { memo, useEffect, useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { ZoomIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Heart } from "lucide-react-native";
import { eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from "date-fns";
import { weekdayShort } from "@/i18n/dates";
import type { Event } from "@/hooks/useEvents";
import { dayKey } from "@/lib/events";
import { STORY_GRADIENT } from "@/theme/storyGradient";

const BG = "#121212";
const FG = "#F5F1E8";
const GOLD = "#C5A059";
const RED = "#EF4444";
/** MÅN … SÖN / MON … SUN / MO … SO */
const weekdays = () => Array.from({ length: 7 }, (_, i) => weekdayShort(i).toUpperCase());
/** Ringarna (idag, vald dag) ligger så här mycket utanför bildcirkeln */
const RING_GAP = 3;

export function MonthCalendar({
  month, width, eventsByDay, today, selected, savedIds, matches, onSelect,
}: {
  month: Date;
  width: number;
  eventsByDay: Map<string, Event[]>;
  today: string;
  selected: string | null;
  savedIds: Set<number>;
  /** Filtret: dagar utan något matchande event dämpas */
  matches: (e: Event) => boolean;
  onSelect: (day: string) => void;
}) {
  const cell = Math.floor(width / 7);
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  // Veckan börjar på måndag
  const offset = (getDay(startOfMonth(month)) + 6) % 7;
  let order = 0;

  return (
    <View style={{ width: cell * 7, alignSelf: "center" }}>
      <View style={s.weekRow}>
        {weekdays().map((w) => <Text key={w} style={[s.weekday, { width: cell }]}>{w}</Text>)}
      </View>
      <View style={s.grid}>
        {Array.from({ length: offset }, (_, i) => <View key={`blank-${i}`} style={{ width: cell, height: cell }} />)}
        {days.map((d) => {
          const key = dayKey(d);
          const events = eventsByDay.get(key) ?? NONE;
          return (
            <DayCell
              key={key}
              day={key}
              label={format(d, "d")}
              size={cell}
              events={events}
              matches={matches}
              isToday={key === today}
              isPast={key < today}
              isSelected={key === selected}
              saved={events.some((e) => savedIds.has(e.id) && matches(e))}
              order={events.length > 0 ? order++ : 0}
              onPress={onSelect}
            />
          );
        })}
      </View>
    </View>
  );
}

// Samma tomma lista för alla dagar utan event, så dagens ruta inte ritas om i onödan
const NONE: Event[] = [];

/** En dag. Ritas bara om när just den dagen ändras (vald, sparad, filtret) — inte vid varje tryck */
const DayCell = memo(function DayCell({
  day, label, size, events: all, matches, isToday, isPast, isSelected, saved, order, onPress,
}: {
  day: string; label: string; size: number; events: Event[]; matches: (e: Event) => boolean;
  isToday: boolean; isPast: boolean; isSelected: boolean; saved: boolean; order: number;
  onPress: (day: string) => void;
}) {
  // Filtret: matchar inget av dagens event dämpas dagen (men bilden ligger kvar)
  const visible = useMemo(() => all.filter(matches), [all, matches]);
  const events = visible.length > 0 ? visible : all;
  const dimmed = all.length > 0 && visible.length === 0;
  const circle = size - 8;
  const ring = circle + RING_GAP * 2;
  const first = events[0];

  // Vald dag: cirkeln växer lite och får en vit ring
  const sel = useSharedValue(isSelected ? 1 : 0);
  useEffect(() => {
    sel.value = withSpring(isSelected ? 1 : 0, { damping: 15, stiffness: 280 });
  }, [isSelected, sel]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scale: 1 + sel.value * 0.07 }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: sel.value, transform: [{ scale: 0.88 + sel.value * 0.12 }] }));

  return (
    <Pressable
      onPress={() => onPress(day)}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessibilityLabel={first ? `${label}: ${events.map((e) => e.title).join(", ")}` : label}
    >
      <Reanimated.View
        style={[
          { width: circle, height: circle, alignItems: "center", justifyContent: "center" },
          { opacity: dimmed ? 0.2 : isPast ? 0.4 : 1 },
          grow,
        ]}
      >
        {first && (
          <Reanimated.View
            entering={ZoomIn.delay(order * 18).duration(280)}
            style={[s.photo, { width: circle, height: circle, borderRadius: circle / 2 }]}
          >
            {first.image_url ? <Image source={{ uri: first.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            {/* Mörkare så siffran alltid går att läsa, oavsett bild */}
            <View style={[StyleSheet.absoluteFill, s.shade]} />
          </Reanimated.View>
        )}
        <Text style={[s.num, first ? s.numOnPhoto : isToday ? s.numToday : null]}>{label}</Text>

        {isToday && (
          <View style={[s.ringAnchor, { width: ring, height: ring, left: -RING_GAP, top: -RING_GAP }]} pointerEvents="none">
            <TodayRing size={ring} />
          </View>
        )}
        <Reanimated.View
          pointerEvents="none"
          style={[s.ringAnchor, s.selectedRing, { width: ring, height: ring, borderRadius: ring / 2, left: -RING_GAP, top: -RING_GAP }, ringStyle]}
        />

        {events.length > 1 && (
          <View style={s.count}>
            <Text style={s.countText}>{events.length}</Text>
          </View>
        )}
        {saved && (
          <View style={s.saved}>
            <Heart size={8} color={RED} fill={RED} strokeWidth={2} />
          </View>
        )}
      </Reanimated.View>
    </Pressable>
  );
});

/** Ringen runt idag — samma gradient och riktning som ringen runt en ny berättelse på Hem */
function TodayRing({ size }: { size: number }) {
  const stroke = 2.5;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id="todayRing" x1={STORY_GRADIENT.x1} y1={STORY_GRADIENT.y1} x2={STORY_GRADIENT.x2} y2={STORY_GRADIENT.y2}>
          {STORY_GRADIENT.stops.map((st) => <Stop key={st.offset} offset={st.offset} stopColor={st.color} />)}
        </LinearGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={(size - stroke) / 2} stroke="url(#todayRing)" strokeWidth={stroke} fill="none" />
    </Svg>
  );
}

const s = StyleSheet.create({
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekday: { textAlign: "center", fontFamily: "Inter_600SemiBold", fontSize: 10.5, letterSpacing: 1, color: "rgba(245,241,232,0.45)" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  photo: { position: "absolute", overflow: "hidden", backgroundColor: "rgba(197,160,89,0.35)" },
  shade: { backgroundColor: "rgba(0,0,0,0.28)" },
  num: { fontFamily: "Inter_500Medium", fontSize: 14, color: "rgba(245,241,232,0.8)" },
  numOnPhoto: {
    fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  numToday: { fontFamily: "Inter_700Bold", color: FG },
  ringAnchor: { position: "absolute" },
  selectedRing: { borderWidth: 2, borderColor: "#FFFFFF" },
  count: {
    position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    alignItems: "center", justifyContent: "center", backgroundColor: GOLD, borderWidth: 1.5, borderColor: BG,
  },
  countText: { fontFamily: "Inter_700Bold", fontSize: 9.5, color: BG },
  saved: {
    position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8,
    alignItems: "center", justifyContent: "center", backgroundColor: BG,
  },
});
