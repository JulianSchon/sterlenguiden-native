/**
 * Hjärtat, som en gilla-knapp i de stora apparna: gillar man trycks hjärtat ihop, poppar upp större
 * och fjädrar tillbaka, och en ring och prickar (LikeBurst) sprutar ut runt det — med en vibration.
 * Tar man bort gillningen krymper det bara lite och studsar tillbaka.
 *
 * Ringen och prickarna är EN uppsättning per sida (useLikeBurst + <LikeBurst/> längst ner på sidan)
 * som flyttas till hjärtat man trycker på — inte en per kort, det gjorde långa listor tröga.
 */
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Reanimated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Heart } from "lucide-react-native";

const RED = "#EF4444";
const GOLD = "#C5A059";
const PARTICLES = 8;
const PARTICLE_COLORS = [RED, GOLD];

export type BurstFn = (x: number, y: number, size: number) => void;

interface Burst {
  progress: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  size: SharedValue<number>;
}

/** Sidans gemensamma ring och prickar: `show` flyttar dit och spelar upp dem */
export function useLikeBurst(): { burst: Burst; show: BurstFn } {
  const progress = useSharedValue(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const size = useSharedValue(28);
  const show = useCallback<BurstFn>((bx, by, bsize) => {
    x.value = bx;
    y.value = by;
    size.value = bsize;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) });
  }, [progress, x, y, size]);
  return { burst: { progress, x, y, size }, show };
}

export function HeartButton({
  isFav, onToggle, onBurst, size = 28, label = "favoriter",
}: {
  isFav: boolean; onToggle: () => void; onBurst: BurstFn; size?: number;
  /** Vad man sparar till, för skärmläsaren ("Spara i favoriter") */
  label?: string;
}) {
  const scale = useSharedValue(1);
  // Den röda fyllningen som eget lager: tänds direkt när man gillar (popen döljer bytet), men tonas
  // ut mjukt när man avmarkerar — att den försvann tvärt gjorde avmarkeringen hård
  const fill = useSharedValue(isFav ? 1 : 0);
  useEffect(() => {
    fill.value = isFav ? 1 : withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [isFav, fill]);
  const box = useRef<View>(null);
  const press = () => {
    if (!isFav) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      scale.value = withSequence(
        withTiming(0.6, { duration: 80, easing: Easing.in(Easing.quad) }),
        withTiming(1.35, { duration: 150, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 260 }),
      );
      box.current?.measureInWindow((x, y, w, h) => onBurst(x + w / 2, y + h / 2, size));
    } else {
      // Avmarkera: en lugn utandning — sjunker lite och glider tillbaka, ingen studs
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      scale.value = withSequence(
        withTiming(0.82, { duration: 130, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
      );
    }
    onToggle();
  };
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  return (
    <TouchableOpacity
      style={s.heartBtn}
      activeOpacity={0.8}
      hitSlop={10}
      onPress={press}
      accessibilityLabel={isFav ? `Ta bort från ${label}` : `Spara i ${label}`}
    >
      <View ref={box} collapsable={false}>
        <Reanimated.View style={heartStyle}>
          <Heart size={size} color={RED} fill="transparent" strokeWidth={2} />
          <Reanimated.View style={[StyleSheet.absoluteFill, fillStyle]}>
            <Heart size={size} color={RED} fill={RED} strokeWidth={2} />
          </Reanimated.View>
        </Reanimated.View>
      </View>
    </TouchableOpacity>
  );
}

/** Ring och prickar runt hjärtat man just gillade — läggs sist på sidan, ovanpå allt */
export function LikeBurst({ burst }: { burst: Burst }) {
  const { progress, x, y, size } = burst;
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15, 1], [0, 0.55, 0]),
    width: size.value,
    height: size.value,
    borderRadius: size.value / 2,
    transform: [
      { translateX: x.value - size.value / 2 },
      { translateY: y.value - size.value / 2 },
      { scale: interpolate(progress.value, [0, 1], [0.4, 1.9]) },
    ],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Reanimated.View style={[s.heartRing, ringStyle]} />
      {Array.from({ length: PARTICLES }, (_, i) => (
        <HeartParticle key={i} index={i} burst={burst} />
      ))}
    </View>
  );
}

function HeartParticle({ index, burst }: { index: number; burst: Burst }) {
  const { progress, x, y, size } = burst;
  const angle = (index / PARTICLES) * Math.PI * 2 - Math.PI / 2;
  const dot = index % 2 === 0 ? 6 : 4.5;
  const style = useAnimatedStyle(() => {
    const r = interpolate(progress.value, [0, 1], [size.value * 0.35, size.value * 1.15]);
    return {
      opacity: interpolate(progress.value, [0, 0.1, 0.75, 1], [0, 1, 0.8, 0]),
      transform: [
        { translateX: x.value - dot / 2 + Math.cos(angle) * r },
        { translateY: y.value - dot / 2 + Math.sin(angle) * r },
        { scale: interpolate(progress.value, [0, 1], [1, 0.3]) },
      ],
    };
  });
  return (
    <Reanimated.View
      style={[{ position: "absolute", left: 0, top: 0, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: PARTICLE_COLORS[index % 2] }, style]}
    />
  );
}

const s = StyleSheet.create({
  heartBtn: { paddingTop: 2, paddingHorizontal: 4 },
  heartRing: { position: "absolute", left: 0, top: 0, borderWidth: 2, borderColor: RED },
});
