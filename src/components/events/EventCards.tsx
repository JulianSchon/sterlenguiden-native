/**
 * Eventkorten på Kalender. Samma regler som korten på Favoriter: bilden med rundade hörn, all
 * text UNDER/BREDVID bilden (inget ovanpå), hjärtat till höger.
 *
 * Undantaget från "inget ovanpå bilden" är datumrutan i hörnet (30 / OKT) — den gör att man ser
 * när varje event är direkt, även när man bara skummar listan med ögonen.
 *
 * - EventHeroCard: det stora kortet överst på "För dig"
 * - EventRow: en kompakt rad (resten av "För dig", och dagens/månadens event på "Alla")
 *
 * `reason` är raden om varför eventet visas ("Hos en av dina favoritplatser") — det är den som
 * gör att "För dig" känns personlig.
 */
import { memo, useEffect } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Reanimated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import {
  CalendarDays, Compass, Footprints, Heart, MapPin, Navigation, Sparkles, type LucideIcon,
} from "lucide-react-native";
import type { Event } from "@/hooks/useEvents";
import { dateBadge, eventWhen, type Reason, type ReasonKind } from "@/lib/events";
import { HeartButton, type BurstFn } from "@/components/LikeHeart";

const CARD = "#1A1A1D";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD_LT = "#E8C674";
const RED = "#EF4444";
const LIVE = "#FF8000";

const REASON_ICON: Partial<Record<ReasonKind, LucideIcon>> = {
  saved: Heart,
  favoritePlace: Heart,
  visitedPlace: Footprints,
  category: Sparkles,
  nearby: Navigation,
  discover: Compass,
  tomorrow: CalendarDays,
  weekend: CalendarDays,
  soon: CalendarDays,
  later: CalendarDays,
};

interface CardProps {
  event: Event;
  reason?: Reason;
  saved: boolean;
  /** Eventet har redan varit (månadslistan på Alla) */
  past?: boolean;
  onOpen: (id: number) => void;
  onToggleSave: (id: number) => void;
  onBurst: BurstFn;
}

const where = (e: Event) => e.location ?? e.place?.name ?? null;

export const EventHeroCard = memo(function EventHeroCard({ event, reason, saved, onOpen, onToggleSave, onBurst }: CardProps) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onOpen(event.id)}>
      <View style={s.heroImage}>
        {event.image_url ? <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <DateBox event={event} style={s.heroDate} />
      </View>
      <View style={s.heroInfo}>
        <View style={{ flex: 1 }}>
          {reason && <ReasonLine reason={reason} size={13} />}
          <Text style={s.heroTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={s.heroMeta} numberOfLines={1}>
            {[eventWhen(event), where(event)].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <HeartButton isFav={saved} onToggle={() => onToggleSave(event.id)} onBurst={onBurst} label="sparade" />
      </View>
    </TouchableOpacity>
  );
});

export const EventRow = memo(function EventRow({ event, reason, saved, past, onOpen, onToggleSave, onBurst }: CardProps) {
  const place = where(event);
  return (
    <TouchableOpacity style={[s.row, past && { opacity: 0.55 }]} activeOpacity={0.9} onPress={() => onOpen(event.id)}>
      <View style={s.thumb}>
        {event.image_url ? <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <DateBox event={event} small style={s.thumbDate} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        {reason ? <ReasonLine reason={reason} size={12} /> : <Text style={s.rowWhen} numberOfLines={1}>{eventWhen(event).toUpperCase()}</Text>}
        <Text style={s.rowTitle} numberOfLines={2}>{event.title}</Text>
        {(reason || place) && (
          <View style={s.rowMeta}>
            {!reason && <MapPin size={12} color={MUTED} strokeWidth={2} />}
            <Text style={s.rowMetaText} numberOfLines={1}>
              {reason ? [eventWhen(event), place].filter(Boolean).join("  ·  ") : place}
            </Text>
          </View>
        )}
      </View>
      <HeartButton isFav={saved} onToggle={() => onToggleSave(event.id)} onBurst={onBurst} size={24} label="sparade" />
    </TouchableOpacity>
  );
});

/** Datumrutan i bildens hörn: dagen stort, månaden i guld under. Solid, så den syns mot alla bilder */
function DateBox({ event, small, style }: { event: Event; small?: boolean; style: object }) {
  const badge = dateBadge(event);
  if (!badge) return null;
  return (
    <View style={[s.date, small && s.dateSmall, style]}>
      <Text style={[s.dateDay, small && s.dateDaySmall]} numberOfLines={1}>{badge.day}</Text>
      <Text style={[s.dateMonth, small && s.dateMonthSmall]} numberOfLines={1}>{badge.month}</Text>
    </View>
  );
}

/** Varför eventet visas. "I dag" och "Pågår nu" får en lugnt pulserande prick i stället för en ikon */
function ReasonLine({ reason, size }: { reason: Reason; size: number }) {
  const live = reason.kind === "today" || reason.kind === "ongoing";
  const Icon = REASON_ICON[reason.kind];
  const color = live ? LIVE : GOLD_LT;
  return (
    <View style={s.reason}>
      {live ? <LiveDot /> : Icon ? (
        <Icon
          size={size}
          color={reason.kind === "saved" || reason.kind === "favoritePlace" ? RED : color}
          fill={reason.kind === "saved" || reason.kind === "favoritePlace" ? RED : "transparent"}
          strokeWidth={2.2}
        />
      ) : null}
      <Text style={[s.reasonText, { fontSize: size, color }]} numberOfLines={1}>{reason.text}</Text>
    </View>
  );
}

function LiveDot() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 1.6 }] }));
  return (
    <View style={s.liveWrap}>
      <Reanimated.View style={[s.liveDot, s.liveHalo, halo]} />
      <View style={s.liveDot} />
    </View>
  );
}

const s = StyleSheet.create({
  heroImage: { width: "100%", aspectRatio: 1.3, borderRadius: 22, overflow: "hidden", backgroundColor: "#2A2A2A" },
  heroDate: { position: "absolute", top: 12, right: 12 },
  thumbDate: { position: "absolute", top: 5, left: 5 },
  date: {
    minWidth: 54, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 8, borderRadius: 14, alignItems: "center",
    backgroundColor: "#121212", borderWidth: 1, borderColor: "rgba(197,160,89,0.30)",
  },
  dateSmall: { minWidth: 34, paddingHorizontal: 5, paddingTop: 3, paddingBottom: 4, borderRadius: 9 },
  dateDay: { fontFamily: "Montserrat_700Bold", fontSize: 22, lineHeight: 26, color: FG },
  dateDaySmall: { fontSize: 14, lineHeight: 17 },
  dateMonth: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5, color: GOLD_LT },
  dateMonthSmall: { fontSize: 8, letterSpacing: 1 },
  heroInfo: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 14, paddingHorizontal: 2 },
  heroTitle: { fontFamily: "Montserrat_700Bold", fontSize: 22, letterSpacing: -0.3, color: FG, marginTop: 6 },
  heroMeta: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, marginTop: 6 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 18,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  thumb: { width: 84, height: 84, borderRadius: 14, overflow: "hidden", backgroundColor: "#2A2A2A" },
  rowWhen: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1, color: GOLD_LT },
  rowTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, letterSpacing: -0.2, color: FG },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowMetaText: { flexShrink: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED },

  reason: { flexDirection: "row", alignItems: "center", gap: 6 },
  reasonText: { flexShrink: 1, fontFamily: "Inter_600SemiBold" },
  liveWrap: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE },
  liveHalo: { position: "absolute" },
});
