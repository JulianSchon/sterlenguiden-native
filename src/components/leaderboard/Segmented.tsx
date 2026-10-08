/**
 * Segmentkontroll med en glidande markering — för de mindre valen på topplistesidan
 * (omfång, tid) och, med variant="primary", huvudvalet överst. Markeringen glider med withTiming,
 * inte en fjäder, så den aldrig studsar.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const PAD = 4;

export function Segmented<T extends string>({
  options, value, onChange, variant = "secondary",
}: { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; variant?: "primary" | "secondary" }) {
  const primary = variant === "primary";
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  // onLayout-bredden räknar med ramen — dra av den så markeringen passar exakt
  const border = primary ? 1.5 : 0.5;
  const segW = width > 0 ? (width - PAD * 2 - border * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((o) => o.id === value));

  const indicator = useAnimatedStyle(() => ({
    transform: [{
      translateX: reduceMotion
        ? index * segW
        : withTiming(index * segW, { duration: 240, easing: Easing.out(Easing.cubic) }),
    }],
  }));

  return (
    <View style={[s.wrap, primary && s.wrapPrimary]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segW > 0 && <Reanimated.View style={[s.indicator, { width: segW }, indicator]} />}
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
          <Text style={[s.text, primary && s.textPrimary, o.id === value && s.textActive]} numberOfLines={1}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row", padding: PAD, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  indicator: {
    position: "absolute", top: PAD, bottom: PAD, left: PAD,
    borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)",
  },
  item: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 4 },
  text: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED },
  textActive: { color: FG },
  // Huvudvalet: originalstorleken och en neonlila ytterkant med en svag glöd runt om
  wrapPrimary: {
    borderWidth: 1.5, borderColor: "#B57CFF",
    shadowColor: "#A855F7", shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  itemPrimary: { paddingVertical: 10 },
  textPrimary: { fontSize: 14 },
});
