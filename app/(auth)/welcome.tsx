/**
 * Startsidan för den som inte är inloggad. Ales stenar i gryningen fyller hela skärmen och glider
 * långsamt från stenarna bort mot solen och tillbaka, så hela bilden syns. Nertill, över en mörk
 * övertoning: loggan, vad appen är på en rad och sätten att komma in — Apple, Google eller e-post.
 * Har man redan ett konto loggar man in längst ner. Språket väljs med flaggan uppe till höger.
 *
 * Första gången appen öppnas spelas introfilmen först (components/auth/IntroFilm), och sidans
 * innehåll glider upp när den tonat undan.
 *
 * Sidan är alltid mörk (den ligger över ett foto), oavsett om appen står i ljust eller mörkt läge.
 * Fotot ligger i appen, inte på servern: sidan visas innan man loggat in och ska synas direkt,
 * även utan nät.
 */
import { useCallback, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  Easing, cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from "react-native-reanimated";
import { Mail, MapPin } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AUTH_GUTTER, AuthButton, FieldNote } from "@/components/auth/AuthParts";
import { ProviderButtons, useSocialSignIn } from "@/components/auth/ProviderButtons";
import { LanguageMenu } from "@/components/settings/LanguageMenu";
import { RoundFlag } from "@/components/RoundFlag";
import { Rise } from "@/components/Rise";
import { IntroFilm, useShouldShowIntro } from "@/components/auth/IntroFilm";
import { pushOnce } from "@/lib/navigateOnce";
import { LEGAL_URLS } from "@/lib/appInfo";
import { currentLanguage, setLanguage, type LanguageCode } from "@/i18n";
import { ThemeProvider } from "@/theme/ThemeProvider";

/** Fotots bredd delat med höjden (3596 × 2400) */
const PHOTO_RATIO = 3596 / 2400;
/** En sträcka från stenarna till solen */
const PAN_MS = 26000;
/** Var bilden börjar och slutar (andel av hur långt den kan glida) */
const PAN_START = 0.12;
const PAN_END = 0.92;

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
  // En sträcka i taget, mot den ände som ligger längst bort. Medan en annan sida ligger ovanpå (och
  // medan sidbytet glider) står bilden still — rörde den sig samtidigt som sidan gled undan såg det
  // ut som ett hack.
  const leg = useCallback((to: number) => {
    const duration = PAN_MS * (Math.abs(to - pan.value) / (PAN_END - PAN_START));
    pan.value = withTiming(to, { duration, easing: Easing.inOut(Easing.quad) }, (done) => {
      if (done) runOnJS(leg)(to === PAN_END ? PAN_START : PAN_END);
    });
  }, [pan]);
  useFocusEffect(useCallback(() => {
    if (!reduced) leg(pan.value > (PAN_START + PAN_END) / 2 ? PAN_START : PAN_END);
    return () => cancelAnimation(pan);
  }, [leg, pan, reduced]));
  const photoStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -pan.value * travel }] }));

  // Introt första gången: innehållet visas först när filmen tonat undan (null = kollas fortfarande)
  const firstTime = useShouldShowIntro(reduced);
  const [replay, setReplay] = useState(0);
  const showIntro = replay > 0 || firstTime;
  const [revealed, setRevealed] = useState(false);
  const [introGone, setIntroGone] = useState(false);
  const reveal = useCallback(() => setRevealed(true), []);
  const gone = useCallback(() => setIntroGone(true), []);
  const contentVisible = showIntro === false || revealed;
  // Bara under utvecklingen: håll på loggan för att se introt igen
  const replayIntro = () => {
    if (!__DEV__) return;
    setRevealed(false);
    setIntroGone(false);
    setReplay((n) => n + 1);
  };
  const open = (href: "/(auth)/signup" | "/(auth)/login") => {
    cancelAnimation(pan);
    pushOnce(router, href);
  };

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

      {contentVisible && (
        <>
          <View style={[s.topRow, { top: insets.top + 10 }]}>
            {/* Fotografens namn måste stå nära bilden (Visit Skånes villkor) */}
            <View style={s.credit}>
              <View style={s.place}>
                <MapPin size={13} color="rgba(255,255,255,0.9)" strokeWidth={2.2} />
                <Text style={s.placeText}>Ales stenar, Kåseberga</Text>
              </View>
              <Text style={s.byline}>© Frits Meyst / WideOyster.com</Text>
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
                <Pressable onLongPress={replayIntro} disabled={!__DEV__}>
                    <Image source={require("../../assets/Osterlenappen-logo.png")} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
                  </Pressable>
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
                  onPress={() => open("/(auth)/signup")}
                  disabled={!!busy}
                />
                {error ? <FieldNote tone="danger" text={error} /> : null}
                <TouchableOpacity onPress={() => open("/(auth)/login")} activeOpacity={0.6} style={s.login} disabled={!!busy}>
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
        </>
      )}

      {showIntro === null && <View style={[StyleSheet.absoluteFill, s.root]} />}
      {showIntro && !introGone && <IntroFilm key={replay} onReveal={reveal} onDone={gone} />}

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
  credit: { gap: 3 },
  place: { flexDirection: "row", alignItems: "center", gap: 6 },
  byline: {
    fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.75)", marginLeft: 19,
    textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
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
