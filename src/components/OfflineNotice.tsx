/**
 * "Du är utan nät" — en kort rad överst när något inte kunde sparas för att nätet saknas
 * (lib/network: notifyOffline). Tonar bort av sig själv. Hjärtan och svep sparas i stället när
 * nätet är tillbaka (lib/outbox) och visar inget.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WifiOff } from "lucide-react-native";
import i18n from "i18next";
import { onOffline } from "@/lib/network";

export function OfflineNotice() {
  const insets = useSafeAreaInsets();
  const v = useSharedValue(0);
  const [, setShown] = useState(0);
  useEffect(() => onOffline(() => {
    setShown((n) => n + 1);
    v.value = withSequence(withTiming(1, { duration: 180 }), withDelay(2800, withTiming(0, { duration: 260 })));
  }), [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * -10 }] }));
  return (
    <Reanimated.View style={[s.toast, { top: insets.top + 8 }, style]} pointerEvents="none" accessibilityLiveRegion="polite">
      <WifiOff size={15} color="#FFFFFF" strokeWidth={2.4} />
      <Text style={s.text}>{i18n.t("common.offline")}</Text>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  // Mörk i båda lägena, som andra korta besked i appen
  toast: {
    position: "absolute", alignSelf: "center", maxWidth: "90%", zIndex: 100, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "#1C1C1E",
  },
  text: { flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: "#FFFFFF" },
});
