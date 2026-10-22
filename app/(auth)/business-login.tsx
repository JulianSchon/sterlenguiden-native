/**
 * "Har du ett företag?" från inloggningen. Det finns inget separat företagskonto: man loggar in
 * (eller skapar ett konto) som vanligt och tar sedan hand om sitt företag i appen. Här står hur,
 * i tre steg.
 */
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Store } from "lucide-react-native";
import { AUTH_GUTTER, AuthButton, StepBar, TextButton } from "@/components/auth/AuthParts";
import { Rise } from "@/components/Rise";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export default function BusinessIntro() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const steps = [t("auth.business.step1"), t("auth.business.step2"), t("auth.business.step3")];

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <StepBar progress={0} onBack={() => router.back()} />
      <View style={s.body}>
        <Rise index={0}>
          <View style={s.icon}><Store size={28} color={colors.goldText} strokeWidth={1.8} /></View>
          <Text style={s.title}>{t("auth.business.title")}</Text>
          <Text style={s.lead}>{t("auth.business.lead")}</Text>
        </Rise>
        <View style={s.steps}>
          {steps.map((text, i) => (
            <Rise key={text} index={i + 1}>
              <View style={s.step}>
                <View style={s.stepN}><Text style={s.stepNText}>{i + 1}</Text></View>
                <Text style={s.stepText}>{text}</Text>
              </View>
            </Rise>
          ))}
        </View>
      </View>
      <View style={s.footer}>
        <AuthButton label={t("auth.business.create")} onPress={() => router.dismissTo("/(auth)/welcome")} />
        <TextButton label={t("auth.business.login")} onPress={() => router.back()} />
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1, paddingHorizontal: AUTH_GUTTER, paddingTop: 12 },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: c.goldSoft, marginBottom: 18 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 28, lineHeight: 34, letterSpacing: -0.7, color: c.text },
  lead: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23, color: c.muted, marginTop: 10 },
  steps: { marginTop: 28, gap: 18 },
  step: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  stepN: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.gold },
  stepNText: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: c.onGold },
  stepText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15.5, lineHeight: 22, color: c.text, paddingTop: 5 },
  footer: { paddingHorizontal: AUTH_GUTTER, gap: 4 },
});
