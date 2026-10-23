/**
 * Ringen runt en berättelse (Hem och platssidan): gul-orange när det finns något man inte sett,
 * heldragen grå när man sett allt. Ett tryck: ringen blir streckad och snurrar medan berättelsens
 * bild laddas (som i Instagram), sen öppnas den. Snurren går på UI-tråden.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { StyleSheet, View } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { STORY_GRADIENT } from "@/theme/storyGradient";
import { useTheme } from "@/theme/ThemeProvider";
import type { StoryGroupData, StoryOrigin } from "@/components/stories/StoryViewer";

/** Snurren: minst så här länge (så den syns), högst så här länge (sen öppnas den ändå) */
const LOAD_MIN_MS = 260;
const LOAD_MAX_MS = 1500;

/** Sedd: diskret grå, ljusare i ljust läge */
const seenGradient = (dark: boolean) => ({
  stops: dark
    ? [{ offset: "0%", color: "#484848" }, { offset: "100%", color: "#303030" }]
    : [{ offset: "0%", color: "#CFC8BA" }, { offset: "100%", color: "#B5AD9D" }],
  x1: "0", y1: "1", x2: "1", y2: "0",
});

/** Ringens yttre storlek för en bild som är `inner` stor */
export const storyRingSize = (inner: number, gap: number, stroke: number) => Math.ceil(2 * (inner / 2 + gap + stroke / 2 + stroke) + 2);

export function StoryRing({ id, inner, gap, stroke, seen, loading, children }: {
  /** Unikt för ringen (SVG-gradientens namn) */
  id: string;
  /** Bildens storlek */
  inner: number;
  /** Luft mellan bilden och ringen */
  gap: number;
  stroke: number;
  seen: boolean;
  loading: boolean;
  children: ReactNode;
}) {
  const { scheme } = useTheme();
  const outer = storyRingSize(inner, gap, stroke);
  const center = outer / 2;
  const radius = inner / 2 + gap + stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const grad = seen ? seenGradient(scheme === "dark") : STORY_GRADIENT;
  const gradId = `story-ring-${id}`;

  const spin = useSharedValue(0);
  useEffect(() => {
    if (!loading) {
      // Tillbaka i utgångsläget, så gradienten inte står snett där snurren slutade
      cancelAnimation(spin);
      spin.value = 0;
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [loading, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  return (
    <View style={{ width: outer, height: outer, alignItems: "center", justifyContent: "center" }}>
      <Reanimated.View style={[StyleSheet.absoluteFill, spinStyle]}>
        <Svg width={outer} height={outer}>
          <Defs>
            <LinearGradient id={gradId} x1={grad.x1} y1={grad.y1} x2={grad.x2} y2={grad.y2}>
              {grad.stops.map((stop) => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity="1" />)}
            </LinearGradient>
          </Defs>
          {/* En egen cirkel för streckad och heldragen: tas strecken bort från samma cirkel ritar
              react-native-svg dem kvar, och den sedda ringen blev streckad */}
          {loading ? (
            <Circle
              key="loading"
              cx={center} cy={center} r={radius}
              stroke={`url(#${gradId})`} strokeWidth={stroke} fill="none" strokeLinecap="round"
              // 14 streck runt hela varvet
              strokeDasharray={`${(circumference / 14) * 0.55} ${(circumference / 14) * 0.45}`}
            />
          ) : (
            <Circle key="solid" cx={center} cy={center} r={radius} stroke={`url(#${gradId})`} strokeWidth={stroke} fill="none" />
          )}
        </Svg>
      </Reanimated.View>
      {children}
    </View>
  );
}

/**
 * Trycket på en ring: laddar berättelsens första bild (ringen snurrar under tiden) och öppnar den
 * sen, från bildens plats på skärmen. `imageRef` är bilden inuti ringen.
 */
export function useStoryTap(
  group: StoryGroupData | null,
  imageRef: RefObject<View | null>,
  onOpen: (group: StoryGroupData, origin: StoryOrigin | null) => void,
) {
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const tap = useCallback(() => {
    if (!group || busy.current) return;
    busy.current = true;
    Haptics.selectionAsync().catch(() => {});
    setLoading(true);
    const first = group.stories[0]?.image_url;
    const started = Date.now();
    const loaded = first ? ExpoImage.prefetch(first).catch(() => false) : Promise.resolve(true);
    const timeout = new Promise((r) => setTimeout(r, LOAD_MAX_MS));
    Promise.race([loaded, timeout]).then(() => {
      const wait = Math.max(0, LOAD_MIN_MS - (Date.now() - started));
      setTimeout(() => {
        const done = (origin: StoryOrigin | null) => {
          onOpen(group, origin);
          setTimeout(() => { setLoading(false); busy.current = false; }, 450);
        };
        if (!imageRef.current) return done(null);
        imageRef.current.measureInWindow((x, y, w) => done({ x, y, size: w }));
      }, wait);
    });
  }, [group, imageRef, onOpen]);
  return { loading, tap };
}
