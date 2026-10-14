/**
 * Kartans filter: ett ark som glider upp underifrån. Allt man väljer syns direkt på kartan bakom.
 *
 * - Kategorier: flera kan väljas (färgen är nålarnas färg på kartan)
 * - Praktiskt: öppet nu, parkering, wifi, hundvänligt … (filtrerar platserna)
 * - Service: toaletter, laddning, AutoMat, vård (egna, neutrala nålar)
 * - Mina listor: bara en listas platser, numrerade i listans ordning med en streckad rutt emellan
 * - Skatter: alla, de jag inte hittat, bara skatter, eller inga
 */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  Accessibility, Baby, CalendarCheck, Clock, Dog, Leaf, ParkingSquare, Sun, Wifi, X, Zap, Check, type LucideIcon,
} from "lucide-react-native";
import { CATEGORIES, type CategoryId } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import type { ListSummary } from "@/hooks/useLists";
import { ListCover } from "@/components/lists/ListCover";
import { PIN_COLORS, SERVICE_TYPES } from "./MapPins";

export type TreasureMode = "all" | "unfound" | "only" | "none";

export interface MapFilters {
  cats: Set<CategoryId>;
  amenities: Set<string>;
  services: Set<string>;
  listId: string | null;
  treasures: TreasureMode;
}

export const EMPTY_FILTERS: MapFilters = {
  cats: new Set(), amenities: new Set(), services: new Set(), listId: null, treasures: "all",
};

/** Platsens egenskaper (kolumnen amenities) — plus "öppet nu" som räknas ur öppettiderna */
export const AMENITIES: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "open_now", label: "Öppet nu", Icon: Clock },
  { id: "parking", label: "Parkering", Icon: ParkingSquare },
  { id: "wifi", label: "Wifi", Icon: Wifi },
  { id: "pets", label: "Hundvänligt", Icon: Dog },
  { id: "outdoor", label: "Uteservering", Icon: Sun },
  { id: "accessible", label: "Tillgänglighet", Icon: Accessibility },
  { id: "family", label: "Barnvänligt", Icon: Baby },
  { id: "vegetarian", label: "Vegetariskt", Icon: Leaf },
  { id: "ev_charging", label: "Laddstolpe", Icon: Zap },
  { id: "booking_required", label: "Bokning krävs", Icon: CalendarCheck },
];

const TREASURE_MODES: { id: TreasureMode; label: string }[] = [
  { id: "all", label: "Alla skatter" },
  { id: "unfound", label: "Ej hittade" },
  { id: "only", label: "Bara skatter" },
  { id: "none", label: "Inga skatter" },
];

/** Hur många filter som är valda (för siffran på filterknappen) */
export function countFilters(f: MapFilters): number {
  return f.cats.size + f.amenities.size + f.services.size + (f.listId ? 1 : 0) + (f.treasures !== "all" ? 1 : 0);
}

const toggled = <T,>(set: Set<T>, v: T) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
};

export function MapFilterSheet({
  open, filters, onChange, lists, resultLabel, onClose,
}: {
  open: boolean;
  filters: MapFilters;
  onChange: (f: MapFilters) => void;
  lists: ListSummary[];
  /** "Visa 34 platser" */
  resultLabel: string;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const sheetH = Math.round(height * 0.8);

  // Byggs första gången det öppnas och ligger sen kvar, så det bara glider upp/ner efter det
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(sheetH);
  const backdrop = useSharedValue(0);
  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      backdrop.value = withTiming(1, { duration: 260 });
    } else {
      backdrop.value = withTiming(0, { duration: 220 });
      y.value = withTiming(sheetH, { duration: 240, easing: Easing.in(Easing.quad) });
    }
  }, [open, sheetH, y, backdrop]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;

  const set = (patch: Partial<MapFilters>) => {
    Haptics.selectionAsync().catch(() => {});
    onChange({ ...filters, ...patch });
  };
  const sheetBg = dark ? "#151517" : "#FFFFFF";
  const chipBg = dark ? "#1F1F22" : "#F3F0E8";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Reanimated.View>

      <Reanimated.View style={[s.sheet, { height: sheetH, backgroundColor: sheetBg, borderColor: colors.border }, sheetStyle]}>
        <View style={[s.handle, { backgroundColor: colors.borderStrong }]} />
        <View style={s.head}>
          <Text style={[s.title, { color: colors.text }]}>FILTER</Text>
          <TouchableOpacity style={[s.close, { backgroundColor: colors.fill }]} onPress={onClose} hitSlop={8}>
            <X size={18} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
          {/* ── Kategorier ── */}
          <Text style={[s.section, { color: colors.muted }]}>KATEGORIER</Text>
          <View style={s.grid}>
            {CATEGORIES.map((c) => {
              const on = filters.cats.has(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.8}
                  onPress={() => set({ cats: toggled(filters.cats, c.id) })}
                  style={[s.catChip, { backgroundColor: chipBg, borderColor: on ? "#E2C47F" : "transparent" }]}
                >
                  <View style={[s.catDot, { backgroundColor: PIN_COLORS[c.id] }]} />
                  <Text style={[s.chipText, { color: colors.text }]} numberOfLines={1}>{c.label}</Text>
                  {on && <Check size={15} color="#C5A059" strokeWidth={3} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Praktiskt ── */}
          <Text style={[s.section, { color: colors.muted }]}>PRAKTISKT</Text>
          <View style={s.wrap}>
            {AMENITIES.map(({ id, label, Icon }) => (
              <Chip
                key={id}
                label={label}
                Icon={Icon}
                on={filters.amenities.has(id)}
                bg={chipBg}
                onPress={() => set({ amenities: toggled(filters.amenities, id) })}
              />
            ))}
          </View>

          {/* ── Service ── */}
          <Text style={[s.section, { color: colors.muted }]}>SERVICE</Text>
          <View style={s.wrap}>
            {SERVICE_TYPES.map(({ type, label, Icon }) => (
              <Chip
                key={type}
                label={label}
                Icon={Icon}
                on={filters.services.has(type)}
                bg={chipBg}
                onPress={() => set({ services: toggled(filters.services, type) })}
              />
            ))}
          </View>

          {/* ── Mina listor ── */}
          {lists.length > 0 && (
            <>
              <Text style={[s.section, { color: colors.muted }]}>MINA LISTOR</Text>
              <View style={{ gap: 8 }}>
                {lists.map((l) => {
                  const on = filters.listId === l.id;
                  return (
                    <TouchableOpacity
                      key={l.id}
                      activeOpacity={0.8}
                      onPress={() => set({ listId: on ? null : l.id })}
                      style={[s.listRow, { backgroundColor: chipBg, borderColor: on ? "#E2C47F" : "transparent" }]}
                    >
                      <ListCover coverImageUrl={l.coverImageUrl} images={l.images} size={44} radius={10} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.listName, { color: colors.text }]} numberOfLines={1}>{l.name}</Text>
                        <Text style={[s.listSub, { color: colors.muted }]}>
                          {l.placeIds.length === 1 ? "1 plats" : `${l.placeIds.length} platser`}
                        </Text>
                      </View>
                      <View style={[s.radio, { borderColor: on ? "#C5A059" : colors.borderStrong }]}>
                        {on && <View style={s.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {filters.listId && (
                <Text style={[s.hint, { color: colors.muted }]}>Listans platser visas i sin ordning, med rutten emellan.</Text>
              )}
            </>
          )}

          {/* ── Skatter ── */}
          <Text style={[s.section, { color: colors.muted }]}>SKATTER</Text>
          <View style={s.wrap}>
            {TREASURE_MODES.map(({ id, label }) => (
              <Chip key={id} label={label} on={filters.treasures === id} bg={chipBg} onPress={() => set({ treasures: id })} />
            ))}
          </View>
        </ScrollView>

        <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 16), borderTopColor: colors.border, backgroundColor: sheetBg }]}>
          <TouchableOpacity onPress={() => set({ ...EMPTY_FILTERS })} hitSlop={8}>
            <Text style={[s.reset, { color: colors.muted }]}>Rensa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.apply} activeOpacity={0.85} onPress={onClose}>
            <Text style={s.applyText}>{resultLabel}</Text>
          </TouchableOpacity>
        </View>
      </Reanimated.View>
    </View>
  );
}

function Chip({ label, Icon, on, bg, onPress }: { label: string; Icon?: LucideIcon; on: boolean; bg: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[s.chip, { backgroundColor: on ? "rgba(197,160,89,0.16)" : bg, borderColor: on ? "#E2C47F" : "transparent" }]}
    >
      {Icon && <Icon size={14} color={on ? "#C5A059" : colors.muted} strokeWidth={2.2} />}
      <Text style={[s.chipText, { color: on ? colors.goldText : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginTop: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 20, paddingBottom: 24 },
  section: { fontFamily: "Inter_700Bold", fontSize: 11.5, letterSpacing: 1.6, marginTop: 24, marginBottom: 12 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    width: "48.8%", flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: 16, borderWidth: 1.5,
  },
  catDot: { width: 12, height: 12, borderRadius: 6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 9, paddingHorizontal: 13,
    borderRadius: 999, borderWidth: 1.5,
  },
  chipText: { flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 13.5 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8, paddingRight: 14, borderRadius: 16, borderWidth: 1.5 },
  listName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  listSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#C5A059" },
  foot: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16,
    paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth,
  },
  reset: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  apply: { flex: 1, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#C5A059" },
  applyText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#121212" },
});
