/**
 * Skatternas symbol: ett kryss som på en skattkarta, samma som skatterna på kartan
 * (scripts/render-treasure-pins.js). Grönt för en hittad skatt, grått för en som inte hittats än.
 * Används där skatter visas utanför kartan (Statistik, filterarket, platssidan, Hem).
 */
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

/** Två lite ojämna drag, som ritade för hand (samma som kartans kryss) */
const STROKES = ["M7.5 7 Q15.5 14.2 22.8 23.2", "M22.6 7.2 Q14 15.6 7.2 22.8"];
const GREEN = "#2FA864";

export function TreasurePin({ height = 24, found = true }: { height?: number; found?: boolean }) {
  const { scheme } = useTheme();
  const ink = found ? GREEN : scheme === "dark" ? "#C9C9CE" : "#3A3A3F";
  return (
    <Svg width={height} height={height} viewBox="0 0 30 30">
      {STROKES.map((d) => (
        <Path key={d} d={d} stroke={ink} strokeOpacity={0.9} strokeWidth={3.8} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}
