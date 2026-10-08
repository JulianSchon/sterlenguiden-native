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

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.6)";

export function LeaderboardSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data: profile } = useProfile();
  const setVisibility = useSetLeaderboardVisibility();
  const setAvatar = useSetLeaderboardAvatar();
  const showing = profile?.show_in_leaderboard === true;
  const showingAvatar = showing && profile?.show_leaderboard_avatar === true;

  const fail = () => Alert.alert("Det gick inte att spara", "Kontrollera anslutningen och försök igen.");

  async function toggleVisible(on: boolean) {
    try {
      await setVisibility.mutateAsync(on);
      if (!on && profile?.show_leaderboard_avatar) setAvatar.mutate(false);
    } catch {
      fail();
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Synlighet i topplistorna">
      <View style={s.row}>
        <View style={s.texts}>
          <Text style={s.label}>Synas i topplistorna</Text>
          <Text style={s.help}>
            Ditt namn, användarnamn, ort och din statistik — besök, streak och samlarobjekt — visas för andra
            i appen: i hela appen, i ditt område och bland dina vänner.
          </Text>
        </View>
        <IconSwitch value={showing} onChange={toggleVisible} />
      </View>

      <View style={s.divider} />

      <View style={[s.row, !showing && s.disabled]} pointerEvents={showing ? "auto" : "none"}>
        <View style={s.texts}>
          <Text style={s.label}>Visa profilbild</Text>
          <Text style={s.help}>
            {showing
              ? "Din profilbild visas i stället för en cirkel med dina initialer."
              : "Slå på \"Synas i topplistorna\" först."}
          </Text>
        </View>
        <IconSwitch value={showingAvatar} onChange={(on) => setAvatar.mutate(on, { onError: fail })} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 6 },
  texts: { flex: 1 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 15.5, color: FG },
  help: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: MUTED, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 14 },
  disabled: { opacity: 0.4 },
});
