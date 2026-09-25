/**
 * Temavalet som en svepknapp: mörkt till vänster, ljust till höger. Dra knappen
 * hela vägen (eller tryck) så byter appen tema när den nått fram. Bakgrunden går
 * från mörk till ljus så man ser vart man är på väg.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Moon, Sun } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/theme/ThemeProvider";

const HANDLE = 52;
const PAD = 6;
const HEIGHT = HANDLE + PAD * 2;
/** Så långt (i pixlar) räknas en rörelse som ett drag och inte som ett tryck */
const TAP_SLOP = 6;

export function ThemeSwitch() {
  const { t } = useTranslation();
  const { mode, setMode, colors } = useTheme();
  const [width, setWidth] = useState(0);
  const travel = Math.max(0, width - HANDLE - PAD * 2);

  // 0 = mörkt, 1 = ljust
  const progress = useRef(new Animated.Value(mode === "light" ? 1 : 0)).current;
  const start = useRef(0);
  // PanResponder skapas en gång men behöver senaste värdena
  const latest = useRef({ mode, travel, setMode });
  latest.current = { mode, travel, setMode };

  const settle = (target: 0 | 1) => {
    Animated.spring(progress, { toValue: target, friction: 9, tension: 80, useNativeDriver: false }).start(({ finished }) => {
      const next = target === 1 ? "light" : "dark";
      if (finished && latest.current.mode !== next) {
        Haptics.selectionAsync().catch(() => {});
        latest.current.setMode(next);
      }
    });
  };

  // Om temat ändras på annat håll följer knappen med
  useEffect(() => {
    Animated.spring(progress, { toValue: mode === "light" ? 1 : 0, friction: 9, tension: 80, useNativeDriver: false }).start();
  }, [mode, progress]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        progress.stopAnimation((value) => { start.current = value; });
      },
      onPanResponderMove: (_, g) => {
        const { travel: range } = latest.current;
        if (range <= 0) return;
        progress.setValue(Math.min(1, Math.max(0, start.current + g.dx / range)));
      },
      onPanResponderRelease: (_, g) => {
        const { mode: current, travel: range } = latest.current;
        if (Math.abs(g.dx) < TAP_SLOP) return settle(current === "dark" ? 1 : 0);
        const p = Math.min(1, Math.max(0, start.current + g.dx / Math.max(range, 1)));
        settle(p > 0.5 ? 1 : 0);
      },
      onPanResponderTerminate: () => settle(latest.current.mode === "light" ? 1 : 0),
    })
  ).current;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  const handleColor = progress.interpolate({ inputRange: [0, 1], outputRange: ["#FFFFFF", "#1D1B16"] });
  const moonOpacity = progress.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: "clamp" });
  const sunOpacity = progress.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: "clamp" });

  return (
    <View style={{ gap: 10 }}>
      <View
        style={[s.track, { borderColor: colors.borderStrong }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="switch"
        accessibilityState={{ checked: mode === "light" }}
        {...pan.panHandlers}
      >
        {width > 0 && (
          <Svg width={width} height={HEIGHT} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="themeTrack" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#0B0B0D" />
                <Stop offset="0.42" stopColor="#1C1C20" />
                <Stop offset="0.58" stopColor="#E4DDCA" />
                <Stop offset="1" stopColor="#F4EFE1" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#themeTrack)" />
          </Svg>
        )}

        <View style={[s.label, { left: HANDLE + PAD + 14 }]} pointerEvents="none">
          <Moon size={14} color="#F5F1E8" strokeWidth={1.8} />
          <Text style={[s.labelText, { color: "#F5F1E8" }]}>{t("appearance.themeDark")}</Text>
        </View>
        <View style={[s.label, { right: HANDLE + PAD + 14 }]} pointerEvents="none">
          <Text style={[s.labelText, { color: "#1D1B16" }]}>{t("appearance.themeLight")}</Text>
          <Sun size={14} color="#1D1B16" strokeWidth={1.8} />
        </View>

        <Animated.View style={[s.handle, { backgroundColor: handleColor, transform: [{ translateX }] }]} pointerEvents="none">
          <Animated.View style={[StyleSheet.absoluteFill, s.center, { opacity: moonOpacity }]}>
            <Moon size={22} color="#111111" strokeWidth={1.8} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, s.center, { opacity: sunOpacity }]}>
            <Sun size={22} color="#F0D080" strokeWidth={1.8} />
          </Animated.View>
        </Animated.View>
      </View>

      {mode === "dark" && <Text style={[s.recommended, { color: colors.goldText }]}>{t("appearance.themeRecommended")}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: HEIGHT / 2, borderWidth: 1, overflow: "hidden", justifyContent: "center" },
  handle: {
    position: "absolute", left: PAD, top: PAD, width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 4,
  },
  center: { alignItems: "center", justifyContent: "center" },
  label: { position: "absolute", top: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 7 },
  labelText: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, letterSpacing: 0.2 },
  recommended: { fontFamily: "Inter_500Medium", fontSize: 12, textAlign: "center" },
});
