/**
 * Inställningar för företaget: om "Är det här ditt företag?" ska synas längst ner på er sida (så
 * nyanställda kan be om att få gå med), villkoren, hjälp och att lämna företaget.
 */
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, type GestureResponderEvent } from "react-native";
import { useRouter } from "expo-router";
import { FileText, LifeBuoy, LogOut, UserPlus } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { IconSwitch } from "@/components/IconSwitch";
import { useActionMenu } from "@/components/ActionMenu";
import { Rise } from "@/components/Rise";
import { SaveIndicator } from "@/components/business/PortalParts";
import { useBusinessPlace, usePlaceAutosave, usePortalPlace, useTeamActions } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { businessError } from "@/lib/business";
import { BUSINESS_EMAIL as HELP_EMAIL } from "@/lib/appInfo";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";


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
  const actionMenu = useActionMenu();
  const owner = mine?.role === "owner";

  useEffect(() => {
    if (place && showLink === null) setShowLink(!place.claim_link_hidden);
  }, [place, showLink]);

  const leave = (e: GestureResponderEvent) => {
    if (!user || !mine) return;
    const y = e.nativeEvent.pageY;
    const fail = (title: string, message: string) => actionMenu.ask(y, { title, message, actions: [] });
    actionMenu.ask(y, {
      title: tb("Lämna {{0}}?", { 0: mine.name }), message: tb("Du kan inte längre ändra sidan. Någon behöver bjuda in dig igen för att komma tillbaka."),
      actions: [{
        label: tb("Lämna"), destructive: true,
        onPress: () => team.remove(user.id).then((r) => {
          if (r.ok) router.dismissTo("/settings");
          else fail(tb("Det går inte än"), r.reason === "last_owner" ? tb("Du är den enda ägaren. Gör någon annan till ägare under Personal först.") : tb("Försök igen."));
        }).catch((err) => fail(tb("Det gick inte"), businessError(err))),
      }],
    });
  };

  return (
    <SettingsScreen title={tb("Inställningar")} right={<SaveIndicator state={auto.state} onRetry={auto.flush} />}>
      {owner && (
        <Rise index={0}>
          <SettingsGroup label={tb("Er sida i appen")}>
            <SettingsRow
              icon={UserPlus}
              wrap
              label={tb("Visa ”Är det här ditt företag?”")}
              subtitle={tb("Längst ner på er sida. Då kan nyanställda be om att få gå med – ni godkänner själva.")}
              right={showLink === null ? undefined : (
                <IconSwitch value={showLink} onChange={(v) => { setShowLink(v); auto.queue({ claim_link_hidden: !v }, true); }} />
              )}
            />
          </SettingsGroup>
        </Rise>
      )}
      <Rise index={1}>
        <SettingsGroup>
          <SettingsRow icon={FileText} label={tb("Villkor för företag")} onPress={() => pushOnce(router, "/business/terms")} />
          <SettingsRow
            icon={LifeBuoy}
            label={tb("Hjälp")}
            subtitle={tb("Mejla {{0}} – vi svarar personligen.", { 0: HELP_EMAIL })}
            onPress={() => Linking.openURL(`mailto:${HELP_EMAIL}?subject=${encodeURIComponent(`Hjälp med ${mine?.name ?? "Mitt företag"}`)}`).catch(() => {})}
          />
        </SettingsGroup>
      </Rise>
      <Rise index={2}>
        <SettingsGroup>
          <SettingsRow icon={LogOut} label={tb("Lämna {{0}}", { 0: mine?.name ?? "företaget" })} destructive onPress={leave} />
        </SettingsGroup>
      </Rise>
      {auto.error && <Text style={[s.error, { color: colors.danger }]}>{auto.error}</Text>}
      {actionMenu.element}
    </SettingsScreen>
  );
}

const createStyles = (_c: ThemeColors) => StyleSheet.create({
  error: { fontFamily: "Inter_500Medium", fontSize: 13.5, textAlign: "center" },
});
