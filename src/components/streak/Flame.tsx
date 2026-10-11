/**
 * Streakens låga: en slocknad grå låga och en tänd i eldfärger, ovanpå varandra. `lit` (0–1)
 * tonar över från slocknad till tänd, så lågan kan "tändas" i en animation.
 */
import { View } from "react-native";
import Reanimated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

// Lucides låga (24 × 24), fylld i stället för konturritad
const FLAME =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

export const FLAME_COLORS = { hot: "#FF7A1A", warm: "#FFB23E", tip: "#FFE08A" };

export function Flame({ size, lit, id }: { size: number; lit: SharedValue<number>; id: string }) {
  const litStyle = useAnimatedStyle(() => ({ opacity: lit.value }));
  const outStyle = useAnimatedStyle(() => ({ opacity: 1 - lit.value }));
  return (
    <View style={{ width: size, height: size }}>
      <Reanimated.View style={[{ position: "absolute" }, outStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={FLAME} fill="#5C5A56" />
        </Svg>
      </Reanimated.View>
      <Reanimated.View style={[{ position: "absolute" }, litStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={FLAME_COLORS.tip} />
              <Stop offset="0.45" stopColor={FLAME_COLORS.warm} />
              <Stop offset="1" stopColor={FLAME_COLORS.hot} />
            </LinearGradient>
          </Defs>
          <Path d={FLAME} fill={`url(#${id})`} />
        </Svg>
      </Reanimated.View>
    </View>
  );
}
