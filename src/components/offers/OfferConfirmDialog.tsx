/**
 * Bekräftelsedialog innan ett erbjudande aktiveras.
 *
 * Sista spärren: när användaren trycker "Aktivera" startar 60-sekunders-
 * nedräkningen direkt och erbjudandet räknas som förbrukat. Texten är därför
 * skriven för att få folk att vänta tills de faktiskt står vid kassan.
 */
import { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Dimensions } from "react-native";
import { Crown } from "lucide-react-native";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import { ACTIVE_SECS } from "@/lib/offers";

const FG      = "#F5F1E8";
const GOLD    = "#C5A059";
const GOLD_LT = "#E8C674";

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
          {/* Mörk gradient-yta (#1c1c1f → #121215) */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <SvgGrad id="confirmBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#1C1C1F" />
                <Stop offset="100%" stopColor="#121215" />
              </SvgGrad>
            </Defs>
            <SvgRect width="100%" height="100%" fill="url(#confirmBg)" />
          </Svg>

          <View style={d.crownCircle}>
            <Crown size={20} color={GOLD_LT} strokeWidth={2} />
          </View>

          <Text style={d.title}>Aktivera erbjudande?</Text>
          <Text style={d.body}>
            {dealText} blir aktivt direkt och är giltigt i {ACTIVE_SECS} sekunder.
            Aktivera därför först när du står i receptionen eller kassan.
          </Text>

          <View style={d.buttonRow}>
            <Pressable style={d.cancelBtn} onPress={onCancel}>
              <Text style={d.cancelText}>Avbryt</Text>
            </Pressable>

            <Pressable style={d.confirmBtn} onPress={onConfirm}>
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <SvgGrad id="confirmBtn" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%"   stopColor={GOLD_LT} />
                    <Stop offset="100%" stopColor={GOLD} />
                  </SvgGrad>
                </Defs>
                <SvgRect width="100%" height="100%" fill="url(#confirmBtn)" />
              </Svg>
              <Text style={d.confirmText}>Aktivera</Text>
            </Pressable>
          </View>
      </Animated.View>
    </View>
  );
}

const d = StyleSheet.create({
  // Överlägg, inte egen Modal: iOS vägrar visa en modal ovanpå en annan,
  // och den här ligger alltid inuti drawerns modal
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: "rgba(0,0,0,0.72)",
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
    borderColor: "rgba(197,160,89,0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
    elevation: 24,
  },
  crownCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(212,168,79,0.14)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: FG,
    marginBottom: 8,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: "rgba(255,255,255,0.60)",
    marginBottom: 20,
  },
  buttonRow: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
  confirmBtn: {
    flex: 1, height: 48, borderRadius: 12,
    overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  confirmText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#0B0B0D" },
});
