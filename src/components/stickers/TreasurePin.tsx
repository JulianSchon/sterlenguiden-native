/**
 * Skatternas symbol: svart nål
 * med lila glöd i kanten och en stjärna som lyser lite. En hittad skatt har guldstjärna.
 * Används där skatter visas som en siffra (Statistik).
 */
import Svg, { Circle, Defs, Path, Polygon, RadialGradient, Stop } from "react-native-svg";

const PIN = "M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z";
const STAR = "12,5.8 13.5,9.2 17.2,9.6 14.4,12.1 15.2,15.8 12,13.9 8.8,15.8 9.6,12.1 6.8,9.6 10.5,9.2";
const PURPLE = "#A78BFA";

export function TreasurePin({ height = 24, found = true }: { height?: number; found?: boolean }) {
  const star = found ? "#FDE68A" : "#F3EEFF";
  const glow = found ? "#FBBF24" : "#C4B5FD";
  return (
    // Luft runt nålen för glöden
    <Svg width={(height * 30) / 38} height={height} viewBox="-3 -3 30 38">
      <Defs>
        <RadialGradient id="treasureStarGlow" cx="12" cy="11" r="7" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={glow} stopOpacity={0.75} />
          <Stop offset="1" stopColor={glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Glöden: samma kant i lila, bredare och svagare utåt */}
      <Path d={PIN} fill="none" stroke={PURPLE} strokeOpacity={0.14} strokeWidth={5.5} />
      <Path d={PIN} fill="none" stroke={PURPLE} strokeOpacity={0.3} strokeWidth={3.4} />
      <Path d={PIN} fill="#111113" stroke={PURPLE} strokeWidth={1.4} />
      <Circle cx={12} cy={11} r={7} fill="url(#treasureStarGlow)" />
      <Polygon points={STAR} fill={star} />
    </Svg>
  );
}
