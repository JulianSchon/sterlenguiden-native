/**
 * Samtycket till topplistorna — ett uttryckligt ja, inget förvalt (GDPR: av som standard).
 * Visas första gången man öppnar topplistesidan, och när man trycker på "Dela med dig av din
 * statistik…". `declineOnDismiss`: stängs rutan utan val vid första frågan räknas det som
 * "Inte nu", så man inte frågas om igen varje gång — man kan alltid gå med senare via knappen.
 */
import { Alert, Text, View, StyleSheet } from "react-native";
import { Trophy } from "lucide-react-native";
import { Sheet, PrimaryButton, SecondaryButton } from "@/components/Sheet";
import { PressableScale } from "@/components/PressableScale";
import { useSetLeaderboardVisibility } from "@/hooks/useLeaderboard";

const MUTED = "rgba(245,241,232,0.7)";
const GOLD = "#C5A059";

/** Knappen för den som inte deltar än — öppnar samtyckesrutan, går aldrig med direkt. */
export function JoinLeaderboardButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale style={s.join} scale={0.98} onPress={onPress}>
      <Trophy size={16} color={GOLD} strokeWidth={2} />
      <Text style={s.joinText}>Dela med dig av din statistik för att delta i topplistorna</Text>
    </PressableScale>
  );
}

export function LeaderboardConsentSheet({
  visible, onClose, declineOnDismiss = false,
}: { visible: boolean; onClose: () => void; declineOnDismiss?: boolean }) {
  const setVisibility = useSetLeaderboardVisibility();

  async function choose(visible: boolean) {
    try {
      await setVisibility.mutateAsync(visible);
      onClose();
    } catch {
      onClose();
      Alert.alert("Det gick inte att spara", "Kontrollera anslutningen och försök igen.");
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => (declineOnDismiss ? choose(false) : onClose())}
      title="Vill du synas i topplistorna?"
      centered
    >
      <Text style={s.body}>
        Ditt namn, användarnamn, ort och din statistik — antal besök, din streak och hur många samlarobjekt du
        hittat — visas då
        för andra i appen: i hela appen, i ditt område och bland dina vänner. Profilbilden visas bara om du
        själv slår på det.
      </Text>
      <Text style={s.body}>Du kan ändra dig när som helst.</Text>
      <View style={s.buttons}>
        <PrimaryButton label="Ja, visa mig" onPress={() => choose(true)} loading={setVisibility.isPending} />
        <SecondaryButton label="Inte nu" onPress={() => choose(false)} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  body: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: MUTED, marginBottom: 10 },
  buttons: { gap: 10, marginTop: 8 },
  join: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(197,160,89,0.5)", backgroundColor: "rgba(197,160,89,0.06)",
  },
  joinText: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13.5, lineHeight: 18, color: GOLD },
});
