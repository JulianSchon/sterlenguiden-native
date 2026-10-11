/**
 * Streakens låga som kan tändas: en slocknad grå låga och den levande elden (StreakFlame, samma
 * som på Mitt Österlen) ovanpå varandra. `lit` (0–1) tonar över från slocknad till tänd.
 * `size` är höjden; bredden följer elden. `compact` = utan gnistor (för små storlekar).
 */
import { View } from "react-native";
import Reanimated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { StreakFlame } from "./StreakFlame";

// Lucides låga (24 × 24), fylld — bara som slocknad siluett
const UNLIT =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

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
        <Svg width={size * 0.9} height={size * 0.9} viewBox="0 0 24 24">
          <Path d={UNLIT} fill="#5C5A56" />
        </Svg>
      </Reanimated.View>
      <Reanimated.View style={[{ position: "absolute", bottom: 0 }, litStyle]}>
        <StreakFlame compact={compact} size={width} />
      </Reanimated.View>
    </View>
  );
}
