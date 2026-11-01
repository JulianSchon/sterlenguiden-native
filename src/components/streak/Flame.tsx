/**
 * Streakens låga som kan tändas: vår egen eld som stilla grå siluett och den levande elden
 * (StreakFlame, samma som på Mitt Österlen) ovanpå varandra. `lit` (0–1) tonar över från slocknad till tänd.
 * `size` är höjden; bredden följer elden. `compact` = utan gnistor (för små storlekar).
 */
import { View } from "react-native";
import Reanimated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { StreakFlame } from "./StreakFlame";

export const FLAME_COLORS = { hot: "#FF7A1A", warm: "#FFB23E", tip: "#FFE08A" };

// StreakFlames bredd i förhållande till höjden (kompakt 220 × 316, hel 300 × 332)
const ASPECT = { compact: 220 / 316, full: 300 / 332 };

export function Flame({ size, lit, compact = true }: { size: number; lit: SharedValue<number>; compact?: boolean }) {
  const width = Math.round(size * (compact ? ASPECT.compact : ASPECT.full));
  const litStyle = useAnimatedStyle(() => ({ opacity: lit.value }));
  const outStyle = useAnimatedStyle(() => ({ opacity: 1 - lit.value }));
  return (
    <View style={{ width, height: size, alignItems: "center", justifyContent: "flex-end" }}>
      <Reanimated.View style={[{ position: "absolute", bottom: 0 }, outStyle]}>
        <StreakFlame compact={compact} size={width} silhouette />
      </Reanimated.View>
      <Reanimated.View style={[{ position: "absolute", bottom: 0 }, litStyle]}>
        <StreakFlame compact={compact} size={width} />
      </Reanimated.View>
    </View>
  );
}
