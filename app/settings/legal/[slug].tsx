/**
 * Inställningar › Om › en juridisk text (integritetspolicy eller villkor). Texten
 * hämtas ur tabellen legal_documents och skrivs så här: "# Rubrik", "## Underrubrik",
 * "- punkt" och vanliga stycken åtskilda av en tom rad.
 */
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useLegalDocument, type LegalSlug } from "@/hooks/useLegalDocument";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const SLUGS: LegalSlug[] = ["privacy", "terms", "pass-terms"];

export default function LegalDocumentScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>();
  const slug: LegalSlug = SLUGS.find((x) => x === rawSlug) ?? "privacy";
  const { data: doc, isLoading } = useLegalDocument(slug);

  const fallbackTitle = {
    privacy: t("about.legal.privacy"),
    terms: t("about.legal.terms"),
    "pass-terms": t("about.legal.passTerms"),
  }[slug];

  return (
    <SettingsScreen title={doc?.title ?? fallbackTitle}>
      {isLoading ? (
        <ActivityIndicator color={colors.gold} />
      ) : !doc ? (
        <Text style={s.paragraph}>{t("about.legal.notPublished")}</Text>
      ) : (
        <View style={{ gap: 14 }}>
          <Text style={s.updated}>{t("about.legal.updated", { date: formatDate(doc.updatedAt, "d MMMM yyyy") })}</Text>
          {doc.body.split(/\n\s*\n/).map((block, i) => {
            const text = block.trim();
            if (text.startsWith("## ")) return <Text key={i} style={s.subheading}>{text.slice(3)}</Text>;
            if (text.startsWith("# ")) return <Text key={i} style={s.heading}>{text.slice(2)}</Text>;
            if (text.startsWith("- ")) {
              return (
                <View key={i} style={{ gap: 6 }}>
                  {text.split("\n").map((line, j) => (
                    <View key={j} style={s.bulletRow}>
                      <Text style={s.bullet}>•</Text>
                      <Text style={[s.paragraph, { flex: 1 }]}>{line.replace(/^- /, "")}</Text>
                    </View>
                  ))}
                </View>
              );
            }
            return <Text key={i} style={s.paragraph}>{text}</Text>;
          })}
        </View>
      )}
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  updated: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.faint },
  heading: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, lineHeight: 28, color: c.text, marginTop: 6 },
  subheading: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: c.text, marginTop: 4 },
  paragraph: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 22, color: c.muted },
  bulletRow: { flexDirection: "row", gap: 10, paddingLeft: 4 },
  bullet: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 22, color: c.goldText },
});
