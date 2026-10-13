/**
 * En traktor (lucide-ikonens linjer) ritad med berättelsernas gradient (STORY_GRADIENT). En vanlig
 * ikon kan bara ha en färg, därför egen SVG. `flip` spegelvänder den, så två kan vara vända mot
 * varandra.
 */
import { useId } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { STORY_GRADIENT } from "@/theme/storyGradient";

export function GradientTractor({ size = 18, flip = false }: { size?: number; flip?: boolean }) {
  const id = `tractor${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const stroke = `url(#${id})`;
  const line = { stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <View style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id={id} x1={STORY_GRADIENT.x1} y1={STORY_GRADIENT.y1} x2={STORY_GRADIENT.x2} y2={STORY_GRADIENT.y2}>
            {STORY_GRADIENT.stops.map((s) => <Stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
          </LinearGradient>
        </Defs>
        <Path d="m10 11 11 .9a1 1 0 0 1 .8 1.1l-.665 4.158a1 1 0 0 1-.988.842H20" {...line} />
        <Path d="M16 18h-5" {...line} />
        <Path d="M18 5a1 1 0 0 0-1 1v5.573" {...line} />
        <Path d="M3 4h8.129a1 1 0 0 1 .99.863L13 11.246" {...line} />
        <Path d="M4 11V4" {...line} />
        <Path d="M7 15h.01" {...line} />
        <Path d="M8 10.1V4" {...line} />
        <Circle cx={18} cy={18} r={2} {...line} />
        <Circle cx={7} cy={15} r={5} {...line} />
      </Svg>
    </View>
  );
}
