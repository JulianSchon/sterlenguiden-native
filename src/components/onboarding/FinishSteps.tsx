/**
 * De sista stegen: frågan om platsen (först förklarar vi varför, sedan kommer telefonens egen
 * fråga) och välkomsten, där ens medlemskort glider upp med namnet på.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { BadgeCheck, Clock, MapPin, Navigation } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AUTH_GUTTER, AuthButton, FieldNote, GoldButton, TextButton } from "@/components/auth/AuthParts";
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

/** Siffrorna under välkomsten: avrundade nedåt, så de alltid stämmer ("312" → "300+") */
export function roundedCount(n: number): { value: number; plus: boolean } {
  if (n >= 100) return { value: Math.floor(n / 50) * 50, plus: true };
  if (n >= 20) return { value: Math.floor(n / 10) * 10, plus: true };
  return { value: n, plus: false };
}

/**
 * Välkomsten byggs i förväg, osynlig, några steg innan — kortet, fotot och texten finns alltså redan
 * när den visas, och inget nytt ritas medan något rör sig. När den visas tonar sidan in. Kortet
 * glider upp i ett lugnt svep först när sparandet är klart (eller efter en kort stund), sedan kommer
 * texten, siffrorna en i taget och sist knappen.
 */
export function WelcomeStep({
  visible, firstName, displayName, saved, saving, failed, stats, onStart,
}: {
  visible: boolean;
  firstName: string;
  displayName: string;
  /** Sparandet är klart (lyckat eller inte) */
  saved: boolean;
  /** Man har tryckt på knappen innan sparandet hann bli klart */
  saving: boolean;
  failed: boolean;
  stats: { label: string; count: number }[];
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

  const page = useSharedValue(0);
  const card = useSharedValue(0);
  const text = useSharedValue(0);
  const footer = useSharedValue(0);
  const [statsRun, setStatsRun] = useState(false);

  // Sidan tonar in när den visas
  useEffect(() => {
    page.value = withTiming(visible ? 1 : 0, { duration: visible ? 280 : 0 });
  }, [visible, page]);

  // Kortet glider upp när sparandet är klart, tidigast en halv sekund efter att sidan visats och
  // senast efter en och en halv
  const [shownAt, setShownAt] = useState<number | null>(null);
  useEffect(() => {
    if (visible && shownAt === null) setShownAt(Date.now());
  }, [visible, shownAt]);
  const started = useRef(false);
  useEffect(() => {
    if (shownAt === null || started.current) return;
    const elapsed = Date.now() - shownAt;
    const wait = saved ? Math.max(0, 500 - elapsed) : Math.max(0, 1500 - elapsed);
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      if (reduced) {
        card.value = 1;
        text.value = 1;
        footer.value = 1;
        setStatsRun(true);
        return;
      }
      const landed = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      };
      const runStats = () => setStatsRun(true);
      card.value = withTiming(1, { duration: 760, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) runOnJS(landed)();
      });
      text.value = withDelay(420, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) runOnJS(runStats)();
      }));
      footer.value = withDelay(420 + 520 + STAT_STAGGER * 3 + 200, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    }, wait);
    return () => clearTimeout(timer);
  }, [shownAt, saved, reduced, card, text, footer]);

  const pageStyle = useAnimatedStyle(() => ({ opacity: page.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.value * 2),
    transform: [{ translateY: (1 - card.value) * 90 }, { scale: 0.94 + card.value * 0.06 }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: (1 - text.value) * 12 }] }));
  const footerStyle = useAnimatedStyle(() => ({ opacity: footer.value, transform: [{ translateY: (1 - footer.value) * 12 }] }));

  // Kortet ritas en gång: det animeras med sina egna värden, inte genom att ritas om
  const memberCard = useMemo(() => (
    <MemberCard displayName={displayName} isMember={false} memberSince={null} onBuyPress={() => {}} readOnly width={cardW} />
  ), [displayName, cardW]);

  const shownStats = stats.filter((stat) => stat.count > 0);

  return (
    <Reanimated.View style={[s.welcome, pageStyle]} pointerEvents={visible ? "auto" : "none"}>
      {visible ? <StatusBar style="light" /> : null}
      {/* Rapsfälten, som tonar ut i sidans bakgrund */}
      <View style={[s.photo, { height: photoH }]} pointerEvents="none">
        <ExpoImage source={require("../../../assets/onboarding-1.jpg")} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["rgba(0,0,0,0.30)", "rgba(0,0,0,0)"]} style={[s.topShade, { height: insets.top + 70 }]} />
        <LinearGradient colors={[withAlpha(colors.bg, 0), colors.bg]} style={s.fade} />
      </View>

      <View style={[s.welcomeBody, { paddingTop: photoH * 0.5 }]}>
        <Reanimated.View style={[s.cardWrap, cardStyle]}>{memberCard}</Reanimated.View>
        <Reanimated.View style={[s.welcomeText, textStyle]}>
          <Text style={s.welcomeTitle}>{t("onboarding.done.title", { name: firstName.trim() })}</Text>
          <Text style={s.welcomeSub}>{t("onboarding.done.subtitle")}</Text>
        </Reanimated.View>
        {shownStats.length > 0 ? (
          <View style={s.stats}>
            {shownStats.map((stat, i) => (
              <Stat key={stat.label} label={stat.label} count={stat.count} run={statsRun} delay={i * STAT_STAGGER} divider={i > 0} />
            ))}
          </View>
        ) : null}
      </View>

      <Reanimated.View style={[s.welcomeFooter, { paddingBottom: Math.max(insets.bottom, 16) }, footerStyle]}>
        {failed ? <FieldNote tone="danger" text={t("onboarding.done.failed")} /> : null}
        <GoldButton label={failed ? t("common.tryAgain") : t("onboarding.done.start")} onPress={onStart} loading={saving} />
      </Reanimated.View>
    </Reanimated.View>
  );
}

/** Tiden mellan siffrorna */
const STAT_STAGGER = 280;

/** En siffra under välkomsten: glider in och räknas upp från 0 (avrundad nedåt, med "+") */
function Stat({ label, count, run, delay, divider }: { label: string; count: number; run: boolean; delay: number; divider: boolean }) {
  const s = useThemedStyles(createStyles);
  const { value, plus } = roundedCount(count);
  const [shown, setShown] = useState(0);
  const appear = useSharedValue(0);
  useEffect(() => {
    if (!run) return;
    appear.value = withDelay(delay, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
    let frame = 0;
    let start = 0;
    const duration = 1000;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => { frame = requestAnimationFrame(tick); }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [run, value, delay, appear]);
  const style = useAnimatedStyle(() => ({ opacity: appear.value, transform: [{ translateY: (1 - appear.value) * 10 }] }));
  return (
    <Reanimated.View style={[s.stat, divider && s.statDivider, style]}>
      <Text style={s.statValue}>{shown}{plus && shown === value ? "+" : ""}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </Reanimated.View>
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

  welcome: { ...StyleSheet.absoluteFillObject, backgroundColor: c.bg, zIndex: 10 },
  photo: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" },
  welcomeBody: { flex: 1, paddingHorizontal: AUTH_GUTTER },
  cardWrap: { alignSelf: "center" },
  welcomeText: { marginTop: 28, gap: 8 },
  welcomeTitle: { fontFamily: "Montserrat_700Bold", fontSize: 30, lineHeight: 36, letterSpacing: -0.8, color: c.text },
  welcomeSub: { fontFamily: "Inter_400Regular", fontSize: 16.5, lineHeight: 24, color: c.muted },
  welcomeFooter: { paddingHorizontal: AUTH_GUTTER, paddingTop: 10, gap: 10 },
  stats: { flexDirection: "row", marginTop: 30 },
  stat: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 4 },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.goldBorder },
  statValue: { fontFamily: "Montserrat_700Bold", fontSize: 30, letterSpacing: -0.8, color: c.goldText, fontVariant: ["tabular-nums"] },
  statLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: c.muted },
});
