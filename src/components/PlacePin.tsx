/**
 * Platsnålen som symbol — samma nål som på kartan: svart i mörkt läge, vit i ljust, med Hotell &
 * B&B:s blå som prick (scripts/render-map-pins.js). Används där besök visas som en siffra:
 * Statistik och vänners profiler.
 */
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

export function PlacePin({ height = 24 }: { height?: number }) {
  const dark = useTheme().scheme === "dark";
  return (
    <Svg width={(height * 26) / 34} height={height} viewBox="-1 -1 26 34">
      <Path
        d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z"
        fill={dark ? "#111113" : "#FFFFFF"}
        stroke={dark ? "#FFFFFF" : "#111113"}
        strokeOpacity={dark ? 0.92 : 0.85}
        strokeWidth={1.5}
      />
      <Circle cx={12} cy={11.6} r={5} fill={dark ? "#3F7BEA" : "#1E3A8A"} />
    </Svg>
  );
}
