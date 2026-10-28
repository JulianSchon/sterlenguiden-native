/**
 * Logga in: e-post och lösenord, eller Apple/Google. Glömt lösenordet ger en kod till mejlen och
 * ett nytt lösenord (samma steg som när man skapar konto). Efter inloggningen går man in i appen —
 * eller vidare i onboardingen om kontot inte är klart.
 */
import { useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Lock, Mail } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_GUTTER, AuthButton, AuthField, FieldNote, StepTitle } from "@/components/auth/AuthParts";
import { ProviderButtons, useSocialSignIn } from "@/components/auth/ProviderButtons";
import { isEmail } from "@/components/onboarding/AccountSteps";
import { pushOnce } from "@/lib/navigateOnce";
import { enterApp } from "@/lib/onboarding";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export default function LoginScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const s = useThemedStyles(createStyles);
  const social = useSocialSignIn();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isEmail(email) && password.length > 0;

  const logIn = async () => {
    if (busy) return;
    if (!canSubmit) {
      setError(t("auth.login.errors.missing"));
      return;
    }
    setBusy(true);
    setError(null);
    social.clearError();
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e) {
      setBusy(false);
      setPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const msg = (e.message ?? "").toLowerCase();
      if (e.code === "invalid_credentials" || msg.includes("invalid")) setError(t("auth.login.errors.wrong"));
      else if (e.status === 429) setError(t("auth.login.errors.tooMany"));
      else setError(t("auth.login.errors.failed"));
      return;
    }
    await enterApp();
  };

  const forgot = () => {
    router.push({ pathname: "/(auth)/signup", params: { mode: "reset", email: email.trim() } });
  };

  // Utan konto: tillbaka till startsidan, där man skapar ett
  const create = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)/welcome");
  };

  const working = busy || !!social.busy;

  return (
    <View style={s.root}>
      {/* Startsidan under har ljus text över fotot; här följer den temat */}
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <View style={[s.bar, { marginTop: insets.top }]}>
        <TouchableOpacity onPress={create} style={s.back} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <ArrowLeft size={22} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <StepTitle title={t("auth.login.title")} subtitle={t("auth.login.subtitle")} />

          <View style={s.fields}>
            <AuthField
              icon={Mail}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(null); }}
              placeholder={t("auth.login.email")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <AuthField
              ref={passwordRef}
              icon={Lock}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              placeholder={t("auth.login.password")}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={logIn}
              invalid={!!error}
              right={
                <TouchableOpacity onPress={() => setVisible((v) => !v)} hitSlop={10} accessibilityRole="button">
                  <Text style={s.toggle}>{visible ? t("onboarding.password.hide") : t("onboarding.password.show")}</Text>
                </TouchableOpacity>
              }
            />
            <TouchableOpacity onPress={forgot} style={s.forgot} hitSlop={8} accessibilityRole="button">
              <Text style={s.forgotText}>{t("auth.login.forgot")}</Text>
            </TouchableOpacity>
          </View>

          {error ? <FieldNote tone="danger" text={error} /> : null}
          <AuthButton label={t("auth.login.submit")} onPress={logIn} loading={busy} disabled={social.busy !== null} />

          <View style={s.divider}>
            <View style={s.line} />
            <Text style={s.or}>{t("auth.login.or")}</Text>
            <View style={s.line} />
          </View>

          <ProviderButtons busy={social.busy} onPress={(p) => { setError(null); social.signIn(p); }} />
          {social.error ? <FieldNote tone="danger" text={social.error} /> : null}

          <View style={{ flex: 1 }} />

          <TouchableOpacity onPress={create} activeOpacity={0.6} style={s.create} disabled={working}>
            <Text style={s.createText}>
              {t("auth.login.noAccount")} <Text style={s.createLink}>{t("auth.login.create")}</Text>
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => pushOnce(router, "/(auth)/business-login")} activeOpacity={0.6} style={s.business} disabled={working}>
            <Text style={s.businessText}>{t("auth.login.business")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  bar: { height: 64, paddingHorizontal: 16, justifyContent: "center" },
  back: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.fill,
    alignItems: "center", justifyContent: "center",
  },
  body: { flexGrow: 1, paddingHorizontal: AUTH_GUTTER, paddingTop: 12, gap: 16 },
  fields: { gap: 12, marginTop: 14 },
  toggle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.goldText },
  forgot: { alignSelf: "flex-end", paddingVertical: 4 },
  forgotText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.goldText },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 6 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.borderStrong },
  or: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.faint },
  create: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 },
  createText: { fontFamily: "Inter_500Medium", fontSize: 15, color: c.muted },
  createLink: { fontFamily: "Inter_700Bold", color: c.goldText },
  business: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  businessText: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: c.faint },
});
