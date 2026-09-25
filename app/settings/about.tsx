/**
 * Inställningar › Om: loggan, appens namn och version, de juridiska texterna
 * (integritetspolicy, användarvillkor, villkor för Österlenpasset) och, när en
 * adress finns, hur man kontaktar oss. De juridiska texterna ligger på webbplatsen;
 * en rad visas när dess adress är satt i src/lib/appInfo.ts.
 */
import { View, Text, Image, Linking, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Crown, FileText, Mail, Shield } from "lucide-react-native";
import { APP_VERSION, LEGAL_URLS, SUPPORT_EMAIL } from "@/lib/appInfo";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export default function AboutSettings() {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);

  const legalRows = [
    { key: "privacy", icon: Shield, label: t("about.legal.privacy"), url: LEGAL_URLS.privacy },
    { key: "terms", icon: FileText, label: t("about.legal.terms"), url: LEGAL_URLS.terms },
    { key: "passTerms", icon: Crown, label: t("about.legal.passTerms"), url: LEGAL_URLS.passTerms },
  ].flatMap((row) => (row.url ? [{ ...row, url: row.url }] : []));

  return (
    <SettingsScreen title={t("about.title")}>
      <View style={s.hero}>
        <Image source={require("../../assets/Osterlenappen-logo.png")} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={s.appName}>{t("about.appName")}</Text>
        <Text style={s.tagline}>{t("about.tagline")}</Text>
        <Text style={s.description}>{t("about.description")}</Text>
      </View>

      {legalRows.length > 0 && (
        <SettingsGroup label={t("about.legal.title")}>
          {legalRows.map(({ key, icon, label, url }) => (
            <SettingsRow key={key} icon={icon} label={label} onPress={() => Linking.openURL(url)} />
          ))}
        </SettingsGroup>
      )}

      {SUPPORT_EMAIL && (
        <SettingsGroup>
          <SettingsRow icon={Mail} label={t("about.contact")} subtitle={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        </SettingsGroup>
      )}

      <View style={s.footer}>
        {APP_VERSION !== "" && <Text style={s.footerText}>{t("about.version", { version: APP_VERSION })}</Text>}
        <Text style={s.footerText}>{t("about.rights", { year: new Date().getFullYear() })}</Text>
      </View>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  hero: { alignItems: "center", gap: 8, paddingVertical: 8 },
  logo: { width: 92, height: 104, marginBottom: 6 },
  appName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 28, color: c.text },
  tagline: { fontFamily: "Inter_500Medium", fontSize: 13, letterSpacing: 0.4, color: c.warm },
  description: {
    fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: c.muted,
    textAlign: "center", paddingHorizontal: 20, marginTop: 6,
  },
  footer: { alignItems: "center", gap: 4, paddingTop: 8 },
  footerText: { fontFamily: "Inter_400Regular", fontSize: 12, color: c.faint },
});
