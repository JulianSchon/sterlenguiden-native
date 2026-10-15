/**
 * Sökets delar: raderna (plats, evenemang, ort, historik), svarskorten överst ("Bästa träff",
 * "Fika i Kivik", orten) och chipsen för det söket förstått.
 *
 * Samma regler som korten i resten av appen: bilden med rundade hörn och all text under/bredvid
 * (inget ovanpå bilden, utom evenemangens datumruta), hjärtat till höger. Kategorin syns som en
 * prick i samma färg som på kartans nålar.
 */
import { memo } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type TextStyle } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { STORY_GRADIENT } from "@/theme/storyGradient";
import {
  CalendarDays, Clock, Map as MapIcon, MapPin, Navigation, Search as SearchIcon, X, type LucideIcon,
} from "lucide-react-native";
import { firstImageUrl, type Place } from "@/hooks/usePlaces";
import type { Event } from "@/hooks/useEvents";
import { findCategory, withAlpha, type CategoryId } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import { distanceLabel } from "@/lib/mapFilters";
import { eventWhen } from "@/lib/events";
import { normChars, type OpenInfo, type PlaceHit } from "@/lib/search";
import { DateBox } from "@/components/events/EventCards";
import { HeartButton, type BurstFn } from "@/components/LikeHeart";

/** Kategoriprickarna — samma färger som kartans nålar (scripts/render-map-pins.js) */
export const CATEGORY_DOT: Record<"dark" | "light", Record<CategoryId, string>> = {
  dark: {
    "mat-dryck": "#C23A5E", "hotell-bb": "#3F7BEA", "cafe-bageri": "#D4BE86", "butiker": "#EA6A35",
    "natur-upplevelser": "#2BA36A", "aktiviteter": "#2499C2", "sevardheter": "#A55BE0", "hantverk-service": "#A7AFBC",
  },
  light: {
    "mat-dryck": "#881337", "hotell-bb": "#1E3A8A", "cafe-bageri": "#B39A5C", "butiker": "#C2410C",
    "natur-upplevelser": "#064E3B", "aktiviteter": "#0C4A6E", "sevardheter": "#581C87", "hantverk-service": "#6B7280",
  },
};

/** Öppet/stängt — klara färger som syns i båda temana */
export function useOpenColors() {
  const dark = useTheme().scheme === "dark";
  return dark ? { open: "#4ADE80", closed: "#F87171" } : { open: "#15803D", closed: "#B91C1C" };
}

// ── Småbitar ─────────────────────────────────────────────────────────────────

/** Texten med det man sökt på markerat (guld, fetare) */
export function Highlight({ text, tokens, style, mark }: {
  text: string; tokens: string[]; style: StyleProp<TextStyle>; mark: StyleProp<TextStyle>;
}) {
  const plain = normChars(text);
  const ranges: [number, number][] = [];
  tokens.forEach((t) => {
    if (t.length < 2) return;
    // Helst i början av ett ord
    let at = -1;
    for (let i = plain.indexOf(t); i >= 0; i = plain.indexOf(t, i + 1)) {
      if (i === 0 || !/[a-z0-9]/.test(plain[i - 1])) { at = i; break; }
      if (at < 0) at = i;
    }
    if (at >= 0) ranges.push([at, at + t.length]);
  });
  if (ranges.length === 0) return <Text style={style} numberOfLines={2}>{text}</Text>;
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: { s: string; on: boolean }[] = [];
  let pos = 0;
  ranges.forEach(([a, b]) => {
    if (a < pos) return;
    if (a > pos) parts.push({ s: text.slice(pos, a), on: false });
    parts.push({ s: text.slice(a, b), on: true });
    pos = b;
  });
  if (pos < text.length) parts.push({ s: text.slice(pos), on: false });
  return (
    <Text style={style} numberOfLines={2}>
      {parts.map((p, i) => (p.on ? <Text key={i} style={mark}>{p.s}</Text> : p.s))}
    </Text>
  );
}

function Thumb({ uri, size, radius = 12, children }: { uri: string | null; size: number; radius?: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", backgroundColor: colors.fill }}>
      {uri ? <ExpoImage source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" /> : null}
      {children}
    </View>
  );
}

/** "● Café & Bageri · Kivik" */
export function CategoryLine({ place, extra }: { place: Place; extra?: string | null }) {
  const { colors, scheme } = useTheme();
  const cat = findCategory(place.category);
  const parts = [cat?.label ?? "Plats", place.nearest_town, extra].filter(Boolean);
  return (
    <View style={s.catLine}>
      <View style={[s.dot, { backgroundColor: cat ? CATEGORY_DOT[scheme][cat.id] : colors.faint }]} />
      <Text style={[s.meta, { color: colors.muted }]} numberOfLines={1}>{parts.join("  ·  ")}</Text>
    </View>
  );
}

function OpenLabel({ open }: { open: OpenInfo | null }) {
  const c = useOpenColors();
  if (!open) return null;
  return <Text style={[s.open, { color: open.open ? c.open : c.closed }]}>{open.label}</Text>;
}

// ── Rader ────────────────────────────────────────────────────────────────────

export const PlaceResultRow = memo(function PlaceResultRow({ hit, tokens, onPress }: {
  hit: PlaceHit; tokens: string[]; onPress: (place: Place) => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => onPress(hit.place)}>
      <Thumb uri={firstImageUrl(hit.place.image_url)} size={60} />
      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Highlight text={hit.place.name} tokens={tokens} style={[s.rowTitle, { color: colors.text }]} mark={{ color: colors.goldText }} />
          {hit.km != null && <Text style={[s.km, { color: colors.faint }]}>{distanceLabel(hit.km)}</Text>}
        </View>
        <CategoryLine place={hit.place} />
        <OpenLabel open={hit.open} />
      </View>
    </TouchableOpacity>
  );
});

export const EventResultRow = memo(function EventResultRow({ event, tokens, onPress }: {
  event: Event; tokens: string[]; onPress: (event: Event) => void;
}) {
  const { colors } = useTheme();
  const where = event.location ?? event.place?.name ?? null;
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => onPress(event)}>
      <Thumb uri={event.image_url ?? null} size={60}>
        <DateBox event={event} small style={s.thumbDate} />
      </Thumb>
      <View style={s.rowBody}>
        <Text style={[s.when, { color: colors.goldText }]} numberOfLines={1}>{eventWhen(event).toUpperCase()}</Text>
        <Highlight text={event.title ?? ""} tokens={tokens} style={[s.title, { color: colors.text }]} mark={{ color: colors.goldText }} />
        {!!where && <Text style={[s.meta, { color: colors.muted }]} numberOfLines={1}>{where}</Text>}
      </View>
    </TouchableOpacity>
  );
});

/** Vad som finns i en ort: en prick per slags ställe, i kartans färger (flest först) */
export function CategoryDots({ cats }: { cats: CategoryId[] }) {
  const { scheme } = useTheme();
  return (
    <View style={s.dots}>
      {cats.map((c) => <View key={c} style={[s.dotLg, { backgroundColor: CATEGORY_DOT[scheme][c] }]} />)}
    </View>
  );
}

/** En ort: namnet, hur många platser, och prickar för vad som finns där */
export function TownRow({ name, detail, cats, onPress }: {
  name: string; detail: string; cats: CategoryId[]; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPress}>
      <View style={[s.pinTile, { backgroundColor: colors.goldSoft }]}>
        <MapPin size={20} color={colors.gold} strokeWidth={2} />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.title, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        <Text style={[s.meta, { color: colors.muted }]}>{detail}</Text>
        {cats.length > 0 && <CategoryDots cats={cats} />}
      </View>
    </TouchableOpacity>
  );
}

/** En rad i historiken: det man öppnade (med bild) eller det man sökte på, och ett kryss */
export function HistoryRow({ kind, title, detail, image, event, onPress, onRemove }: {
  kind: "place" | "event" | "town" | "term";
  title: string;
  detail: string;
  image?: string | null;
  event?: Event;
  onPress: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const Icon: LucideIcon = kind === "town" ? MapPin : kind === "term" ? SearchIcon : CalendarDays;
  return (
    <View style={s.historyRow}>
      <TouchableOpacity style={s.historyMain} activeOpacity={0.7} onPress={onPress}>
        {kind === "place" || (kind === "event" && event) ? (
          <Thumb uri={image ?? null} size={48} radius={10}>
            {kind === "event" && event && <DateBox event={event} small style={s.thumbDateSmall} />}
          </Thumb>
        ) : (
          <View style={[s.historyIcon, { backgroundColor: colors.fill }]}>
            <Icon size={18} color={colors.muted} strokeWidth={2} />
          </View>
        )}
        <View style={s.rowBody}>
          <Text style={[s.historyTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[s.meta, { color: colors.muted }]} numberOfLines={1}>{detail}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} hitSlop={12} accessibilityLabel={`Ta bort ${title} ur historiken`}>
        <X size={18} color={colors.faint} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

// ── Svarskorten ──────────────────────────────────────────────────────────────

/** "Bästa träff": platsen själv, med det man oftast vill veta direkt */
export function PlaceAnswer({ hit, saved, onOpen, onMap, onNavigate, onToggleSave, onBurst }: {
  hit: PlaceHit;
  saved: boolean;
  onOpen: () => void;
  onMap: () => void;
  onNavigate: () => void;
  onToggleSave: () => void;
  onBurst: BurstFn;
}) {
  const { colors } = useTheme();
  const image = firstImageUrl(hit.place.image_url);
  return (
    <View>
      <Text style={[s.answerLabel, { color: colors.goldText }]}>BÄSTA TRÄFF</Text>
      <Pressable onPress={onOpen} style={[s.heroImage, { backgroundColor: colors.fill }]}>
        {image && <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" />}
      </Pressable>
      <View style={s.heroInfo}>
        <Pressable onPress={onOpen} style={{ flex: 1, gap: 5 }}>
          <Text style={[s.heroTitle, { color: colors.text }]} numberOfLines={2}>{hit.place.name}</Text>
          <CategoryLine place={hit.place} extra={hit.km != null ? distanceLabel(hit.km) : null} />
          <OpenLabel open={hit.open} />
        </Pressable>
        <HeartButton isFav={saved} onToggle={onToggleSave} onBurst={onBurst} />
      </View>
      <View style={s.heroActions}>
        <ActionButton Icon={MapIcon} label="Visa på kartan" onPress={onMap} />
        <ActionButton Icon={Navigation} label="Vägbeskrivning" onPress={onNavigate} />
      </View>
    </View>
  );
}

function ActionButton({ Icon, label, onPress }: { Icon: LucideIcon; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[s.action, { backgroundColor: colors.fill, borderColor: colors.border }]} activeOpacity={0.75} onPress={onPress}>
      <Icon size={16} color={colors.text} strokeWidth={2.2} />
      <Text style={[s.actionText, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export interface Chip {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** Ikonens färg (kategorins, som kartans prickar) — annars guld */
  color?: string;
  onRemove?: () => void;
  onPress?: () => void;
}

/** Sammanfattningen överst: vad söket förstått, hur många, och det viktigaste direkt */
export function SummaryAnswer({ Icon, tint, title, subtitle, chips, note }: {
  Icon: LucideIcon; tint: string; title: string; subtitle: string; chips: Chip[]; note?: string | null;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[s.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.summaryHead}>
        <View style={[s.summaryIcon, { backgroundColor: withAlpha(tint, scheme === "dark" ? 0.16 : 0.1) }]}>
          <Icon size={22} color={tint} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.summaryTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
          <Text style={[s.summarySub, { color: colors.muted }]}>{subtitle}</Text>
        </View>
      </View>
      {chips.length > 0 && (
        <View style={s.chips}>
          {chips.map((c) => <ChipView key={c.key} chip={c} />)}
        </View>
      )}
      {!!note && (
        <View style={[s.note, { borderTopColor: colors.border }]}>
          <Clock size={13} color={colors.muted} strokeWidth={2} style={{ marginTop: 2 }} />
          <Text style={[s.noteText, { color: colors.muted }]}>{note}</Text>
        </View>
      )}
    </View>
  );
}

export function ChipView({ chip }: { chip: Chip }) {
  const { colors } = useTheme();
  const { Icon } = chip;
  const body = (
    <>
      <Icon size={13} color={chip.color ?? colors.goldText} strokeWidth={2.2} />
      <Text style={[s.chipText, { color: colors.text }]}>{chip.label}</Text>
      {chip.onRemove && <X size={12} color={colors.muted} strokeWidth={2.4} />}
    </>
  );
  const style = [s.chip, { backgroundColor: colors.fill, borderColor: colors.goldBorder }];
  if (chip.onRemove || chip.onPress) {
    return (
      <TouchableOpacity
        style={style}
        activeOpacity={0.75}
        onPress={chip.onRemove ?? chip.onPress}
        accessibilityLabel={chip.onRemove ? `Ta bort ${chip.label}` : chip.label}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={style}>{body}</View>;
}

/** "Visa alla": en knapp i berättelsernas gradient (gult nere till vänster, orange uppe till höger) */
export function StoryButton({ label, onPress, wide }: { label: string; onPress: () => void; wide?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} hitSlop={wide ? undefined : 8} style={[s.story, wide && s.storyWide]}>
      <LinearGradient
        colors={STORY_GRADIENT.stops.map((x) => x.color) as [string, string, ...string[]]}
        locations={STORY_GRADIENT.stops.map((x) => parseFloat(x.offset) / 100) as [number, number, ...number[]]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={[s.storyText, wide && { fontSize: 14 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SectionHeader({ title, count, action, onAction, story }: {
  title: string; count?: number; action?: string; onAction?: () => void;
  /** Knappen i berättelsernas gradient ("Visa alla") i stället för guldtext */
  story?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.text }]}>
        {title}
        {count != null && <Text style={{ color: colors.faint }}>  {count}</Text>}
      </Text>
      {action && onAction && story && <StoryButton label={action} onPress={onAction} />}
      {action && onAction && !story && (
        <TouchableOpacity onPress={onAction} hitSlop={10}>
          <Text style={[s.sectionAction, { color: colors.goldText }]}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  dots: { flexDirection: "row", gap: 5, marginTop: 2 },
  dotLg: { width: 9, height: 9, borderRadius: 4.5 },
  pinTile: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  catLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  meta: { flexShrink: 1, fontFamily: "Inter_400Regular", fontSize: 13 },
  open: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },

  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 9 },
  rowBody: { flex: 1, gap: 4 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 15.5, letterSpacing: -0.2 },
  rowTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15.5, letterSpacing: -0.2 },
  km: { fontFamily: "Inter_500Medium", fontSize: 12.5, marginTop: 2, fontVariant: ["tabular-nums"] },
  when: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 },
  thumbDate: { position: "absolute", top: 5, left: 5 },
  thumbDateSmall: { position: "absolute", top: 3, left: 3, transform: [{ scale: 0.82 }] },

  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7 },
  historyMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  historyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  historyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },

  answerLabel: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.6, marginBottom: 10 },
  heroImage: { height: 190, borderRadius: 18, overflow: "hidden" },
  heroInfo: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 14, paddingHorizontal: 2 },
  heroTitle: { fontFamily: "Montserrat_700Bold", fontSize: 21, letterSpacing: -0.3 },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  action: {
    flex: 1, height: 42, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  actionText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  summary: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  summaryIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  summaryTitle: { fontFamily: "Montserrat_700Bold", fontSize: 19, letterSpacing: -0.3 },
  summarySub: { fontFamily: "Inter_400Regular", fontSize: 13.5, marginTop: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12.5 },
  note: { flexDirection: "row", gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  noteText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18 },

  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 6 },
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2 },
  sectionAction: { fontFamily: "Inter_600SemiBold", fontSize: 13.5 },
  story: { height: 30, paddingHorizontal: 13, borderRadius: 15, overflow: "hidden", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  storyWide: { height: 44, borderRadius: 12, alignSelf: "stretch", marginTop: 10 },
  storyText: { fontFamily: "Inter_700Bold", fontSize: 12.5, color: "#121212" },
});
