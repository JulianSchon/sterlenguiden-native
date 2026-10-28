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
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


/** Knappen för den som inte deltar än — öppnar samtyckesrutan, går aldrig med direkt. */
export function JoinLeaderboardButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <PressableScale style={s.join} scale={0.98} onPress={onPress}>
      <Trophy size={16} color={colors.goldText} strokeWidth={2} />
      <Text style={s.joinText}>{i18n.t("leaderboard.join")}</Text>
    </PressableScale>
  );
}

export function LeaderboardConsentSheet({
  visible, onClose, declineOnDismiss = false,
}: { visible: boolean; onClose: () => void; declineOnDismiss?: boolean }) {
  const s = useThemedStyles(createStyles);
  const setVisibility = useSetLeaderboardVisibility();

  async function choose(visible: boolean) {
    try {
      await setVisibility.mutateAsync(visible);
      onClose();
    } catch {
      onClose();
      Alert.alert(i18n.t("leaderboard.saveFailedTitle"), i18n.t("leaderboard.saveFailedText"));
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => (declineOnDismiss ? choose(false) : onClose())}
      title={i18n.t("leaderboard.consentTitle")}
      centered
    >
      <Text style={s.body}>{i18n.t("leaderboard.consentText")}</Text>
      <Text style={s.body}>{i18n.t("leaderboard.changeAnytime")}</Text>
      <View style={s.buttons}>
        <PrimaryButton label={i18n.t("leaderboard.yes")} onPress={() => choose(true)} loading={setVisibility.isPending} />
        <SecondaryButton label={i18n.t("leaderboard.notNow")} onPress={() => choose(false)} />
      </View>
    </Sheet>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  body: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: c.muted, marginBottom: 10 },
  buttons: { gap: 10, marginTop: 8 },
  join: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14,
    borderWidth: 1, borderColor: c.goldBorder, backgroundColor: c.goldSoft,
  },
  joinText: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13.5, lineHeight: 18, color: c.goldText },
});
