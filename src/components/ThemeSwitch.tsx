/**
 * Temavalet som en svepknapp: natt till vänster (mörkt), gryning till höger
 * (ljust). Bakgrunden fylls av ljus efter knappen medan man drar, och rörelsen
 * körs helt på UI-tråden så den följer fingret utan fördröjning. Släpp förbi
 * mitten (eller ge den en knuff) så tar knappen resten av vägen, och temat byts
 * när den kommit fram. Ett enkelt tryck byter också.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Moon, Sun } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation, interpolate, interpolateColor, runOnJS, useAnimatedStyle,
  useDerivedValue, useSharedValue, withSpring, withTiming,
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

const NIGHT = ["#07080C", "#121620", "#1E2433"];
const DAWN = ["#FFFDF5", "#F7EDCF", "#F0D9A0"];
const STARS = [[0.30, 0.30, 1.2], [0.40, 0.68, 1], [0.52, 0.34, 1.4], [0.60, 0.72, 1], [0.70, 0.28, 1.1], [0.78, 0.62, 1.3], [0.88, 0.36, 1]];

export function ThemeSwitch() {
  const { t } = useTranslation();
  const { mode, setMode, colors } = useTheme();
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
  // Ljusets högra kant: följer knappen och fyller hela bandet när knappen är framme
  const edge = useDerivedValue(() => {
    const range = travel();
    if (range <= 0) return 0;
    return interpolate(x.value, [0, range], [HANDLE / 2 + PAD, trackW.value], Extrapolation.CLAMP);
  });

  const trackStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], ["rgba(255,255,255,0.10)", "rgba(120,95,30,0.35)"]),
  }));
  const revealStyle = useAnimatedStyle(() => ({ width: edge.value }));
  const handleStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["#FFFFFF", "#1D1B16"]),
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
    color: interpolateColor(edge.value, [LABEL_CENTER - 16, LABEL_CENTER + 16], ["#F5F1E8", "#9A8B62"]),
  }));
  const lightLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(edge.value, [trackW.value - LABEL_CENTER - 16, trackW.value - LABEL_CENTER + 16], ["#7E8497", "#1D1B16"]),
  }));

  return (
    <View style={{ gap: 10 }}>
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
              {/* Natten: mörk gradient med några stjärnor */}
              <Svg width={width} height={HEIGHT} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id="night" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={NIGHT[0]} />
                    <Stop offset="0.6" stopColor={NIGHT[1]} />
                    <Stop offset="1" stopColor={NIGHT[2]} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#night)" />
                {STARS.map(([fx, fy, r], i) => (
                  <Circle key={i} cx={width * fx} cy={HEIGHT * fy} r={r} fill="#FFFFFF" opacity={0.45} />
                ))}
              </Svg>

              {/* Gryningen: ljust band som fylls efter knappen. Gradienten ligger still, det är öppningen som växer */}
              <Animated.View style={[s.reveal, revealStyle]}>
                <Svg width={width} height={HEIGHT}>
                  <Defs>
                    <LinearGradient id="dawn" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={DAWN[0]} />
                      <Stop offset="0.55" stopColor={DAWN[1]} />
                      <Stop offset="1" stopColor={DAWN[2]} />
                    </LinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#dawn)" />
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
              <Sun size={24} color="#F0D080" strokeWidth={1.8} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {mode === "dark" && <Text style={[s.recommended, { color: colors.goldText }]}>{t("appearance.themeRecommended")}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: HEIGHT / 2, borderWidth: 1, overflow: "hidden", justifyContent: "center" },
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
  recommended: { fontFamily: "Inter_500Medium", fontSize: 12, textAlign: "center" },
});
