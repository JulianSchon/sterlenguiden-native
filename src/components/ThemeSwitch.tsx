/**
 * Temavalet som en svepknapp i appens egna färger: svart till vänster (mörkt),
 * varmt linne som går mot guld till höger (ljust). Bakgrunden fylls av ljus efter
 * knappen medan man drar, och rörelsen
 * körs helt på UI-tråden så den följer fingret utan fördröjning. Släpp förbi
 * mitten (eller ge den en knuff) så tar knappen resten av vägen, och temat byts
 * när den kommit fram. Ett enkelt tryck byter också.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { Moon, Sun } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation, interpolate, interpolateColor, runOnJS, useAnimatedReaction, useAnimatedStyle,
  useDerivedValue, useSharedValue, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme/ThemeProvider";

const HANDLE = 56;
const PAD = 6;
const HEIGHT = HANDLE + PAD * 2;
/** Mitten av etiketterna, mätt från respektive kant, används för att växla deras färg */
const LABEL_CENTER = HANDLE + PAD + 14 + 34;
const SPRING = { damping: 18, stiffness: 220, mass: 0.6 };

const BLACK = ["#0A0A0A", "#121212", "#1A1A1A"];
const LINEN = ["#F6F1E4", "#EBDDB7", "#D8B872"];
const GOLD = "#E8C674";

/** `progress` (valfri) får löpande värdet 0–1 så att sidan kan färga om sig i takt med knappen. */
export function ThemeSwitch({ progress: report }: { progress?: SharedValue<number> } = {}) {
  const { t } = useTranslation();
  const { mode, setMode } = useTheme();
  const [width, setWidth] = useState(0);

  const trackW = useSharedValue(0);
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const pressed = useSharedValue(0);
  const crossed = useSharedValue(false);
  const placed = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const commit = useCallback((toLight: boolean) => {
    const next = toLight ? "light" : "dark";
    if (modeRef.current === next) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMode(next);
  }, [setMode]);
  const tick = useCallback(() => { Haptics.selectionAsync().catch(() => {}); }, []);

  // Knappen står där temat är (och följer med om temat ändras på annat håll)
  useEffect(() => {
    if (width <= 0) return;
    const target = mode === "light" ? width - HANDLE - PAD * 2 : 0;
    if (!placed.current) {
      placed.current = true;
      x.value = target;
    } else {
      x.value = withSpring(target, SPRING);
    }
  }, [mode, width, x]);

  const travel = () => {
    "worklet";
    return Math.max(0, trackW.value - HANDLE - PAD * 2);
  };
  const finish = (toLight: boolean) => {
    "worklet";
    x.value = withSpring(toLight ? travel() : 0, SPRING, (done) => {
      if (done) runOnJS(commit)(toLight);
    });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      startX.value = x.value;
      pressed.value = withTiming(1, { duration: 120 });
      crossed.value = x.value > travel() / 2;
    })
    .onUpdate((e) => {
      const range = travel();
      const next = Math.min(range, Math.max(0, startX.value + e.translationX));
      x.value = next;
      const past = next > range / 2;
      if (past !== crossed.value) {
        crossed.value = past;
        runOnJS(tick)();
      }
    })
    .onEnd((e) => {
      const flick = Math.abs(e.velocityX) > 700;
      finish(flick ? e.velocityX > 0 : x.value > travel() / 2);
    })
    .onFinalize(() => {
      pressed.value = withTiming(0, { duration: 160 });
    });

  const tap = Gesture.Tap()
    .maxDistance(8)
    .onEnd((_e, success) => {
      if (success) finish(x.value < travel() / 2);
    });

  const gesture = Gesture.Race(pan, tap);

  // 0 = natt, 1 = gryning
  const progress = useDerivedValue(() => {
    const range = travel();
    return range > 0 ? x.value / range : 0;
  });
  useAnimatedReaction(
    () => progress.value,
    (value) => {
      if (report) report.value = value;
    }
  );

  // Ljusets högra kant: noll när knappen står till vänster (inget ljus alls),
  // knappens mitt på halva vägen och hela bandet när knappen är framme
  const edge = useDerivedValue(() => {
    const range = travel();
    if (range <= 0) return 0;
    return interpolate(x.value, [0, range], [0, trackW.value], Extrapolation.CLAMP);
  });

  const trackStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], ["rgba(197,160,89,0.35)", "#1D1B16"]),
  }));
  const revealStyle = useAnimatedStyle(() => ({ width: edge.value }));
  const handleStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [GOLD, "#121212"]),
    transform: [{ translateX: x.value }, { scale: 1 + 0.07 * pressed.value }],
  }));
  const moonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.45], [1, 0], Extrapolation.CLAMP),
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, -40])}deg` }],
  }));
  const sunStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [-90, 0])}deg` }],
  }));
  // Etiketterna byter färg när ljuset passerat dem: den aktiva är stark, den andra dämpad
  const darkLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(edge.value, [LABEL_CENTER - 16, LABEL_CENTER + 16], ["#F5F1E8", "#8A7648"]),
  }));
  const lightLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(edge.value, [trackW.value - LABEL_CENTER - 16, trackW.value - LABEL_CENTER + 16], ["#7C7869", "#1D1B16"]),
  }));

  return (
    <>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[s.track, trackStyle]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            trackW.value = w;
            setWidth(w);
          }}
          accessible
          accessibilityRole="switch"
          accessibilityState={{ checked: mode === "light" }}
          accessibilityLabel={t("appearance.theme")}
          onAccessibilityTap={() => commit(mode !== "light")}
        >
          {width > 0 && (
            <>
              {/* Svart botten med ett svagt guldsken i högra änden, som antyder vart man är på väg */}
              <Svg width={width} height={HEIGHT} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id="black" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={BLACK[0]} />
                    <Stop offset="0.6" stopColor={BLACK[1]} />
                    <Stop offset="1" stopColor={BLACK[2]} />
                  </LinearGradient>
                  <RadialGradient id="sheen" cx="1" cy="0.5" rx="0.45" ry="0.9">
                    <Stop offset="0" stopColor="#C5A059" stopOpacity="0.22" />
                    <Stop offset="1" stopColor="#C5A059" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#black)" />
                <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#sheen)" />
              </Svg>

              {/* Linnet: ljust band som fylls efter knappen. Gradienten ligger still, det är öppningen som växer */}
              <Animated.View style={[s.reveal, revealStyle]}>
                <Svg width={width} height={HEIGHT}>
                  <Defs>
                    <LinearGradient id="linen" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={LINEN[0]} />
                      <Stop offset="0.55" stopColor={LINEN[1]} />
                      <Stop offset="1" stopColor={LINEN[2]} />
                    </LinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#linen)" />
                </Svg>
              </Animated.View>
            </>
          )}

          <Animated.Text style={[s.label, { left: HANDLE + PAD + 14 }, darkLabelStyle]} pointerEvents="none">
            {t("appearance.themeDark")}
          </Animated.Text>
          <Animated.Text style={[s.label, { right: HANDLE + PAD + 14 }, lightLabelStyle]} pointerEvents="none">
            {t("appearance.themeLight")}
          </Animated.Text>

          <Animated.View style={[s.handle, handleStyle]} pointerEvents="none">
            <Animated.View style={[StyleSheet.absoluteFill, s.center, moonStyle]}>
              <Moon size={24} color="#111111" strokeWidth={1.8} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, s.center, sunStyle]}>
              <Sun size={24} color={GOLD} strokeWidth={1.8} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const s = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: HEIGHT / 2, borderWidth: 1.5, overflow: "hidden", justifyContent: "center" },
  reveal: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: HEIGHT / 2, overflow: "hidden" },
  handle: {
    position: "absolute", left: PAD, top: PAD, width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  center: { alignItems: "center", justifyContent: "center" },
  label: {
    position: "absolute", top: 0, bottom: 0, textAlignVertical: "center", lineHeight: HEIGHT,
    fontFamily: "Montserrat_600SemiBold", fontSize: 14, letterSpacing: 0.3,
  },
});
