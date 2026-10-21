/**
 * De sista stegen: frågan om platsen (först förklarar vi varför, sedan kommer telefonens egen
 * fråga) och välkomsten, där ens medlemskort glider upp med namnet på.
 */
import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { BadgeCheck, Clock, MapPin, Navigation } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AUTH_GUTTER, AuthButton, FieldNote, TextButton } from "@/components/auth/AuthParts";
import { MemberCard } from "@/components/MemberCard";
import { StepLayout } from "./StepLayout";
import { withAlpha } from "@/theme/categories";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// ── Platsen ──────────────────────────────────────────────────────────────────

export function LocationStep({ busy, onAllow, onLater }: { busy: boolean; onAllow: () => void; onLater: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const uses = [
    { icon: MapPin, text: t("onboarding.location.distance") },
    { icon: Clock, text: t("onboarding.location.openNear") },
    { icon: BadgeCheck, text: t("onboarding.location.checkIn") },
  ];
  return (
    <StepLayout
      title={t("onboarding.location.title")}
      subtitle={t("onboarding.location.subtitle")}
      footer={
        <>
          <AuthButton label={t("onboarding.location.allow")} onPress={onAllow} loading={busy} />
          <TextButton label={t("onboarding.location.later")} onPress={onLater} />
        </>
      }
    >
      <View style={s.locIcon}>
        <Navigation size={34} color={colors.goldText} strokeWidth={1.8} />
      </View>
      <View style={s.uses}>
        {uses.map(({ icon: Icon, text }) => (
          <View key={text} style={s.use}>
            <View style={s.useIcon}>
              <Icon size={19} color={colors.text} strokeWidth={1.8} />
            </View>
            <Text style={s.useText}>{text}</Text>
          </View>
        ))}
      </View>
      <FieldNote text={t("onboarding.location.note")} />
    </StepLayout>
  );
}

// ── Välkommen ────────────────────────────────────────────────────────────────

export function WelcomeStep({
  firstName, displayName, saving, failed, onStart,
}: {
  firstName: string;
  displayName: string;
  /** Kontot sparas just nu (knappen visar det om man trycker innan det är klart) */
  saving: boolean;
  failed: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const cardW = width - AUTH_GUTTER * 2;
  const photoH = Math.round(height * 0.42);

  // Kortet glider upp och lägger sig, sedan tonas texten in — en rörelse i taget, på UI-tråden
  const card = useSharedValue(reduced ? 1 : 0);
  const text = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const landed = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    card.value = withDelay(220, withSpring(1, { damping: 18, stiffness: 110, mass: 1 }, (done) => {
      if (done) runOnJS(landed)();
    }));
    text.value = withDelay(700, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
  }, [card, text, reduced]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.value * 1.6),
    transform: [
      { perspective: 1200 },
      { translateY: (1 - card.value) * 140 },
      { rotateX: `${(1 - card.value) * 18}deg` },
      { scale: 0.92 + card.value * 0.08 },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: (1 - text.value) * 10 }] }));

  // Kortet ritas en gång: det animeras med sina egna värden, inte genom att ritas om
  const memberCard = useMemo(() => (
    <MemberCard
      displayName={displayName}
      isMember={false}
      memberSince={null}
      onBuyPress={() => {}}
      readOnly
      width={cardW}
    />
  ), [displayName, cardW]);

  return (
    <View style={s.welcome}>
      <StatusBar style="light" />
      {/* Rapsfälten, som tonar ut i sidans bakgrund */}
      <View style={[s.photo, { height: photoH }]} pointerEvents="none">
        <ExpoImage source={require("../../../assets/onboarding-1.jpg")} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["rgba(0,0,0,0.30)", "rgba(0,0,0,0)"]} style={[s.topShade, { height: insets.top + 70 }]} />
        <LinearGradient colors={[withAlpha(colors.bg, 0), colors.bg]} style={s.fade} />
      </View>

      <View style={[s.welcomeBody, { paddingTop: photoH * 0.55 }]}>
        <Reanimated.View style={[s.cardWrap, cardStyle]}>{memberCard}</Reanimated.View>
        <Reanimated.View style={[s.welcomeText, textStyle]}>
          <Text style={s.welcomeTitle}>{t("onboarding.done.title", { name: firstName.trim() })}</Text>
          <Text style={s.welcomeSub}>{t("onboarding.done.subtitle")}</Text>
        </Reanimated.View>
      </View>

      <Reanimated.View style={[s.welcomeFooter, { paddingBottom: Math.max(insets.bottom, 16) }, textStyle]}>
        {failed ? <FieldNote tone="danger" text={t("onboarding.done.failed")} /> : null}
        <AuthButton label={failed ? t("common.tryAgain") : t("onboarding.done.start")} onPress={onStart} loading={saving} />
      </Reanimated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  locIcon: {
    width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center",
    backgroundColor: c.goldSoft, alignSelf: "flex-start", marginBottom: 8,
  },
  uses: { gap: 14, marginBottom: 6 },
  use: { flexDirection: "row", alignItems: "center", gap: 14 },
  useIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.fill, alignItems: "center", justifyContent: "center" },
  useText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15.5, lineHeight: 21, color: c.text },

  welcome: { flex: 1, backgroundColor: c.bg },
  photo: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" },
  welcomeBody: { flex: 1, paddingHorizontal: AUTH_GUTTER },
  cardWrap: { alignSelf: "center" },
  welcomeText: { marginTop: 32, gap: 10 },
  welcomeTitle: { fontFamily: "Montserrat_700Bold", fontSize: 30, lineHeight: 36, letterSpacing: -0.8, color: c.text },
  welcomeSub: { fontFamily: "Inter_400Regular", fontSize: 16.5, lineHeight: 24, color: c.muted },
  welcomeFooter: { paddingHorizontal: AUTH_GUTTER, paddingTop: 10, gap: 10 },
});
