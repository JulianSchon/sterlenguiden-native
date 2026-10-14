/**
 * Kartans filterark (native-map-full-spec.md §5b) — glider upp till 88 % av skärmen, allt man
 * väljer syns direkt på kartan bakom. Sektioner: aktiva filter, kategorier, praktiskt, Mina,
 * mina listor, plus service och skatter. Stäng med krysset, genom att trycka bredvid, dra ner
 * arket eller trycka "Visa N platser".
 *
 * Arket byggs första gången det öppnas och ligger sen kvar — det glider bara upp och ner.
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { Bookmark, X, type LucideIcon } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { ListSummary } from "@/hooks/useLists";
import {
  ALL_CATEGORIES_ICON, EMPTY_FILTERS, MAP_CATEGORIES, MINE, PRACTICAL, SUBCATEGORIES, TREASURE_MODES,
  type MapFilters,
} from "@/lib/mapFilters";
import { SERVICE_TYPES } from "./MapPins";

const GOLD = "#C5A059";

const toggled = <T,>(set: Set<T>, v: T) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
};

/** Ett aktivt filter som ett chip/piller: namn och hur det tas bort */
export interface ActiveFilter { key: string; label: string; remove: (f: MapFilters) => MapFilters }

/** De aktiva filtren i ordning: kategorier, underkategori, praktiskt, Mina, listor, service, skatter */
export function activeFilters(f: MapFilters, lists: ListSummary[]): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  f.cats.forEach((id) => out.push({
    key: `c-${id}`, label: MAP_CATEGORIES.find((c) => c.id === id)?.label ?? id,
    remove: (x) => ({ ...x, cats: toggled(x.cats, id), sub: null }),
  }));
  if (f.sub) {
    const label = Object.values(SUBCATEGORIES).flat().find((sc) => sc.id === f.sub)?.label ?? f.sub;
    out.push({ key: "sub", label, remove: (x) => ({ ...x, sub: null }) });
  }
  // Öppet nu först bland de praktiska
  [...f.practical].sort((a, b) => (a === "openNow" ? -1 : b === "openNow" ? 1 : 0)).forEach((id) => out.push({
    key: `p-${id}`, label: PRACTICAL.find((p) => p.id === id)?.label ?? id,
    remove: (x) => ({ ...x, practical: toggled(x.practical, id) }),
  }));
  f.mine.forEach((id) => out.push({
    key: `m-${id}`, label: id === "favorites" ? "Dina favoriter" : "Besökta platser",
    remove: (x) => ({ ...x, mine: toggled(x.mine, id) }),
  }));
  f.listIds.forEach((id) => out.push({
    key: `l-${id}`, label: lists.find((l) => l.id === id)?.name ?? "Lista",
    remove: (x) => ({ ...x, listIds: toggled(x.listIds, id) }),
  }));
  f.services.forEach((type) => out.push({
    key: `s-${type}`, label: SERVICE_TYPES.find((t) => t.type === type)?.label ?? type,
    remove: (x) => ({ ...x, services: toggled(x.services, type) }),
  }));
  if (f.treasures !== "all") {
    out.push({
      key: "t", label: TREASURE_MODES.find((t) => t.id === f.treasures)?.label ?? "Skatter",
      remove: (x) => ({ ...x, treasures: "all" }),
    });
  }
  return out;
}

export function MapFilterSheet({
  open, filters, onChange, lists, resultCount, onClose,
}: {
  open: boolean;
  filters: MapFilters;
  onChange: (f: MapFilters) => void;
  lists: ListSummary[];
  /** Antal platser som syns med filtren just nu (knappen "Visa N platser") */
  resultCount: number;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const sheetH = Math.round(height * 0.88);

  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(sheetH);
  const backdrop = useSharedValue(0);
  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
      backdrop.value = withTiming(1, { duration: 260 });
    } else {
      backdrop.value = withTiming(0, { duration: 220 });
      y.value = withTiming(sheetH, { duration: 240, easing: Easing.in(Easing.quad) });
    }
  }, [open, sheetH, y, backdrop]);

  // Dra ner för att stänga: från greppet direkt, från innehållet när det är uppscrollat
  const scrollY = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  const { nativeScroll, pan } = useMemo(() => {
    const native = Gesture.Native();
    const drag = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-14, 14])
      .simultaneousWithExternalGesture(native)
      .onStart(() => { dragOffset.value = 0; })
      .onUpdate((e) => {
        if (scrollY.value > 0.5) { dragOffset.value = e.translationY; return; }
        y.value = Math.max(0, e.translationY - dragOffset.value);
      })
      .onEnd((e) => {
        if (y.value > 120 || (e.velocityY > 900 && y.value > 0)) runOnJS(onClose)();
        else y.value = withSpring(0, { damping: 32, stiffness: 300 });
      });
    return { nativeScroll: native, pan: drag };
  }, [onClose, y, scrollY, dragOffset]);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;

  const set = (next: MapFilters) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };
  const active = activeFilters(filters, lists);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Reanimated.View>

      <Reanimated.View style={[s.sheet, { height: sheetH }, sheetStyle]}>
        <LinearGradient
          colors={dark ? ["rgba(15,15,15,0.97)", "rgba(8,8,8,0.98)"] : ["#FFFFFF", "#F1F6F3"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }}>
            <View style={[s.grip, { backgroundColor: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)" }]} />
            <View style={s.head}>
              <Text style={[s.title, { color: colors.text }]}>Filter</Text>
              <TouchableOpacity style={[s.close, { backgroundColor: colors.fill }]} onPress={onClose} hitSlop={8} accessibilityLabel="Stäng">
                <X size={16} color={colors.muted} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            <GestureDetector gesture={nativeScroll}>
              <Reanimated.ScrollView
                onScroll={onScroll}
                scrollEventThrottle={16}
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.body}
              >
                {active.length > 0 && (
                  <Section title="Aktiva filter">
                    {active.map((a) => (
                      <Chip key={a.key} label={a.label} on onPress={() => set(a.remove(filters))} />
                    ))}
                  </Section>
                )}

                <Section title="Kategorier">
                  <Chip
                    label="Alla"
                    Icon={ALL_CATEGORIES_ICON}
                    on={filters.cats.size === 0}
                    onPress={() => set({ ...filters, cats: new Set(), sub: null })}
                  />
                  {MAP_CATEGORIES.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.label}
                      Icon={c.Icon}
                      on={filters.cats.has(c.id)}
                      onPress={() => set({ ...filters, cats: toggled(filters.cats, c.id), sub: null })}
                    />
                  ))}
                </Section>

                <Section title="Praktiskt">
                  {PRACTICAL.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.label}
                      Icon={p.Icon}
                      on={filters.practical.has(p.id)}
                      onPress={() => set({ ...filters, practical: toggled(filters.practical, p.id) })}
                    />
                  ))}
                </Section>

                <Section title="Mina">
                  {MINE.map((m) => (
                    <Chip
                      key={m.id}
                      label={m.label}
                      Icon={m.Icon}
                      on={filters.mine.has(m.id)}
                      onPress={() => set({ ...filters, mine: toggled(filters.mine, m.id) })}
                    />
                  ))}
                </Section>

                {lists.length > 0 && (
                  <View style={s.section}>
                    <Text style={[s.sectionTitle, { color: colors.faint }]}>MINA LISTOR</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }}>
                      {lists.map((l) => (
                        <ListCard
                          key={l.id}
                          list={l}
                          on={filters.listIds.has(l.id)}
                          onPress={() => set({ ...filters, listIds: toggled(filters.listIds, l.id) })}
                        />
                      ))}
                    </ScrollView>
                    {filters.listIds.size === 1 && (
                      <Text style={[s.hint, { color: colors.muted }]}>En lista: platserna numreras i listans ordning, med rutten emellan.</Text>
                    )}
                  </View>
                )}

                <Section title="Service">
                  {SERVICE_TYPES.map((t) => (
                    <Chip
                      key={t.type}
                      label={t.label}
                      Icon={t.Icon}
                      on={filters.services.has(t.type)}
                      onPress={() => set({ ...filters, services: toggled(filters.services, t.type) })}
                    />
                  ))}
                </Section>

                <Section title="Skatter">
                  {TREASURE_MODES.map((t) => (
                    <Chip key={t.id} label={t.label} on={filters.treasures === t.id} onPress={() => set({ ...filters, treasures: t.id })} />
                  ))}
                </Section>
              </Reanimated.ScrollView>
            </GestureDetector>
          </View>
        </GestureDetector>

        <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 16), borderTopColor: colors.border }]}>
          <TouchableOpacity onPress={() => set({ ...EMPTY_FILTERS })} hitSlop={8}>
            <Text style={[s.reset, { color: colors.muted }]}>Återställ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.apply} activeOpacity={0.85} onPress={onClose}>
            <LinearGradient colors={["#C5A059", "#B48A3B"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={s.applyText}>{resultCount === 1 ? "Visa 1 plats" : `Visa ${resultCount} platser`}</Text>
          </TouchableOpacity>
        </View>
      </Reanimated.View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.faint }]}>{title.toUpperCase()}</Text>
      <View style={s.wrap}>{children}</View>
    </View>
  );
}

function Chip({ label, Icon, on, onPress }: { label: string; Icon?: LucideIcon; on: boolean; onPress: () => void }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        s.chip,
        on
          ? { borderColor: "rgba(197,160,89,0.5)" }
          : { backgroundColor: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" },
      ]}
    >
      {on && (
        <LinearGradient
          colors={["rgba(197,160,89,0.22)", "rgba(197,160,89,0.08)"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {Icon && <Icon size={14} color={on ? GOLD : colors.muted} strokeWidth={2.2} />}
      <Text style={[s.chipText, { color: on ? (dark ? GOLD : "#8A6A2E") : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ListCard({ list, on, onPress }: { list: ListSummary; on: boolean; onPress: () => void }) {
  const cover = list.coverImageUrl ?? list.images[0] ?? null;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[s.listCard, on && s.listCardOn]}>
      {cover
        ? <ExpoImage source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        : <View style={[StyleSheet.absoluteFill, s.listEmpty]}><Bookmark size={24} color="rgba(255,255,255,0.3)" strokeWidth={2} /></View>}
      <LinearGradient
        colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Text style={[s.listName, on && { color: GOLD }]} numberOfLines={2}>{list.name}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)",
  },
  grip: { alignSelf: "center", width: 48, height: 6, borderRadius: 3, marginTop: 12, marginBottom: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 4 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: -0.3 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  body: { padding: 20, paddingTop: 12, gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 2 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  listCard: {
    width: 132, height: 96, borderRadius: 12, overflow: "hidden", justifyContent: "flex-end", padding: 8,
    borderWidth: 1, borderColor: "transparent",
  },
  listCardOn: { borderColor: "rgba(197,160,89,0.85)" },
  listEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  listName: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#FFFFFF" },
  foot: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16,
    paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
  reset: { fontFamily: "Inter_500Medium", fontSize: 14 },
  apply: { flex: 1, maxWidth: 240, borderRadius: 16, paddingVertical: 14, alignItems: "center", overflow: "hidden" },
  applyText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#121212" },
});
