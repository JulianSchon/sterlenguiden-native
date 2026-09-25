/**
 * Inställningar › Tipsa oss: förslag på en plats eller upplevelse som saknas i appen.
 * Tipsen sparas i place_suggestions och läses i Supabase. Efteråt visas ett tack.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check, Link2, MapPin, MessageSquareText, Store } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useSuggestPlace, type SuggestionCategory } from "@/hooks/useSuggestPlace";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { IconSwitch } from "@/components/IconSwitch";
import { LabeledField } from "@/components/LabeledField";
import { PrimaryButton } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const CATEGORIES: SuggestionCategory[] = ["food", "stay", "cafe", "shops", "nature", "activities", "sights", "crafts"];

export default function SuggestPlaceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const suggest = useSuggestPlace();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<SuggestionCategory | null>(null);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [sent, setSent] = useState(false);

  const categoryNames: Record<SuggestionCategory, string> = {
    food: t("suggestForm.categories.food"),
    stay: t("suggestForm.categories.stay"),
    cafe: t("suggestForm.categories.cafe"),
    shops: t("suggestForm.categories.shops"),
    nature: t("suggestForm.categories.nature"),
    activities: t("suggestForm.categories.activities"),
    sights: t("suggestForm.categories.sights"),
    crafts: t("suggestForm.categories.crafts"),
  };

  async function send() {
    try {
      await suggest.mutateAsync({ name, category, location, description, link, isOwner });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSent(true);
    } catch (e) {
      const limit = e instanceof Error && e.message === "suggestion_limit";
      Alert.alert(t("common.error"), limit ? t("suggestForm.limit") : t("suggestForm.failed"));
    }
  }

  if (sent) {
    return (
      <SettingsScreen title={t("suggestForm.title")}>
        <View style={s.thanks}>
          <View style={s.check}>
            <Check size={30} color={colors.onGold} strokeWidth={3} />
          </View>
          <Text style={s.thanksTitle}>{t("suggestForm.thanksTitle")}</Text>
          <Text style={s.thanksBody}>{t("suggestForm.thanksBody")}</Text>
          <View style={{ alignSelf: "stretch" }}>
            <PrimaryButton label={t("common.done")} onPress={() => router.back()} />
          </View>
        </View>
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen title={t("suggestForm.title")}>
      <Text style={s.intro}>{t("suggestForm.intro")}</Text>

      <LabeledField icon={Store} label={t("suggestForm.name")} value={name} onChangeText={setName} maxLength={120} autoCapitalize="words" />

      <View style={{ gap: 8 }}>
        <Text style={s.label}>{t("suggestForm.category")}</Text>
        <View style={s.chips}>
          {CATEGORIES.map((id) => {
            const active = category === id;
            return (
              <TouchableOpacity
                key={id}
                style={[s.chip, active && s.chipActive]}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCategory(active ? null : id);
                }}
              >
                <Text style={[s.chipText, active && { color: colors.goldText }]} numberOfLines={1}>{categoryNames[id]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <LabeledField
        icon={MapPin}
        label={t("suggestForm.location")}
        value={location}
        onChangeText={setLocation}
        placeholder={t("suggestForm.locationPlaceholder")}
        maxLength={200}
      />
      <LabeledField
        icon={MessageSquareText}
        label={t("suggestForm.description")}
        value={description}
        onChangeText={setDescription}
        placeholder={t("suggestForm.descriptionPlaceholder")}
        multiline
        maxLength={1000}
      />
      <LabeledField
        icon={Link2}
        label={t("suggestForm.link")}
        value={link}
        onChangeText={setLink}
        placeholder={t("suggestForm.linkPlaceholder")}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={300}
      />

      <SettingsGroup>
        <SettingsRow
          compact
          label={t("suggestForm.owner")}
          subtitle={t("suggestForm.ownerHint")}
          right={<IconSwitch value={isOwner} onChange={setIsOwner} />}
        />
      </SettingsGroup>

      <PrimaryButton label={t("suggestForm.send")} onPress={send} disabled={name.trim().length < 2} loading={suggest.isPending} />
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  intro: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: c.muted },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.muted, paddingLeft: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 38, paddingHorizontal: 14, justifyContent: "center", borderRadius: 19,
    borderWidth: 1, borderColor: c.borderStrong,
  },
  chipActive: { borderColor: c.goldBorder, backgroundColor: c.goldSoft },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.muted },

  thanks: { alignItems: "center", gap: 14, paddingTop: 30 },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.gold, alignItems: "center", justifyContent: "center" },
  thanksTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, color: c.text, textAlign: "center" },
  thanksBody: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: c.muted, textAlign: "center", paddingHorizontal: 12 },
});
