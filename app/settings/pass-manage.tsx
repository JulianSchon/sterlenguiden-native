/**
 * Inställningar › Österlenpasset › Hantera medlemskap: vilket pass du har, när det
 * förnyas och möjligheten att avsluta förnyelsen. Att avsluta kräver betalningen
 * (som ännu inte är inkopplad); tills dess säger knappen att den öppnar vid lansering.
 */
import { View, Text, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { useMembership } from "@/hooks/useMembership";
import { usePeriodLabel } from "@/hooks/usePeriodLabel";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { QuietButton } from "@/components/QuietButton";
import { PrimaryButton } from "@/components/Sheet";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const longDate = (d: Date | string) => formatDate(d, "d MMMM yyyy");

export default function ManagePass() {
  const { t } = useTranslation();
  const router = useRouter();
  const s = useThemedStyles(createStyles);
  const periodLabel = usePeriodLabel();
  const { data: profile } = useProfile();
  const membership = useMembership();

  return (
    <SettingsScreen title={t("pass.manage.title")}>
      <SettingsGroup>
        <SettingsRow dense label={t("pass.manage.pass")} value={periodLabel(membership.period)} />
        {membership.renewsOn ? (
          <SettingsRow dense label={t("pass.manage.renewalOn")} value={longDate(membership.renewsOn)} />
        ) : membership.until ? (
          <SettingsRow dense label={t("pass.manage.validUntil")} value={longDate(membership.until)} />
        ) : null}
        {profile?.member_started_at && (
          <SettingsRow dense label={t("pass.manage.since")} value={longDate(profile.member_started_at)} />
        )}
      </SettingsGroup>

      {membership.autoRenews && membership.renewsOn ? (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Text style={s.title}>{t("pass.manage.cancelTitle")}</Text>
            <Text style={s.hint}>{t("pass.manage.cancelBody", { date: longDate(membership.renewsOn) })}</Text>
          </View>
          <QuietButton
            label={t("pass.manage.cancel")}
            onPress={() => Alert.alert(t("pass.manage.title"), t("pass.manage.soon"), [{ text: t("common.ok") }])}
          />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={s.hint}>{t("pass.manage.noRenew")}</Text>
          <PrimaryButton label={t("pass.status.extend")} onPress={() => router.push("/settings/pass-buy" as any)} />
        </View>
      )}
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, color: c.muted },
});
