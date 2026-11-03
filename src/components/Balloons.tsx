/**
 * Ballonger som stiger från skärmens nederkant upp över toppen (vykortet på födelsedagen). Varje
 * ballong har egen färg, storlek, fart och gungning, och startar lite efter den förra. Allt räknas
 * på UI-tråden från ett enda startvärde, så inget hackar.
 */
import { memo, useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue,
} from "react-native-reanimated";
import Svg, { Ellipse, Path } from "react-native-svg";

/** Fasta värden, så det ser likadant ut varje gång: x (andel av bredden), storlek, start (ms), tid (ms), gungning */
const BALLOONS = [
  { x: 0.08, size: 54, delay: 0, ms: 5200, sway: 14, color: "#E5484D" },
  { x: 0.3, size: 64, delay: 350, ms: 6000, sway: 18, color: "#F5C451" },
  { x: 0.55, size: 50, delay: 150, ms: 5000, sway: 12, color: "#4C8BF5" },
  { x: 0.8, size: 60, delay: 600, ms: 5800, sway: 16, color: "#3FB37F" },
  { x: 0.18, size: 46, delay: 1100, ms: 5400, sway: 12, color: "#E86FB0" },
  { x: 0.68, size: 56, delay: 1300, ms: 6200, sway: 18, color: "#F08A3C" },
  { x: 0.42, size: 52, delay: 1800, ms: 5600, sway: 14, color: "#8B6CF0" },
  { x: 0.9, size: 44, delay: 2100, ms: 5000, sway: 10, color: "#E5484D" },
  { x: 0.02, size: 58, delay: 2500, ms: 6000, sway: 16, color: "#4C8BF5" },
  { x: 0.6, size: 48, delay: 2900, ms: 5200, sway: 12, color: "#F5C451" },
  { x: 0.25, size: 62, delay: 3300, ms: 6400, sway: 18, color: "#3FB37F" },
  { x: 0.78, size: 50, delay: 3700, ms: 5600, sway: 14, color: "#E86FB0" },
];

export const Balloons = memo(function Balloons({ start }: { start: boolean }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {BALLOONS.map((b, i) => (
        <Balloon key={i} {...b} start={start} screenW={width} screenH={height} />
      ))}
    </View>
  );
});

function Balloon({ x, size, delay, ms, sway, color, start, screenW, screenH }: (typeof BALLOONS)[number] & {
  start: boolean; screenW: number; screenH: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (start) p.value = withDelay(delay, withTiming(1, { duration: ms, easing: Easing.linear }));
  }, [start, delay, ms, p]);
  const h = size * 1.25;
  const total = h + size * 1.6; // ballongen och snöret
  const style = useBalloonStyle(p, screenH, total, sway);
  return (
    <Reanimated.View style={[{ position: "absolute", left: x * (screenW - size), top: 0, width: size, height: total }, style]}>
      <Svg width={size} height={total}>
        {/* Snöret, lite slingrigt */}
        <Path
          d={`M ${size / 2} ${h} q ${-size * 0.15} ${size * 0.4} 0 ${size * 0.8} t 0 ${size * 0.8}`}
          stroke="rgba(255,255,255,0.55)" strokeWidth={1.2} fill="none"
        />
        {/* Knuten */}
        <Path d={`M ${size / 2 - 4} ${h + 3} L ${size / 2 + 4} ${h + 3} L ${size / 2} ${h - 3} Z`} fill={color} />
        <Ellipse cx={size / 2} cy={h / 2} rx={size / 2} ry={h / 2} fill={color} />
        {/* Glansen */}
        <Ellipse cx={size * 0.34} cy={h * 0.3} rx={size * 0.1} ry={h * 0.14} fill="rgba(255,255,255,0.35)" />
      </Svg>
    </Reanimated.View>
  );
}

function useBalloonStyle(p: SharedValue<number>, screenH: number, total: number, sway: number) {
  return useAnimatedStyle(() => ({
    opacity: p.value > 0 && p.value < 1 ? 1 : 0,
    transform: [
      // Från under nederkanten till ovanför toppen
      { translateY: screenH + 20 - p.value * (screenH + total + 40) },
      { translateX: Math.sin(p.value * Math.PI * 4) * sway },
      { rotate: `${Math.sin(p.value * Math.PI * 4 + 1) * 6}deg` },
    ],
  }));
}
