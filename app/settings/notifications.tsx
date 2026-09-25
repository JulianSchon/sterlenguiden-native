/**
 * Inställningar › Notiser: vilka sorters notiser man vill ha och, för event och
 * erbjudanden, om det ska gälla hela Österlen eller bara valda orter. Valen sparas
 * i databasen (notification_preferences). Telefonens eget tillstånd och själva
 * utskicket kopplas in med nästa bygge (kräver expo-notifications).
 */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { CalendarDays, Crown, Newspaper, Tag, type LucideIcon } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useNotificationPrefs, useUpdateNotificationPrefs, usePlaceTowns, type NotificationPrefs } from "@/hooks/useNotificationPrefs";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { IconSwitch } from "@/components/IconSwitch";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

type Topic = "events" | "offers" | "news" | "pass";

const TOPICS: { key: Topic; icon: LucideIcon }[] = [
  { key: "events", icon: CalendarDays },
  { key: "offers", icon: Tag },
  { key: "news", icon: Newspaper },
  { key: "pass", icon: Crown },
];

export default function NotificationsSettings() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { data: prefs } = useNotificationPrefs();
  const { data: towns = [] } = usePlaceTowns();
  const update = useUpdateNotificationPrefs();

  // Tills raden hämtats visas ingenting som kan tryckas fel
  if (!prefs) return <SettingsScreen title={t("notifications.title")}>{null}</SettingsScreen>;

  const change = (changes: Partial<NotificationPrefs>) => update.mutate(changes);
  const toggleTown = (town: string) => {
    Haptics.selectionAsync().catch(() => {});
    change({ towns: prefs.towns.includes(town) ? prefs.towns.filter((x) => x !== town) : [...prefs.towns, town] });
  };
  const chooseScope = (scope: NotificationPrefs["scope"]) => {
    Haptics.selectionAsync().catch(() => {});
    change({ scope });
  };

  const topicText = {
    events: { title: t("notifications.events.title"), hint: t("notifications.events.hint") },
    offers: { title: t("notifications.offers.title"), hint: t("notifications.offers.hint") },
    news: { title: t("notifications.news.title"), hint: t("notifications.news.hint") },
    pass: { title: t("notifications.pass.title"), hint: t("notifications.pass.hint") },
  };

  return (
    <SettingsScreen title={t("notifications.title")}>
      <SettingsGroup label={t("notifications.topics")}>
        {TOPICS.map(({ key, icon }) => (
          <SettingsRow
            key={key}
            icon={icon}
            label={topicText[key].title}
            subtitle={topicText[key].hint}
            right={<IconSwitch value={prefs[key]} onChange={(value) => change({ [key]: value })} />}
          />
        ))}
      </SettingsGroup>

      {(prefs.events || prefs.offers) && (
        <View style={{ gap: 12 }}>
          <Text style={s.label}>{t("notifications.area.title")}</Text>
          <View style={s.segment}>
            {(["all", "towns"] as const).map((scope) => {
              const active = prefs.scope === scope;
              return (
                <TouchableOpacity key={scope} style={[s.segmentItem, active && s.segmentItemActive]} activeOpacity={0.8} onPress={() => chooseScope(scope)}>
                  <Text style={[s.segmentText, active && { color: colors.text }]}>{t(`notifications.area.${scope}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {prefs.scope === "towns" && (
            <View style={{ gap: 10 }}>
              <Text style={s.hint}>{t("notifications.area.pick")}</Text>
              <View style={s.chips}>
                {towns.map((town) => {
                  const active = prefs.towns.includes(town);
                  return (
                    <TouchableOpacity key={town} style={[s.chip, active && s.chipActive]} activeOpacity={0.8} onPress={() => toggleTown(town)}>
                      <Text style={[s.chipText, active && { color: colors.goldText }]} numberOfLines={1}>{town}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          <Text style={s.hint}>{t("notifications.area.hint")}</Text>
        </View>
      )}

      <Text style={s.note}>{t("notifications.note")}</Text>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, textTransform: "uppercase",
  },
  segment: { flexDirection: "row", padding: 4, gap: 4, borderRadius: 16, backgroundColor: c.fill },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "transparent" },
  segmentItemActive: { backgroundColor: c.card, borderColor: c.goldBorder },
  segmentText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.muted },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 38, paddingHorizontal: 14, justifyContent: "center", borderRadius: 19,
    borderWidth: 1, borderColor: c.borderStrong, backgroundColor: "transparent",
  },
  chipActive: { borderColor: c.goldBorder, backgroundColor: c.goldSoft },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.muted },

  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.faint, paddingHorizontal: 6 },
  note: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, color: c.faint, paddingHorizontal: 6, textAlign: "center" },
});
