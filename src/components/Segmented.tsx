/**
 * Segmentkontroll med en glidande markering — för de mindre valen på topplistesidan
 * (omfång, tid) och, med variant="primary" (guldfyllt val), huvudvalet överst. Markeringen glider med withTiming,
 * inte en fjäder, så den aldrig studsar.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const PAD = 4;
const BORDER = 0.5;

export function Segmented<T extends string>({
  options, value, onChange, variant = "secondary",
}: { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; variant?: "primary" | "secondary" }) {
  const s = useThemedStyles(createStyles);
  const primary = variant === "primary";
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const segW = width > 0 ? (width - PAD * 2 - BORDER * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((o) => o.id === value));

  const indicator = useAnimatedStyle(() => ({
    transform: [{
      translateX: reduceMotion
        ? index * segW
        : withTiming(index * segW, { duration: 240, easing: Easing.out(Easing.cubic) }),
    }],
  }));

  return (
    <View style={s.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segW > 0 && <Reanimated.View style={[s.indicator, primary && s.indicatorPrimary, { width: segW }, indicator]} />}
      {options.map((o) => (
        <TouchableOpacity
          key={o.id}
          style={[s.item, primary && s.itemPrimary]}
          activeOpacity={0.8}
          onPress={() => {
            if (o.id === value) return;
            Haptics.selectionAsync().catch(() => {});
            onChange(o.id);
          }}
        >
          <Text style={[s.text, primary && s.textPrimary, o.id === value && (primary ? s.textActivePrimary : s.textActive)]} numberOfLines={1}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: {
    flexDirection: "row", padding: PAD, borderRadius: 14, borderWidth: BORDER,
    backgroundColor: c.fill, borderColor: c.border,
  },
  indicator: {
    position: "absolute", top: PAD, bottom: PAD, left: PAD,
    borderRadius: 10, backgroundColor: c.borderStrong,
  },
  item: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 4 },
  text: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted },
  textActive: { color: c.text },
  // Huvudvalet: lite större, och det VALDA segmentet är guldfyllt (appens accent), utan glöd
  indicatorPrimary: { backgroundColor: c.gold },
  textActivePrimary: { color: c.onGold },
  itemPrimary: { paddingVertical: 10 },
  textPrimary: { fontSize: 14 },
});
