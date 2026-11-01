/**
 * Kontots steg: e-post, koden från mejlet och lösenordet. Stegen visar bara — det som händer när
 * man trycker (skicka koden, logga in, spara lösenordet) sköter flödet i app/(auth)/signup.tsx.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Check, Lock, Mail } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AUTH_GUTTER, AuthButton, AuthField, FieldNote, TextButton } from "@/components/auth/AuthParts";
import { StepLayout } from "./StepLayout";
import { CodeBoxes, type CodePhase } from "./CodeBoxes";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export const OTP_LENGTH = 6;

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

/** De vanligaste adresserna i Sverige — ett stavfel i dem ("gmial.com") gör att koden aldrig kommer fram */
const COMMON_DOMAINS = [
  "gmail.com", "hotmail.com", "hotmail.se", "outlook.com", "outlook.se", "live.se", "live.com", "icloud.com",
  "me.com", "yahoo.com", "yahoo.se", "msn.com", "telia.com", "spray.se", "bredband.net", "gmx.de", "web.de",
];

/** Hur många bokstäver som skiljer (infoga, ta bort, byta, eller två grannar i fel ordning) */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** "anna@gmial.com" → "anna@gmail.com", eller null om adressen ser rätt ut */
export function emailSuggestion(value: string): string | null {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  if (!domain.includes(".") || COMMON_DOMAINS.includes(domain)) return null;
  const best = COMMON_DOMAINS
    .map((d) => ({ d, n: distance(domain, d) }))
    .filter((x) => x.n > 0 && x.n <= 2)
    .sort((x, y) => x.n - y.n)[0];
  return best ? `${email.slice(0, at)}@${best.d}` : null;
}

// ── E-post ───────────────────────────────────────────────────────────────────

export function EmailStep({
  ready, email, onChange, onSubmit, busy, error, reset,
}: {
  /** Sidan har glidit in klart: då får fältet fokus (tangentbordet samtidigt som sidbytet hackade) */
  ready: boolean;
  email: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean; error: string | null;
  /** Glömt lösenordet: samma steg, andra ord */
  reset: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const valid = isEmail(email);
  const suggestion = valid ? emailSuggestion(email) : null;
  const field = useRef<TextInput>(null);
  useEffect(() => {
    if (ready) field.current?.focus();
  }, [ready]);
  return (
    <StepLayout
      title={t(reset ? "onboarding.email.resetTitle" : "onboarding.email.title")}
      subtitle={t(reset ? "onboarding.email.resetSubtitle" : "onboarding.email.subtitle")}
      footer={<AuthButton label={t("onboarding.email.send")} onPress={onSubmit} disabled={!valid} loading={busy} />}
    >
      <AuthField
        ref={field}
        icon={Mail}
        value={email}
        onChangeText={onChange}
        placeholder={t("onboarding.email.placeholder")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => valid && onSubmit()}
        invalid={!!error}
      />
      {error ? <FieldNote tone="danger" text={error} /> : null}
      {suggestion ? (
        <TouchableOpacity onPress={() => onChange(suggestion)} activeOpacity={0.7} hitSlop={8}>
          <Text style={[styles.suggestion, { color: colors.muted }]}>
            {t("onboarding.email.didYouMean")} <Text style={{ color: colors.goldText, fontFamily: "Inter_600SemiBold" }}>{suggestion}</Text>?
          </Text>
        </TouchableOpacity>
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  suggestion: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 10 },
});

// ── Koden ────────────────────────────────────────────────────────────────────

export function CodeStep({
  email, code, onChange, phase, onOkShown, error, info, resendIn, onResend, onChangeEmail,
}: {
  email: string;
  code: string;
  /** Varje ändring; flödet loggar in när alla siffror är på plats */
  onChange: (v: string) => void;
  /** Skriver, kontrolleras, rätt eller fel (styr rutornas animation) */
  phase: CodePhase;
  /** Rutorna har gått ihop efter rätt kod */
  onOkShown: () => void;
  error: string | null;
  /** "En ny kod är skickad" */
  info: string | null;
  /** Sekunder kvar tills en ny kod får skickas */
  resendIn: number;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);
  // Fel kod: rutorna töms och man kan skriva igen direkt
  useEffect(() => {
    if (error) input.current?.focus();
  }, [error]);
  const quiet = phase === "checking" || phase === "ok";

  return (
    <StepLayout
      title={t("onboarding.code.title")}
      subtitle={t("onboarding.code.subtitle", { email })}
      footer={
        <>
          <TextButton
            label={resendIn > 0 ? t("onboarding.code.resendIn", { seconds: resendIn }) : t("onboarding.code.resend")}
            onPress={resendIn > 0 || quiet ? () => {} : onResend}
          />
          <TextButton label={t("onboarding.code.change")} onPress={quiet ? () => {} : onChangeEmail} />
        </>
      }
    >
      <Pressable onPress={() => input.current?.focus()} accessibilityLabel={t("onboarding.code.title")}>
        <CodeBoxes code={code} length={OTP_LENGTH} width={width - AUTH_GUTTER * 2} focused={focused} phase={phase} onOkShown={onOkShown} />
      </Pressable>
      {/* Det riktiga fältet är osynligt: det tar emot siffror, inklistring och koden som telefonen föreslår från mejlet */}
      <TextInput
        ref={input}
        value={code}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        autoFocus
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={s.hidden}
      />
      {!quiet && error ? <FieldNote tone="danger" text={error} /> : null}
      {!quiet && !error && info ? <FieldNote tone="success" text={info} /> : null}
      {!quiet && !error && !info ? <FieldNote text={t("onboarding.code.spam")} /> : null}
    </StepLayout>
  );
}

// ── Lösenord ─────────────────────────────────────────────────────────────────

/** Lösenordets regler, samma när kontot skapas och när lösenordet byts (Inställningar › Konto) */
export function passwordChecks(pw: string) {
  return { length: pw.length >= 8, upper: /[A-ZÅÄÖ]/.test(pw), digit: /\d/.test(pw) };
}

export function PasswordStep({
  password, onChange, onSubmit, busy, error, reset,
}: {
  password: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean; error: string | null;
  reset: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [visible, setVisible] = useState(false);
  const checks = passwordChecks(password);
  const ok = checks.length && checks.upper && checks.digit;
  const rules: { key: keyof typeof checks; label: string }[] = [
    { key: "length", label: t("onboarding.password.rules.length") },
    { key: "upper", label: t("onboarding.password.rules.upper") },
    { key: "digit", label: t("onboarding.password.rules.digit") },
  ];
  return (
    <StepLayout
      title={t(reset ? "onboarding.password.resetTitle" : "onboarding.password.title")}
      subtitle={t("onboarding.password.subtitle")}
      footer={<AuthButton label={t("onboarding.next")} onPress={onSubmit} disabled={!ok} loading={busy} />}
    >
      <AuthField
        icon={Lock}
        value={password}
        onChangeText={onChange}
        placeholder={t("onboarding.password.placeholder")}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        passwordRules="minlength: 8; required: upper; required: digit;"
        returnKeyType="done"
        onSubmitEditing={() => ok && onSubmit()}
        autoFocus
        invalid={!!error}
        right={
          <TouchableOpacity onPress={() => setVisible((v) => !v)} hitSlop={10} accessibilityRole="button">
            <Text style={s.toggle}>{visible ? t("onboarding.password.hide") : t("onboarding.password.show")}</Text>
          </TouchableOpacity>
        }
      />
      <View style={s.rules}>
        {rules.map(({ key, label }) => (
          <View key={key} style={s.rule}>
            <View style={[s.ruleDot, checks[key] ? { backgroundColor: colors.success, borderColor: colors.success } : null]}>
              {checks[key] ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
            <Text style={[s.ruleText, checks[key] ? { color: colors.text } : null]}>{label}</Text>
          </View>
        ))}
      </View>
      {error ? <FieldNote tone="danger" text={error} /> : null}
    </StepLayout>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0 },

  toggle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.goldText },
  rules: { gap: 10, marginTop: 6 },
  rule: { flexDirection: "row", alignItems: "center", gap: 10 },
  ruleDot: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  ruleText: { fontFamily: "Inter_500Medium", fontSize: 14.5, color: c.muted },
});
