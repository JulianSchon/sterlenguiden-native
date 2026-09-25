/**
 * Ram runt en profilbild. Ringen ritas ovanpå, utanför bilden, och påverkar inte
 * layouten: bilden behåller sin storlek och plats. Ringar definieras i
 * src/lib/avatarRings.ts.
 */
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import { AVATAR_RINGS } from "@/lib/avatarRings";

/** En blixt ritad i en ruta på 10 × 10 */
const BOLT = "M6 0 L1.5 5.8 H4.8 L3.6 10 L8.8 3.6 H5.5 Z";
const BOLT_COUNT = 8;

/** Själva ringen, ritad utanför en bild med diametern `size`. Ritar inget för "none". */
function RingOverlay({ ring, size }: { ring: string; size: number }) {
  if (ring !== "gold" && ring !== "lightning") return null;

  const stroke = Math.max(2, size * 0.05);
  const gap = size * 0.04;
  const boltLength = ring === "lightning" ? size * 0.13 : 0;
  // Ringens radie; blixtarna sitter utanför den
  const radius = size / 2 + gap + stroke / 2;
  const pad = gap + stroke + (boltLength ? boltLength + 2 : 0) + 2;
  const total = size + pad * 2;
  const center = total / 2;

  return (
    <Svg width={total} height={total} style={{ position: "absolute", left: -pad, top: -pad }} pointerEvents="none">
      <Defs>
        <LinearGradient id="avatarRingGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F0D080" />
          <Stop offset="0.5" stopColor="#C5A059" />
          <Stop offset="1" stopColor="#9B7A2E" />
        </LinearGradient>
      </Defs>
      <Circle cx={center} cy={center} r={radius} stroke="url(#avatarRingGold)" strokeWidth={stroke} fill="none" />
      {boltLength > 0 && Array.from({ length: BOLT_COUNT }, (_, i) => (
        <G
          key={i}
          transform={`translate(${center} ${center}) rotate(${(360 / BOLT_COUNT) * i}) translate(${-boltLength / 2} ${-(radius + stroke / 2 + boltLength + 1)}) scale(${boltLength / 10})`}
        >
          <Path d={BOLT} fill="url(#avatarRingGold)" />
        </G>
      ))}
    </Svg>
  );
}

export function AvatarRing({ ring, size, children }: { ring?: string | null; size: number; children: ReactNode }) {
  if (ring !== "gold" && ring !== "lightning") return <>{children}</>;
  return (
    <View style={{ width: size, height: size }}>
      {children}
      <RingOverlay ring={ring} size={size} />
    </View>
  );
}

/** Ett lager per ring; bara det valda syns. Toning på UI-tråden, ingen omritning av sidan. */
function RingLayer({ ring, index, size, selectedIdx }: { ring: string; index: number; size: number; selectedIdx: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: withTiming(selectedIdx.value === index ? 1 : 0, { duration: 120 }) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <RingOverlay ring={ring} size={size} />
    </Animated.View>
  );
}

/**
 * Som AvatarRing, men ringen styrs av ett värde (index i AVATAR_RINGS) i stället för
 * en prop. Ändras värdet byter ringen direkt, utan att sidan ritas om. Används på
 * Utseende, där korten ska följa ringvalet i samma stund som man trycker.
 */
export function SwitchableAvatarRing({ selectedIdx, size, children }: { selectedIdx: SharedValue<number>; size: number; children: ReactNode }) {
  return (
    <View style={{ width: size, height: size }}>
      {children}
      {AVATAR_RINGS.map((r, i) => (r.id === "none" ? null : <RingLayer key={r.id} ring={r.id} index={i} size={size} selectedIdx={selectedIdx} />))}
    </View>
  );
}
