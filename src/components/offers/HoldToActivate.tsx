/**
 * Håll-inne-knapp för att aktivera ett erbjudande.
 *
 * Kräver en hel sekunds tryck. Det är avsiktligt trögt: ett erbjudande kan
 * oftast bara lösas in en gång, så ett råkat tryck i fickan får inte bränna det.
 * Progressen körs på UI-tråden via Reanimated så fyllnaden aldrig hackar.
 */
import { useState } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Crown } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  cancelAnimation,
  runOnJS,
  interpolateColor,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const HOLD_MS = 1000;

/** Eskalerande vibration när något lyckas — används även av aktiva vyn */
export function celebrationHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), 80);
  setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 180);
}

export function HoldToActivate({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const h = useThemedStyles(createStyles);
  const progress = useSharedValue(0);
  const pressed  = useSharedValue(0);
  const [holding, setHolding] = useState(false);

  const halfwayHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const finish = () => {
    setHolding(false);
    celebrationHaptic();
    // Knappen trycks ned en gnutta som kvittens innan dialogen öppnas
    pressed.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 160 }));
    progress.value = withTiming(0, { duration: 200 });
    onComplete();
  };

  const start = () => {
    setHolding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    progress.value = 0;
    progress.value = withSequence(
      withTiming(0.5, { duration: HOLD_MS / 2, easing: Easing.linear }, (done) => {
        if (done) runOnJS(halfwayHaptic)();
      }),
      withTiming(1, { duration: HOLD_MS / 2, easing: Easing.linear }, (done) => {
        if (done) runOnJS(finish)();
      }),
    );
  };

  const cancel = () => {
    setHolding(false);
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) });
  };

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: pressed.value * 2 },
      { scale: 1 - pressed.value * 0.015 },
    ],
  }));

  // Texten går från guld till mörk först när fyllnaden hunnit under den
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 0.55, 0.75], [colors.goldText, colors.goldText, colors.onGold]),
  }));

  const crownStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0.75 ? 0 : 1,
  }));

  return (
    <Animated.View style={[h.wrap, buttonStyle]}>
      <Pressable
        onPressIn={start}
        onPressOut={cancel}
        style={h.press}
        // Ingen långtrycksmeny — hela gesten ÄR ett långtryck
        delayLongPress={HOLD_MS * 4}
      >
        <Animated.View style={[h.fill, fillStyle]} pointerEvents="none" />
        <View style={h.row}>
          <Animated.View style={crownStyle}>
            <Crown size={15} color={colors.goldText} strokeWidth={2} />
          </Animated.View>
          <Animated.Text style={[h.label, labelStyle]}>
            {holding ? t("offers.hold.holding") : t("offers.hold.idle")}
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  // Dämpad insida med guldkant — fyllnaden är det enda guldiga tills man håller
  wrap: {
    height: 52,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: c.fill,
    borderWidth: 1,
    borderColor: c.goldBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 5,
  },
  press: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    backgroundColor: c.gold,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14.5,
    letterSpacing: 0.3,
  },
});
