/**
 * Instagram och Facebook som linjeikoner i samma stil som resten av appens ikoner (lucide) — lucide
 * har tagit bort varumärkenas ikoner, så de ritas här med samma mått: 24 × 24, rundade linjer.
 */
import Svg, { Circle, Path, Rect } from "react-native-svg";

export interface IconProps { size?: number; color?: string; strokeWidth?: number }

export function InstagramIcon({ size = 24, color = "#000", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={2} y={2} width={20} height={20} rx={5} />
      <Circle cx={12} cy={12} r={4} />
      <Path d="M17.5 6.5h.01" />
    </Svg>
  );
}

export function FacebookIcon({ size = 24, color = "#000", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </Svg>
  );
}
