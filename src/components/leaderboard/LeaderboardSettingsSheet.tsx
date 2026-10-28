/**
 * Synlighet i topplistorna — öppnas från knappen uppe till höger på topplistesidan. Två reglage,
 * var och en med en rad som förklarar exakt vad det innebär:
 *  1. Synas i topplistorna — namn, användarnamn, ort och statistik visas för andra i appen.
 *  2. Visa profilbild — bara möjligt när man syns; annars visas en initialcirkel.
 * Att slå på det första här är ett uttryckligt samtycke (texten står bredvid reglaget). Stängs
 * synligheten av följer profilbilden med av, så den aldrig ligger kvar påslagen "i bakgrunden".
 */
import { Alert, Text, View, StyleSheet } from "react-native";
import { Sheet } from "@/components/Sheet";
import { IconSwitch } from "@/components/IconSwitch";
import { useProfile } from "@/hooks/useProfile";
import { useSetLeaderboardAvatar, useSetLeaderboardVisibility } from "@/hooks/useLeaderboard";
import i18n from "i18next";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


export function LeaderboardSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useThemedStyles(createStyles);
  const { data: profile } = useProfile();
  const setVisibility = useSetLeaderboardVisibility();
  const setAvatar = useSetLeaderboardAvatar();
  const showing = profile?.show_in_leaderboard === true;
  const showingAvatar = showing && profile?.show_leaderboard_avatar === true;

  const fail = () => Alert.alert(i18n.t("leaderboard.saveFailedTitle"), i18n.t("leaderboard.saveFailedText"));

  async function toggleVisible(on: boolean) {
    try {
      await setVisibility.mutateAsync(on);
      if (!on && profile?.show_leaderboard_avatar) setAvatar.mutate(false);
    } catch {
      fail();
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t("leaderboard.settingsTitle")}>
      <View style={s.row}>
        <View style={s.texts}>
          <Text style={s.label}>{i18n.t("leaderboard.appear")}</Text>
          <Text style={s.help}>{i18n.t("leaderboard.appearHelp")}</Text>
        </View>
        <IconSwitch value={showing} onChange={toggleVisible} />
      </View>

      <View style={s.divider} />

      <View style={[s.row, !showing && s.disabled]} pointerEvents={showing ? "auto" : "none"}>
        <View style={s.texts}>
          <Text style={s.label}>{i18n.t("leaderboard.showPhoto")}</Text>
          <Text style={s.help}>
            {showing
              ? i18n.t("leaderboard.showPhotoOn")
              : i18n.t("leaderboard.showPhotoOff")}
          </Text>
        </View>
        <IconSwitch value={showingAvatar} onChange={(on) => setAvatar.mutate(on, { onError: fail })} />
      </View>
    </Sheet>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 6 },
  texts: { flex: 1 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 15.5, color: c.text },
  help: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.borderStrong, marginVertical: 14 },
  disabled: { opacity: 0.4 },
});
