/**
 * Startsidan för den som inte är inloggad. Ales stenar i solnedgången fyller hela skärmen och glider
 * långsamt från stenarna bort mot solen och tillbaka, så hela bilden syns. Nertill, över en mörk
 * övertoning: loggan, vad appen är på en rad och sätten att komma in — Apple, Google eller e-post.
 * Har man redan ett konto loggar man in längst ner. Språket väljs med flaggan uppe till höger.
 *
 * Sidan är alltid mörk (den ligger över ett foto), oavsett om appen står i ljust eller mörkt läge.
 * Fotot ligger i appen, inte på servern: sidan visas innan man loggat in och ska synas direkt,
 * även utan nät.
 */
import { useEffect, useState } from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Mail, MapPin } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AUTH_GUTTER, AuthButton, FieldNote } from "@/components/auth/AuthParts";
import { ProviderButtons, useSocialSignIn } from "@/components/auth/ProviderButtons";
import { LanguageMenu } from "@/components/settings/LanguageMenu";
import { RoundFlag } from "@/components/RoundFlag";
import { Rise } from "@/components/Rise";
import { pushOnce } from "@/lib/navigateOnce";
import { LEGAL_URLS } from "@/lib/appInfo";
import { currentLanguage, setLanguage, type LanguageCode } from "@/i18n";
import { ThemeProvider } from "@/theme/ThemeProvider";

/** Fotots bredd delat med höjden (3596 × 2400) */
const PHOTO_RATIO = 3596 / 2400;
/** En sträcka från stenarna till solen */
const PAN_MS = 26000;

export default function WelcomeScreen() {
  // Sidan ligger över ett mörkt foto: knappar och text ritas alltid i det mörka temat
  return (
    <ThemeProvider forced="dark">
      <Welcome />
    </ThemeProvider>
  );
}

function Welcome() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { busy, error, signIn } = useSocialSignIn();
  const [langOpen, setLangOpen] = useState(false);
  const [, setLang] = useState(currentLanguage());

  // Fotot är lika högt som skärmen och bredare än den: det glider sakta i sidled
  const photoW = Math.ceil(height * PHOTO_RATIO);
  const travel = Math.max(0, photoW - width);
  const reduced = useReducedMotion();
  const pan = useSharedValue(reduced ? 0.55 : 0.12);
  useEffect(() => {
    if (reduced) return;
    pan.value = withRepeat(withTiming(0.92, { duration: PAN_MS, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pan, reduced]);
  const photoStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -pan.value * travel }] }));

  const chooseLanguage = (code: LanguageCode) => {
    setLanguage(code);
    setLang(code);
    setLangOpen(false);
  };

  const legal = LEGAL_URLS.terms && LEGAL_URLS.privacy ? { terms: LEGAL_URLS.terms, privacy: LEGAL_URLS.privacy } : null;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Reanimated.View style={[s.photo, { width: photoW, height }, photoStyle]}>
        <ExpoImage source={require("../../assets/welcome-ales-stenar.jpg")} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Reanimated.View>
      <LinearGradient colors={["rgba(0,0,0,0.38)", "rgba(0,0,0,0)"]} style={[s.topShade, { height: insets.top + 90 }]} pointerEvents="none" />
      <LinearGradient
        colors={["rgba(10,8,6,0)", "rgba(10,8,6,0.55)", "rgba(10,8,6,0.92)", "#0A0806"]}
        locations={[0, 0.3, 0.62, 1]}
        style={s.bottomShade}
        pointerEvents="none"
      />

      <View style={[s.topRow, { top: insets.top + 10 }]}>
        <View style={s.place}>
          <MapPin size={13} color="rgba(255,255,255,0.9)" strokeWidth={2.2} />
          <Text style={s.placeText}>Ales stenar, Kåseberga</Text>
        </View>
        <TouchableOpacity
          style={s.flag}
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
        style={StyleSheet.absoluteFill}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 60, paddingBottom: Math.max(insets.bottom, 16) }]}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1 }} />
        <Rise index={0}>
          <View style={s.brand}>
            <Image source={require("../../assets/Osterlenappen-logo.png")} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={s.title}>Österlenappen</Text>
            <Text style={s.tagline}>{t("auth.welcome.tagline")}</Text>
          </View>
        </Rise>

        <Rise index={1}>
          <View style={s.actions}>
            <ProviderButtons busy={busy} onPress={signIn} />
            <AuthButton
              variant="outline"
              label={t("auth.welcome.email")}
              icon={<Mail size={19} color="#FFFFFF" strokeWidth={1.8} />}
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

      <LanguageMenu visible={langOpen} top={insets.top + 54} onSelect={chooseLanguage} onClose={() => setLangOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0806", overflow: "hidden" },
  photo: { position: "absolute", top: 0, left: 0 },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "68%" },
  topRow: {
    position: "absolute", left: AUTH_GUTTER, right: 16, zIndex: 2,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  place: { flexDirection: "row", alignItems: "center", gap: 6 },
  placeText: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 0.3, color: "rgba(255,255,255,0.92)",
    textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  flag: {
    width: 34, height: 34, borderRadius: 17, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)",
  },
  content: { flexGrow: 1, paddingHorizontal: AUTH_GUTTER },
  brand: { gap: 10 },
  logo: { width: 52, height: 58, marginBottom: 8 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 38, lineHeight: 44, letterSpacing: -1.2, color: "#FFFFFF" },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 17, lineHeight: 25, color: "rgba(255,255,255,0.78)", maxWidth: 340 },
  actions: { gap: 12, paddingTop: 30 },
  login: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 12 },
  loginText: { fontFamily: "Inter_500Medium", fontSize: 15, color: "rgba(255,255,255,0.72)" },
  loginLink: { fontFamily: "Inter_700Bold", color: "#E8C674" },
  legal: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, color: "rgba(255,255,255,0.5)", textAlign: "center", paddingHorizontal: 12 },
  legalLink: { textDecorationLine: "underline", color: "rgba(255,255,255,0.72)" },
});
