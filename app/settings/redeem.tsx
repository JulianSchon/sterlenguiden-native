/**
 * Inställningar › Lös in kod. En kod (t.ex. en gåva eller en testkod) ger
 * tid i Österlenpasset. Själva utdelningen sker i databasfunktionen
 * redeem_pass_code, som räknar ut den nya tiden — appen skriver aldrig
 * medlemsdatum själv. Lyckas det spelas medlemsögonblicket upp (MembershipMoment).
 */
import { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/hooks/useProfile";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { MembershipMoment, type MomentInfo } from "@/components/pass/MembershipMoment";
import { PrimaryButton } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

type Failure = "used" | "notFound" | "unlimited" | "failed";
type RedeemResult = { ok: boolean; reason?: string; member_until?: string | null; saved?: boolean; days?: number };

export default function RedeemCodeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [moment, setMoment] = useState<MomentInfo | null>(null);

  async function redeem() {
    setBusy(true);
    setFailure(null);
    const { data, error } = await supabase.rpc("redeem_pass_code", { _code: code.trim().toUpperCase() });
    setBusy(false);
    const result = data as RedeemResult | null;
    if (error || !result) return setFailure("failed");
    if (!result.ok) return setFailure(result.reason === "used" ? "used" : result.reason === "unlimited" ? "unlimited" : "notFound");
    // Profilen hämtas om först: ögonblicket visar det nya kortet, och om kortfotot saknas
    await queryClient.refetchQueries({ queryKey: ["profile"] }).catch(() => {});
    const profile = queryClient.getQueryData<Profile | null>(["profile"]);
    const startsAt = profile?.member_started_at ? new Date(profile.member_started_at) : null;
    if (result.saved) setMoment({ kind: "saved", date: null, days: result.days ?? 0 });
    else if (startsAt && startsAt.getTime() > Date.now()) setMoment({ kind: "scheduled", date: profile!.member_started_at, days: result.days ?? 0 });
    else setMoment({ kind: "activated", date: result.member_until ?? null, days: result.days ?? 0 });
    setCode("");
  }

  return (
    <SettingsScreen
      title={t("pass.redeem.title")}
      overlay={(
        <MembershipMoment
          info={moment}
          onOffers={() => { setMoment(null); router.replace("/offers" as never); }}
          onDone={() => { setMoment(null); router.back(); }}
        />
      )}
    >
        <>
          <View style={s.center}>
            <Text style={s.title}>{t("pass.redeem.heading")}</Text>
            <Text style={s.sub}>{t("pass.redeem.intro")}</Text>
          </View>
          <TextInput
            style={[s.input, failure && s.inputError]}
            value={code}
            onChangeText={(text) => {
              setCode(text.toUpperCase());
              setFailure(null);
            }}
            maxLength={16}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="ABCD1234"
            placeholderTextColor={colors.faint}
          />
          {failure ? <Text style={s.error}>{t(`pass.redeem.${failure}`)}</Text> : null}
          <PrimaryButton
            label={t("pass.redeem.cta")}
            onPress={redeem}
            disabled={code.trim().length < 4}
            loading={busy}
          />
          <View style={s.tips}>
            <Text style={s.tipsTitle}>{t("pass.redeem.tipsTitle")}</Text>
            {(["pass.redeem.tip1", "pass.redeem.tip2", "pass.redeem.tip3"] as const).map((key) => (
              <Text key={key} style={s.tip}>• {t(key)}</Text>
            ))}
          </View>
        </>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  center: { alignItems: "center", gap: 12 },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, color: c.text, textAlign: "center" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, textAlign: "center", lineHeight: 21 },
  input: {
    fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, letterSpacing: 5, color: c.text, textAlign: "center",
    backgroundColor: c.raised, borderRadius: 16, paddingVertical: 16,
    borderWidth: 1, borderColor: c.borderStrong,
  },
  inputError: { borderColor: c.danger },
  error: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.danger, textAlign: "center" },
  tips: { padding: 16, borderRadius: 16, gap: 8, backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  tipsTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: c.text },
  tip: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.muted },
});
