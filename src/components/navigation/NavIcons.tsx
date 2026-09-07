/**
 * Custom SVG nav icons – active (gold/filled) and inactive (white 40 % / outline).
 * All icons are 26 × 26 px, designed to the native-nav-spec-v2.
 */
import React from "react";
import Svg, { Path, Circle, Line, Rect } from "react-native-svg";

const GOLD     = "#C5A059";
const INACTIVE = "rgba(255,255,255,0.4)";
const WHITE    = "#FFFFFF";
const SIZE     = 26;

interface IconProps { active: boolean }

// ─── NavHome ──────────────────────────────────────────────────────────────────
// Hus med dörr. Aktiv: fyllt hus (guld) + vit dörrutskärning.
export function NavHome({ active }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 26 26">
      {active ? (
        <>
          <Path
            d="M13 3L23.5 12V23.5H2.5V12L13 3Z"
            fill={GOLD}
            strokeLinejoin="round"
          />
          {/* Vit dörr */}
          <Rect x={10} y={16.5} width={6} height={7} rx={0.5} fill={WHITE} />
        </>
      ) : (
        <Path
          d="M13 3L23.5 12V23.5H2.5V12L13 3Z"
          stroke={INACTIVE}
          strokeWidth={1.8}
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </Svg>
  );
}

// ─── NavSearch ────────────────────────────────────────────────────────────────
// Förstoringsglas. Aktiv: ytterring + ifylld innercirkel + tjockare skaft.
export function NavSearch({ active }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 26 26">
      {active ? (
        <>
          <Circle cx={10.5} cy={10.5} r={7} stroke={GOLD} strokeWidth={2.5} fill="none" />
          <Circle cx={10.5} cy={10.5} r={3.5} fill={GOLD} />
          <Line
            x1={16} y1={16} x2={23} y2={23}
            stroke={GOLD} strokeWidth={2.5} strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <Circle cx={10.5} cy={10.5} r={7} stroke={INACTIVE} strokeWidth={1.8} fill="none" />
          <Line
            x1={16} y1={16} x2={23} y2={23}
            stroke={INACTIVE} strokeWidth={1.8} strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}

// ─── NavMap ───────────────────────────────────────────────────────────────────
// Vikt karta med tre paneler. Aktiv: fylld (guld) + vita vecklinjer.
export function NavMap({ active }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 26 26">
      {active ? (
        <>
          <Path d="M2,8 L10,5.5 L10,21.5 L2,24 Z"       fill={GOLD} />
          <Path d="M10,5.5 L18,8 L18,24 L10,21.5 Z"     fill={GOLD} />
          <Path d="M18,8 L24,5.5 L24,21.5 L18,24 Z"     fill={GOLD} />
          {/* Vita vecklinjer */}
          <Line x1={10} y1={5.5}  x2={10} y2={21.5} stroke={WHITE} strokeWidth={1.5} />
          <Line x1={18} y1={8}    x2={18} y2={24}   stroke={WHITE} strokeWidth={1.5} />
        </>
      ) : (
        <>
          {/* Ytterkonturen av hela kartan */}
          <Path
            d="M2,8 L10,5.5 L18,8 L24,5.5 L24,21.5 L18,24 L10,21.5 L2,24 Z"
            stroke={INACTIVE} strokeWidth={1.8} strokeLinejoin="round" fill="none"
          />
          {/* Vecklinjer */}
          <Line x1={10} y1={5.5} x2={10} y2={21.5} stroke={INACTIVE} strokeWidth={1.2} />
          <Line x1={18} y1={8}   x2={18} y2={24}   stroke={INACTIVE} strokeWidth={1.2} />
        </>
      )}
    </Svg>
  );
}

// ─── NavCalendar ──────────────────────────────────────────────────────────────
// Kalender. Aktiv: fylld kropp, vita krokar, header-linje och prickar.
export function NavCalendar({ active }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 26 26">
      {active ? (
        <>
          <Rect x={2} y={7} width={22} height={17} rx={3} fill={GOLD} />
          {/* Horisontell header-linje */}
          <Line x1={2} y1={13} x2={24} y2={13} stroke={WHITE} strokeWidth={1} />
          {/* Krokar */}
          <Line x1={8.5}  y1={7} x2={8.5}  y2={4} stroke={WHITE} strokeWidth={2} strokeLinecap="round" />
          <Line x1={17.5} y1={7} x2={17.5} y2={4} stroke={WHITE} strokeWidth={2} strokeLinecap="round" />
          {/* Datumprickar 2×3 */}
          <Circle cx={7.5}  cy={17.5} r={1.5} fill={WHITE} />
          <Circle cx={13}   cy={17.5} r={1.5} fill={WHITE} />
          <Circle cx={18.5} cy={17.5} r={1.5} fill={WHITE} />
          <Circle cx={7.5}  cy={21.5} r={1.5} fill={WHITE} />
          <Circle cx={13}   cy={21.5} r={1.5} fill={WHITE} />
          <Circle cx={18.5} cy={21.5} r={1.5} fill={WHITE} />
        </>
      ) : (
        <>
          <Rect x={2} y={7} width={22} height={17} rx={3} stroke={INACTIVE} strokeWidth={1.8} fill="none" />
          <Line x1={2} y1={13} x2={24} y2={13} stroke={INACTIVE} strokeWidth={1} />
          <Line x1={8.5}  y1={7} x2={8.5}  y2={4} stroke={INACTIVE} strokeWidth={2} strokeLinecap="round" />
          <Line x1={17.5} y1={7} x2={17.5} y2={4} stroke={INACTIVE} strokeWidth={2} strokeLinecap="round" />
          {/* Enklare prickar i outline-läge */}
          <Circle cx={7.5}  cy={17.5} r={1.5} stroke={INACTIVE} strokeWidth={1} fill="none" />
          <Circle cx={13}   cy={17.5} r={1.5} stroke={INACTIVE} strokeWidth={1} fill="none" />
          <Circle cx={18.5} cy={17.5} r={1.5} stroke={INACTIVE} strokeWidth={1} fill="none" />
        </>
      )}
    </Svg>
  );
}

// ─── NavProfile ───────────────────────────────────────────────────────────────
// Person. Aktiv: fylld kropp.
export function NavProfile({ active }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 26 26">
      {active ? (
        <>
          <Circle cx={13} cy={9} r={5.5} fill={GOLD} />
          <Path d="M4,24.5 Q4,17 13,17 Q22,17 22,24.5 Z" fill={GOLD} />
        </>
      ) : (
        <>
          <Circle cx={13} cy={9} r={5.5} stroke={INACTIVE} strokeWidth={1.8} fill="none" />
          <Path d="M4,24.5 Q4,17 13,17 Q22,17 22,24.5" stroke={INACTIVE} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

// ─── NavBusiness ──────────────────────────────────────────────────────────────
// Shoppingväska/butik. Aktiv: fylld (guld) + vit detalj.
export function NavBusiness({ active }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 26 26">
      {active ? (
        <>
          <Rect x={4} y={12} width={18} height={12} rx={2.5} fill={GOLD} />
          <Path
            d="M9,12 L9,9 Q9,4 13,4 Q17,4 17,9 L17,12"
            stroke={GOLD} strokeWidth={2} fill="none"
            strokeLinecap="round" strokeLinejoin="round"
          />
          {/* Vit spänne-detalj */}
          <Rect x={10} y={18} width={6} height={2} rx={1} fill={WHITE} />
        </>
      ) : (
        <>
          <Rect x={4} y={12} width={18} height={12} rx={2.5} stroke={INACTIVE} strokeWidth={1.8} fill="none" />
          <Path
            d="M9,12 L9,9 Q9,4 13,4 Q17,4 17,9 L17,12"
            stroke={INACTIVE} strokeWidth={1.8} fill="none"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}
