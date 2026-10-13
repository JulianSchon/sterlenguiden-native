/**
 * Platsnålen som symbol — samma gröna nål med vit mitt som på kartan (StandardPin i
 * app/(tabs)/map.tsx). Används där besök visas som en siffra: Statistik och vänners profiler.
 */
import Svg, { Circle, Path } from "react-native-svg";

export const PIN_GREEN = "hsl(150,30%,28%)";

export function PlacePin({ height = 24 }: { height?: number }) {
  return (
    <Svg width={(height * 24) / 32} height={height} viewBox="0 0 24 32">
      <Path
        d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z"
        fill={PIN_GREEN}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={1}
      />
      <Circle cx={12} cy={11} r={4.5} fill="#FFFFFF" />
    </Svg>
  );
}
