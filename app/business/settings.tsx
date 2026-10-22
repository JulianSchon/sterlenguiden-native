/**
 * Inställningar för företaget: om "Är det här ditt företag?" ska synas längst ner på er sida (så
 * nyanställda kan be om att få gå med), villkoren, hjälp och att lämna företaget.
 */
import { useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { FileText, LifeBuoy, LogOut, UserPlus } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { IconSwitch } from "@/components/IconSwitch";
import { Rise } from "@/components/Rise";
import { SaveIndicator } from "@/components/business/PortalParts";
import { useBusinessPlace, usePlaceAutosave, usePortalPlace, useTeamActions } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { businessError } from "@/lib/business";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const HELP_EMAIL = "hej@osterlenappen.se";

export default function BusinessSettings() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { user } = useAuth();
  const { placeId, mine } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const auto = usePlaceAutosave(placeId, 0);
  const team = useTeamActions(placeId);
  const [showLink, setShowLink] = useState<boolean | null>(null);
  const owner = mine?.role === "owner";

  useEffect(() => {
    if (place && showLink === null) setShowLink(!place.claim_link_hidden);
  }, [place, showLink]);

  const leave = () => {
    if (!user || !mine) return;
    Alert.alert(`Lämna ${mine.name}?`, "Du kan inte längre ändra sidan. Någon behöver bjuda in dig igen för att komma tillbaka.", [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Lämna", style: "destructive",
        onPress: () => team.remove(user.id).then((r) => {
          if (r.ok) router.dismissTo("/settings" as never);
          else Alert.alert("Det går inte än", r.reason === "last_owner" ? "Du är den enda ägaren. Gör någon annan till ägare under Personal först." : "Försök igen.");
        }).catch((e) => Alert.alert("Det gick inte", businessError(e))),
      },
    ]);
  };

  return (
    <SettingsScreen title="Inställningar" right={<SaveIndicator state={auto.state} onRetry={auto.flush} />}>
      {owner && (
        <Rise index={0}>
          <SettingsGroup label="Er sida i appen">
            <SettingsRow
              icon={UserPlus}
              label="Visa ”Är det här ditt företag?”"
              subtitle="Längst ner på er sida. Då kan nyanställda be om att få gå med – ni godkänner själva."
              right={showLink === null ? undefined : (
                <IconSwitch value={showLink} onChange={(v) => { setShowLink(v); auto.queue({ claim_link_hidden: !v }, true); }} />
              )}
            />
          </SettingsGroup>
        </Rise>
      )}
      <Rise index={1}>
        <SettingsGroup>
          <SettingsRow icon={FileText} label="Villkor för företag" onPress={() => pushOnce(router, "/business/terms")} />
          <SettingsRow
            icon={LifeBuoy}
            label="Hjälp"
            subtitle={`Mejla ${HELP_EMAIL} – vi svarar personligen.`}
            onPress={() => Linking.openURL(`mailto:${HELP_EMAIL}?subject=${encodeURIComponent(`Hjälp med ${mine?.name ?? "Mitt företag"}`)}`).catch(() => {})}
          />
        </SettingsGroup>
      </Rise>
      <Rise index={2}>
        <SettingsGroup>
          <SettingsRow icon={LogOut} label={`Lämna ${mine?.name ?? "företaget"}`} destructive onPress={leave} />
        </SettingsGroup>
      </Rise>
      {auto.error && <Text style={[s.error, { color: colors.danger }]}>{auto.error}</Text>}
    </SettingsScreen>
  );
}

const createStyles = (_c: ThemeColors) => StyleSheet.create({
  error: { fontFamily: "Inter_500Medium", fontSize: 13.5, textAlign: "center" },
});
