/**
 * Startsidan för den som inte är inloggad: Österlen överst (fotot glider långsamt närmare), vad
 * appen är på en rad, och sätten att komma in — Apple, Google eller e-post. Har man redan ett
 * konto loggar man in längst ner. Språket väljs med flaggan uppe till höger.
 */
import { useEffect, useState } from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Mail } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AUTH_GUTTER, AuthButton, FieldNote } from "@/components/auth/AuthParts";
import { ProviderButtons, useSocialSignIn } from "@/components/auth/ProviderButtons";
import { LanguageMenu } from "@/components/settings/LanguageMenu";
import { RoundFlag } from "@/components/RoundFlag";
import { Rise } from "@/components/Rise";
import { pushOnce } from "@/lib/navigateOnce";
import { LEGAL_URLS } from "@/lib/appInfo";
import { currentLanguage, setLanguage, type LanguageCode } from "@/i18n";
import { withAlpha } from "@/theme/categories";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { busy, error, signIn } = useSocialSignIn();
  const [langOpen, setLangOpen] = useState(false);
  const [, setLang] = useState(currentLanguage());
  // Små telefoner (iPhone SE) får ett lägre foto, så knapparna får plats utan att scrolla
  const photoH = Math.round(height * (height < 720 ? 0.38 : 0.46));

  // Fotot glider sakta närmare och tillbaka, hela tiden — knappt märkbart, men sidan lever
  const reduced = useReducedMotion();
  const zoom = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    zoom.value = withRepeat(withTiming(1.09, { duration: 16000, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [zoom, reduced]);
  const photoStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));

  const chooseLanguage = (code: LanguageCode) => {
    setLanguage(code);
    setLang(code);
    setLangOpen(false);
  };

  const legal = LEGAL_URLS.terms && LEGAL_URLS.privacy ? { terms: LEGAL_URLS.terms, privacy: LEGAL_URLS.privacy } : null;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <View style={[s.photo, { height: photoH }]}>
        <Reanimated.View style={[StyleSheet.absoluteFill, photoStyle]}>
          {/* De röda husen ligger till höger i bilden: visa den delen */}
          <ExpoImage
            source={require("../../assets/hero-osterlen.jpg")}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition={{ left: "68%", top: "50%" }}
          />
        </Reanimated.View>
        <LinearGradient colors={["rgba(0,0,0,0.32)", "rgba(0,0,0,0)"]} style={[s.topShade, { height: insets.top + 70 }]} />
        <LinearGradient colors={[withAlpha(colors.bg, 0), colors.bg]} style={s.fade} />
        <TouchableOpacity
          style={[s.flag, { top: insets.top + 8 }]}
          onPress={() => setLangOpen(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("settings.language")}
        >
          <RoundFlag code={currentLanguage()} size={34} />
        </TouchableOpacity>
      </View>

      {/* Scrollar bara om det inte får plats (t.ex. med extra stor text) */}
      <ScrollView
        style={s.body}
        contentContainerStyle={[s.bodyContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      >
        <Rise index={0}>
          <View style={s.brand}>
            <Image source={require("../../assets/Osterlenappen-logo.png")} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={s.title}>Österlenappen</Text>
            <Text style={s.tagline}>{t("auth.welcome.tagline")}</Text>
          </View>
        </Rise>

        <View style={{ flex: 1 }} />

        <Rise index={1}>
          <View style={s.actions}>
            <ProviderButtons busy={busy} onPress={signIn} />
            <AuthButton
              variant="outline"
              label={t("auth.welcome.email")}
              icon={<Mail size={19} color={colors.text} strokeWidth={1.8} />}
              onPress={() => pushOnce(router, "/(auth)/signup")}
              disabled={!!busy}
            />
            {error ? <FieldNote tone="danger" text={error} /> : null}
            <TouchableOpacity onPress={() => pushOnce(router, "/(auth)/login")} activeOpacity={0.6} style={s.login} disabled={!!busy}>
              <Text style={s.loginText}>
                {t("auth.welcome.haveAccount")} <Text style={s.loginLink}>{t("auth.welcome.logIn")}</Text>
              </Text>
            </TouchableOpacity>
            {legal ? (
              <Text style={s.legal}>
                {t("auth.welcome.legalPrefix")}
                <Text style={s.legalLink} onPress={() => Linking.openURL(legal.terms)}>{t("auth.welcome.terms")}</Text>
                {t("auth.welcome.legalMiddle")}
                <Text style={s.legalLink} onPress={() => Linking.openURL(legal.privacy)}>{t("auth.welcome.privacy")}</Text>
                {t("auth.welcome.legalSuffix")}
              </Text>
            ) : null}
          </View>
        </Rise>
      </ScrollView>

      <LanguageMenu visible={langOpen} top={insets.top + 52} onSelect={chooseLanguage} onClose={() => setLangOpen(false)} />
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  photo: { overflow: "hidden" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
  flag: {
    position: "absolute", right: 16, width: 34, height: 34, borderRadius: 17, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)",
  },
  body: { flex: 1, marginTop: -88 },
  bodyContent: { flexGrow: 1, paddingHorizontal: AUTH_GUTTER },
  brand: { gap: 10 },
  logo: { width: 58, height: 64, marginBottom: 6 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 34, lineHeight: 40, letterSpacing: -1, color: c.text },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 16.5, lineHeight: 24, color: c.muted, maxWidth: 340 },
  actions: { gap: 12, paddingTop: 24 },
  login: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 12 },
  loginText: { fontFamily: "Inter_500Medium", fontSize: 15, color: c.muted },
  loginLink: { fontFamily: "Inter_700Bold", color: c.goldText },
  legal: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, color: c.faint, textAlign: "center", paddingHorizontal: 12 },
  legalLink: { textDecorationLine: "underline", color: c.muted },
});
