/**
 * Vykortet på födelsedagen (visas av belöningsvakten TrophyHost, en gång per år — se useBirthday).
 * Ett vanligt vykort: ett foto från Österlen, en hälsning från oss och appens logga. Det går inte
 * att få något för det — det är bara en hälsning, och försvinner när man stängt det.
 */
import { useRef, useState } from "react";
import { Image, Modal, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useOnModalShown } from "@/hooks/useOnModalShown";
import { Confetti, GoldButton } from "@/components/checkin/CelebrationFx";
import { Balloons } from "@/components/Balloons";
import i18n from "i18next";

const PAPER = "#F7F2E7";
const INK = "#2B2620";
const INK_MUTED = "rgba(43,38,32,0.66)";
const PHOTO = require("../../assets/welcome/rapsfalt.jpg");
const LOGO = require("../../assets/Osterlenappen-logo.png");

export function BirthdayMoment({ firstName, onClose }: { firstName: string | null; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const leaving = useRef(false);
  const ready = useRef(false);
  const cardW = Math.min(width - 48, 360);

  const backdrop = useSharedValue(0);
  const cardIn = useSharedValue(0);
  const burst = useSharedValue(0);
  const buttonIn = useSharedValue(0);
  const leave = useSharedValue(0);
  // Ballongerna startar när fönstret syns
  const [flying, setFlying] = useState(false);

  const onShow = useOnModalShown(() => {
    setFlying(true);
    backdrop.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
    cardIn.value = withDelay(180, withSpring(1, { damping: 14, stiffness: 120 }));
    burst.value = withDelay(520, withTiming(1, { duration: 1800, easing: Easing.linear }));
    buttonIn.value = withDelay(1100, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 540);
    setTimeout(() => { ready.current = true; }, 1100);
  });

  const close = () => {
    if (leaving.current || !ready.current) return;
    leaving.current = true;
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) });
    backdrop.value = withDelay(120, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }, (fin) => {
      if (fin) runOnJS(onClose)();
    }));
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, cardIn.value * 1.5) * (1 - leave.value),
    transform: [
      { translateY: interpolate(cardIn.value, [0, 1], [60, 0]) + leave.value * 24 },
      { rotate: `${interpolate(cardIn.value, [0, 1], [-6, -1.5])}deg` },
    ],
  }));
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonIn.value * (1 - leave.value) }));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onShow={onShow} onRequestClose={close}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        {/* Ballongerna stiger bakom vykortet, över hela skärmen */}
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          <Balloons start={flying} />
        </Reanimated.View>
        <View style={s.center}>
          <Reanimated.View style={[s.card, { width: cardW }, cardStyle]}>
            <Image source={PHOTO} style={[s.photo, { height: cardW * 0.62 }]} resizeMode="cover" />
            <View style={s.body}>
              <Text style={s.title}>
                {firstName ? i18n.t("birthday.titleName", { name: firstName }) : i18n.t("birthday.title")}
              </Text>
              <Text style={s.text}>{i18n.t("birthday.text")}</Text>
              <View style={s.signRow}>
                <Text style={s.sign}>{i18n.t("birthday.sign")}</Text>
                <Image source={LOGO} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
              </View>
            </View>
          </Reanimated.View>
          <View style={s.confettiOrigin} pointerEvents="none">
            <Confetti progress={burst} count={60} power={1.5} />
          </View>
        </View>
        <Reanimated.View style={[s.buttons, { paddingBottom: Math.max(insets.bottom, 16) + 8 }, buttonStyle]}>
          <GoldButton label={i18n.t("birthday.thanks")} onPress={close} />
        </Reanimated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#0B0A08" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: PAPER, borderRadius: 6, padding: 10, paddingBottom: 18,
    shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 14,
  },
  photo: { width: "100%", borderRadius: 3 },
  body: { paddingHorizontal: 8, paddingTop: 16, gap: 10 },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 25, lineHeight: 31, color: INK },
  text: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: INK_MUTED },
  signRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sign: { flex: 1, fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 15, color: INK },
  logo: { width: 30, height: 34 },
  confettiOrigin: { position: "absolute", left: "50%", top: "38%", width: 0, height: 0 },
  buttons: { paddingHorizontal: 20 },
});
