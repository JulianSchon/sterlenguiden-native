/**
 * Skattkistan i upplåsningen, ritad i SVG: en botten och ett lock som ritas var för sig, så att
 * locket kan flyga av när kistan öppnas. Mörkt trä med guldbeslag och ett lås i mitten. Ritytan
 * är 180 × 150; locket täcker y 8–74 och botten y 68–146 (de överlappar lite vid springan).
 */
import Svg, { Defs, LinearGradient, Path, Rect, Stop, Circle } from "react-native-svg";

export const CHEST_W = 180;
export const CHEST_H = 150;
/** Springan mellan lock och botten (där ljuset läcker ut), i ritytans enheter */
export const CHEST_SEAM_Y = 71;

function Gradients({ id }: { id: string }) {
  return (
    <Defs>
      <LinearGradient id={`${id}wood`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#8A5328" />
        <Stop offset="1" stopColor="#4A2810" />
      </LinearGradient>
      <LinearGradient id={`${id}gold`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FBE49B" />
        <Stop offset="0.5" stopColor="#D4A740" />
        <Stop offset="1" stopColor="#8A6420" />
      </LinearGradient>
    </Defs>
  );
}

export function ChestLid({ size }: { size: number }) {
  const h = (size * CHEST_H) / CHEST_W;
  return (
    <Svg width={size} height={h} viewBox={`0 0 ${CHEST_W} ${CHEST_H}`}>
      <Gradients id="lid" />
      <Path d="M10 74 L10 44 Q10 10 90 8 Q170 10 170 44 L170 74 Z" fill="url(#lidwood)" stroke="#2B160A" strokeWidth={3} />
      {/* Plankfogar */}
      <Path d="M14 46 Q90 30 166 46" stroke="#3A1E0B" strokeWidth={2} fill="none" opacity={0.6} />
      {/* Guldband över locket */}
      <Path d="M34 74 L34 22 Q40 16 48 14 L48 74 Z" fill="url(#lidgold)" stroke="#5E4212" strokeWidth={1.5} />
      <Path d="M132 74 L132 14 Q140 16 146 22 L146 74 Z" fill="url(#lidgold)" stroke="#5E4212" strokeWidth={1.5} />
      <Rect x={8} y={66} width={164} height={10} rx={3} fill="url(#lidgold)" stroke="#5E4212" strokeWidth={1.5} />
    </Svg>
  );
}

export function ChestBase({ size }: { size: number }) {
  const h = (size * CHEST_H) / CHEST_W;
  return (
    <Svg width={size} height={h} viewBox={`0 0 ${CHEST_W} ${CHEST_H}`}>
      <Gradients id="base" />
      <Rect x={12} y={70} width={156} height={76} rx={8} fill="url(#basewood)" stroke="#2B160A" strokeWidth={3} />
      <Path d="M14 96 H166 M14 120 H166" stroke="#3A1E0B" strokeWidth={2} opacity={0.6} />
      <Rect x={34} y={70} width={14} height={76} fill="url(#basegold)" stroke="#5E4212" strokeWidth={1.5} />
      <Rect x={132} y={70} width={14} height={76} fill="url(#basegold)" stroke="#5E4212" strokeWidth={1.5} />
      <Rect x={10} y={136} width={160} height={10} rx={3} fill="url(#basegold)" stroke="#5E4212" strokeWidth={1.5} />
      {/* Låset */}
      <Rect x={76} y={64} width={28} height={34} rx={6} fill="url(#basegold)" stroke="#5E4212" strokeWidth={2} />
      <Circle cx={90} cy={78} r={4} fill="#2B160A" />
      <Path d="M88 80 L86 90 H94 L92 80 Z" fill="#2B160A" />
    </Svg>
  );
}
