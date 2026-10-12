/**
 * Ram runt en profilbild. Ringen ritas ovanpå, utanför bilden, och påverkar inte
 * layouten: bilden behåller sin storlek och plats. Ringar definieras i
 * src/lib/avatarRings.ts.
 */
import type { ReactNode } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { AVATAR_RINGS, findRing } from "@/lib/avatarRings";

/** Själva ringen, ritad utanför en bild med diametern `size`. Ritar inget för "none". */
function RingOverlay({ ring, size }: { ring: string; size: number }) {
  const def = findRing(ring);
  // Ringar med egen bild (spelramar): bilden skalas så att hålet precis omsluter profilbilden
  if (def?.image) {
    const full = size / (def.holeRatio ?? 0.72);
    const pad = (full - size) / 2;
    return (
      <View style={{ position: "absolute", left: -pad, top: -pad, width: full, height: full }} pointerEvents="none">
        <Image source={def.image} style={{ width: full, height: full }} resizeMode="contain" />
      </View>
    );
  }
  // Reservring i ringens egna färger tills bilden finns
  if (def?.colors) return <MetalRing size={size} colors={def.colors} id={def.id} />;
  return null;
}

/** Enkel tjock metallring (ljus → mörk) med tunna kanter — reserv tills ringens bild finns. */
function MetalRing({ size, colors, id }: { size: number; colors: [string, string, string]; id: string }) {
  const stroke = Math.max(3, size * 0.09);
  const gap = size * 0.03;
  const radius = size / 2 + gap + stroke / 2;
  const pad = gap + stroke + 2;
  const total = size + pad * 2;
  const c = total / 2;
  const grad = `ringMetal-${id}`;
  return (
    <Svg width={total} height={total} style={{ position: "absolute", left: -pad, top: -pad }} pointerEvents="none">
      <Defs>
        <LinearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="0.5" stopColor={colors[1]} />
          <Stop offset="1" stopColor={colors[2]} />
        </LinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={radius} stroke={`url(#${grad})`} strokeWidth={stroke} fill="none" />
      <Circle cx={c} cy={c} r={radius - stroke / 2 + 0.6} stroke="rgba(0,0,0,0.35)" strokeWidth={1.2} fill="none" />
      <Circle cx={c} cy={c} r={radius + stroke / 2 - 0.6} stroke="rgba(255,255,255,0.35)" strokeWidth={1} fill="none" />
    </Svg>
  );
}

export function AvatarRing({ ring, size, children }: { ring?: string | null; size: number; children: ReactNode }) {
  if (!ring || ring === "none" || !findRing(ring)) return <>{children}</>;
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
