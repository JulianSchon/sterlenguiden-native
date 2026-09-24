/** Rund flagga (ritad som SVG) för språkväljaren. */
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import type { LanguageCode } from "@/i18n";

export function RoundFlag({ code, size = 32 }: { code: LanguageCode; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={`round-${code}`}>
          <Circle cx={50} cy={50} r={50} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#round-${code})`}>
        {code === "sv" && (
          <>
            <Rect width={100} height={100} fill="#006AA7" />
            <Rect x={30} width={14} height={100} fill="#FECC00" />
            <Rect y={43} width={100} height={14} fill="#FECC00" />
          </>
        )}
        {code === "de" && (
          <>
            <Rect width={100} height={34} fill="#000000" />
            <Rect y={33} width={100} height={34} fill="#DD0000" />
            <Rect y={66} width={100} height={34} fill="#FFCE00" />
          </>
        )}
        {code === "en" && (
          <>
            <Rect width={100} height={100} fill="#012169" />
            <Path d="M0 0L100 100M100 0L0 100" stroke="#FFFFFF" strokeWidth={16} />
            <Path d="M0 0L100 100M100 0L0 100" stroke="#C8102E" strokeWidth={8} />
            <Path d="M50 0V100M0 50H100" stroke="#FFFFFF" strokeWidth={26} />
            <Path d="M50 0V100M0 50H100" stroke="#C8102E" strokeWidth={15} />
          </>
        )}
      </G>
    </Svg>
  );
}
