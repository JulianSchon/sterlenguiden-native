/**
 * Två verktyg i flödet på Hem:
 * - ShortcutRow: "Öppet nu" och Söks färdiga frågor som en rad att svepa ("Äta nu", "Fika", "Sova i
 *   natt" …). Ett tryck öppnar Sök med svaret redan klart — samma rutor och färger som på Sök.
 * - DiscoverCard: Upptäck (svepet). En liten kortlek med bilder från platser man inte svept än,
 *   och hur många som är kvar.
 */
import { memo, useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowRight, Clock } from "lucide-react-native";
import { firstImageUrl, usePlaces, type Place } from "@/hooks/usePlaces";
import { useFavorites } from "@/hooks/useFavorites";
import { useDismissals } from "@/hooks/useDismissals";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/categories";
import { TILES, TINT, openSearch, type Shortcut } from "@/lib/searchShortcuts";
import { daySeed } from "@/lib/homeFeed";

const NO_PLACES: Place[] = [];
const NO_IDS: number[] = [];

/** Hem har "Öppet nu" först (på Sök ligger det som en egen del) */
const HOME_SHORTCUTS: Shortcut[] = [
  { key: "open", label: "Öppet nu", query: "öppet nu", Icon: Clock, tint: TINT.open },
  ...TILES,
];

/** Raden går ut till skärmens kanter (kortet runt den har sidomarginal) */
export const ShortcutRow = memo(function ShortcutRow({ gutter }: { gutter: number }) {
  const router = useRouter();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[s.row, { paddingHorizontal: gutter }]}
      style={{ marginHorizontal: -gutter }}
    >
      {HOME_SHORTCUTS.map((t) => (
        <ShortcutChip
          key={t.key}
          shortcut={t}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            openSearch(router, t.query);
          }}
        />
      ))}
    </ScrollView>
  );
});

function ShortcutChip({ shortcut: { label, Icon, tint }, onPress }: { shortcut: Shortcut; onPress: () => void }) {
  const { colors, scheme } = useTheme();
  const color = tint[scheme];
  // Månen ligger mot grått (natthimlen), de andra mot sin egen färg
  const iconBg = tint.ring === "night"
    ? (scheme === "dark" ? "rgba(255,255,255,0.10)" : "rgba(35,28,15,0.08)")
    : withAlpha(color, scheme === "dark" ? 0.16 : 0.1);
  return (
    <TouchableOpacity style={[s.chip, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.75} onPress={onPress}>
      <View style={[s.chipIcon, { backgroundColor: iconBg }]}>
        <Icon size={15} color={color} strokeWidth={2.2} />
      </View>
      <Text style={[s.chipLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Upptäck ──────────────────────────────────────────────────────────────────

/** Bildernas vinklar i kortleken: vänster, mitten, höger */
const FAN = [{ rot: -11, x: -26, y: 8 }, { rot: 9, x: 26, y: 6 }, { rot: 0, x: 0, y: 0 }];

export const DiscoverCard = memo(function DiscoverCard() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: places = NO_PLACES } = usePlaces();
  const { data: favorites = [] } = useFavorites();
  const { data: dismissed = NO_IDS } = useDismissals();
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  // Samma urval som Upptäck: inte sparade och inte bortsvepta
  const { left, preview } = useMemo(() => {
    const excluded = new Set<number>([...dismissed, ...favorites.flatMap((f) => (f.place_id != null ? [f.place_id] : []))]);
    const available = places.filter((p) => !excluded.has(p.id));
    // Tre bilder, olika varje dag
    const seed = daySeed();
    const withImage = available.filter((p) => firstImageUrl(p.image_url));
    const pick = [...withImage].sort((a, b) => ((a.id * 7919 + seed) % 997) - ((b.id * 7919 + seed) % 997)).slice(0, 3);
    return { left: available.length, preview: pick.map((p) => firstImageUrl(p.image_url)!) };
  }, [places, favorites, dismissed]);

  return (
    <Pressable
      onPress={() => router.push("/discover")}
      onPressIn={() => { press.value = withSpring(0.97, { damping: 36, stiffness: 320 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 32, stiffness: 260 }); }}
      accessibilityRole="button"
      accessibilityLabel="Upptäck platser"
    >
      <Reanimated.View style={[s.discover, { backgroundColor: colors.card, borderColor: colors.border }, pressStyle]}>
        <View style={s.discoverText}>
          <Text style={[s.eyebrow, { color: colors.goldText }]}>UPPTÄCK</Text>
          <Text style={[s.discoverTitle, { color: colors.text }]}>Svep fram din nästa plats</Text>
          <Text style={[s.discoverSub, { color: colors.muted }]}>
            {places.length === 0 ? " " : left > 0 ? `${left} ${left === 1 ? "plats" : "platser"} kvar att upptäcka` : "Du har svept igenom alla platser"}
          </Text>
          <View style={s.discoverCta}>
            <Text style={[s.discoverCtaText, { color: colors.goldText }]}>Börja svepa</Text>
            <ArrowRight size={15} color={colors.goldText} strokeWidth={2.4} />
          </View>
        </View>
        <View style={s.fan} pointerEvents="none">
          {FAN.map((f, i) => (
            <View
              key={i}
              style={[s.fanCard, {
                borderColor: colors.card, backgroundColor: colors.fill,
                transform: [{ translateX: f.x }, { translateY: f.y }, { rotate: `${f.rot}deg` }],
              }]}
            >
              {preview[i] && <Image source={{ uri: preview[i] }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            </View>
          ))}
        </View>
      </Reanimated.View>
    </Pressable>
  );
});

const s = StyleSheet.create({
  row: { gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingLeft: 7, paddingRight: 14,
    borderRadius: 22, borderWidth: StyleSheet.hairlineWidth,
  },
  chipIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  chipLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  discover: {
    flexDirection: "row", alignItems: "center", borderRadius: 22, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 18, paddingLeft: 18, paddingRight: 8, overflow: "hidden",
  },
  discoverText: { flex: 1, gap: 5 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.6 },
  discoverTitle: { fontFamily: "Montserrat_700Bold", fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  discoverSub: { fontFamily: "Inter_400Regular", fontSize: 13.5 },
  discoverCta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  discoverCtaText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  fan: { width: 128, height: 112, alignItems: "center", justifyContent: "center" },
  fanCard: {
    position: "absolute", width: 66, height: 90, borderRadius: 12, borderWidth: 2.5, overflow: "hidden",
  },
});
