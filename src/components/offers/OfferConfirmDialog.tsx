/**
 * Bekräftelsedialog innan ett erbjudande aktiveras.
 *
 * Sista spärren: när användaren trycker "Aktivera" startar 60-sekunders-
 * nedräkningen direkt och erbjudandet räknas som förbrukat. Texten är därför
 * skriven för att få folk att vänta tills de faktiskt står vid kassan.
 * Färger och text följer tema och språk.
 */
import { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { Crown } from "lucide-react-native";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
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

  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 340,
        damping: 26,
        mass: 0.9,
      }).start();
    }
  }, [visible]);

  const cardStyle = {
    opacity: anim,
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
    ],
  };

  if (!visible) return null;

  return (
    <View style={d.overlay}>
      <Animated.View style={[d.card, cardStyle]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGrad id="confirmBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={colors.cardTop} />
              <Stop offset="100%" stopColor={colors.cardBottom} />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#confirmBg)" />
        </Svg>

        <View style={d.crownCircle}>
          <Crown size={20} color={colors.goldText} strokeWidth={2} />
        </View>

        <Text style={d.title}>{t("offers.confirm.title")}</Text>
        <Text style={d.body}>{t("offers.confirm.body", { deal: dealText, secs: ACTIVE_SECS })}</Text>

        <View style={d.buttonRow}>
          <Pressable style={d.cancelBtn} onPress={onCancel}>
            <Text style={d.cancelText}>{t("common.cancel")}</Text>
          </Pressable>

          <Pressable style={d.confirmBtn} onPress={onConfirm}>
            <Text style={d.confirmText}>{t("offers.confirm.activate")}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
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
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.goldBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 24,
  },
  crownCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.goldSoft,
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
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
