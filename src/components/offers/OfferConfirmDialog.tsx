/**
 * Bekräftelsedialog innan ett erbjudande aktiveras.
 *
 * Sista spärren: när användaren trycker "Aktivera" startar 60-sekunders-
 * nedräkningen direkt och erbjudandet räknas som förbrukat. Texten är därför
 * skriven för att få folk att vänta tills de faktiskt står vid kassan.
 * Färger och text följer tema och språk.
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, Animated, Easing, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { Canvas, RoundedRect, LinearGradient, RadialGradient, vec } from "@shopify/react-native-skia";
import { ACTIVE_SECS } from "@/lib/offers";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const { width: SW } = Dimensions.get("window");
const CARD_W = Math.min(384, SW - 48);

export function OfferConfirmDialog({
  visible,
  dealText,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  dealText: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const d = useThemedStyles(createStyles);
  const anim = useRef(new Animated.Value(0)).current;
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Ligger kvar tills utgångsanimationen är klar, med den senaste texten (dealText töms när rutan stängs)
  const [mounted, setMounted] = useState(visible);
  const lastDeal = useRef(dealText);
  if (visible) lastDeal.current = dealText;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      anim.setValue(0);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 340,
        damping: 26,
        mass: 0.9,
      }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true })
        .start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible]);

  const cardStyle = {
    opacity: anim,
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
    ],
  };

  if (!mounted) return null;

  return (
    // Under utgångsanimationen tar rutan inte emot fler tryck
    <Animated.View style={[d.overlay, { opacity: anim }]} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View
        style={[d.card, cardStyle]}
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {/* Bakgrund i Skia: gradient, ett gyllene sken uppe till vänster och en kant som tonar ut */}
        {box.w > 0 && (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <RoundedRect x={0} y={0} width={box.w} height={box.h} r={24}>
              <LinearGradient start={vec(0, 0)} end={vec(0, box.h)} colors={[colors.cardTop, colors.cardBottom]} />
            </RoundedRect>
            <RoundedRect x={0} y={0} width={box.w} height={box.h} r={24}>
              <RadialGradient c={vec(50, 40)} r={box.w * 0.8} colors={["rgba(212,168,79,0.18)", "rgba(212,168,79,0)"]} />
            </RoundedRect>
            <RoundedRect x={0.75} y={0.75} width={box.w - 1.5} height={box.h - 1.5} r={23.25} style="stroke" strokeWidth={1.5}>
              <LinearGradient start={vec(0, 0)} end={vec(box.w, box.h)} colors={["rgba(232,198,116,0.7)", "rgba(232,198,116,0.12)", "rgba(232,198,116,0.3)"]} />
            </RoundedRect>
          </Canvas>
        )}

        <View style={d.logoCircle}>
          <Image source={require("../../../assets/Osterlenappen-logo.png")} style={d.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>

        <Text style={d.title}>{t("offers.confirm.title")}</Text>
        <Text style={d.body}>{t("offers.confirm.body", { deal: lastDeal.current, secs: ACTIVE_SECS })}</Text>

        <View style={d.buttonRow}>
          <Pressable style={d.cancelBtn} onPress={onCancel}>
            <Text style={d.cancelText}>{t("common.cancel")}</Text>
          </Pressable>

          <Pressable style={d.confirmBtn} onPress={onConfirm}>
            <Text style={d.confirmText}>{t("offers.confirm.activate")}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  // Överlägg, inte egen Modal: iOS vägrar visa en modal ovanpå en annan,
  // och den här ligger alltid inuti drawerns modal
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: c.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: CARD_W,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 24,
  },
  logoCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: c.goldSoft,
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  logo: { width: 30, height: 34 },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: c.text, marginBottom: 8 },
  body: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, color: c.muted, marginBottom: 20 },
  buttonRow: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: 12,
    backgroundColor: c.fill,
    borderWidth: 1, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text },
  confirmBtn: {
    flex: 1, height: 48, borderRadius: 12,
    backgroundColor: c.gold,
    alignItems: "center", justifyContent: "center",
  },
  confirmText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.onGold },
});
