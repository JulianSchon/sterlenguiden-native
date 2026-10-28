/**
 * Inställningar › Intressen: kategorierna man gillar — samma bildrutor som i onboardingen. Ett tryck
 * sparas direkt, och Hem och Kalender tipsar efter det ("Eftersom du gillar …").
 */
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateProfile } from "@/hooks/useAccount";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { InterestGrid } from "@/components/onboarding/InterestGrid";
import { Rise } from "@/components/Rise";
import type { CategoryId } from "@/theme/categories";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

/** SettingsScreens luft mot kanterna */
const GUTTER = 16;

export default function InterestsSettings() {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  // Det man tryckt på gäller direkt, även innan servern svarat
  const [picked, setPicked] = useState<CategoryId[] | null>(null);
  const selected = picked ?? ((profile?.interests ?? []) as CategoryId[]);

  const toggle = (id: CategoryId) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setPicked(next);
    updateProfile.mutate({ interests: next });
  };

  return (
    <SettingsScreen title={t("interests.title")}>
      <Rise index={0}>
        <Text style={s.lead}>{t("interests.subtitle")}</Text>
      </Rise>
      <Rise index={1}>
        <InterestGrid selected={selected} onToggle={toggle} gutter={GUTTER} />
      </Rise>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  lead: { fontFamily: "Inter_400Regular", fontSize: 15.5, lineHeight: 22, color: c.muted },
});
