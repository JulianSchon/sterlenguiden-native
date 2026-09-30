/**
 * Dyker upp automatiskt på Mitt Österlen om man har en väntande listinbjudan — stort kort mitt på
 * skärmen, inte en liten rad man kan missa. Accepterar man hamnar listan bland "Dina listor" direkt
 * (useLists filtrerar bort pending tills dess); avböjer man försvinner den, om inte ägaren bjuder
 * in en igen.
 *
 * Visar en i taget: när en besvaras (accepterad/avböjd) invalideras frågan och nästa (om någon)
 * dyker upp automatiskt.
 */
import { useState } from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Users } from "lucide-react-native";
import { usePendingListInvites, useAcceptListInvite, useDeclineListInvite } from "@/hooks/useLists";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

export function PendingListInviteModal() {
  const { data: invites = [] } = usePendingListInvites();
  const accept = useAcceptListInvite();
  const decline = useDeclineListInvite();
  const [busyId, setBusyId] = useState<string | null>(null);

  const current = invites[0];
  if (!current) return null;

  const busy = busyId === current.listId;

  async function respond(action: "accept" | "decline") {
    setBusyId(current.listId);
    try {
      if (action === "accept") {
        await accept.mutateAsync(current.listId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        await decline.mutateAsync(current.listId);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.icon}>
            <Users size={26} color={GOLD} strokeWidth={1.8} />
          </View>
          <Text style={s.lead}>{current.ownerName} har bjudit in dig till listan</Text>
          <Text style={s.name} numberOfLines={2}>{current.listName}</Text>
          <View style={s.row}>
            <TouchableOpacity style={s.ghostBtn} disabled={busy} onPress={() => respond("decline")}>
              <Text style={s.ghostBtnText}>Avböj</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.goldBtn} disabled={busy} onPress={() => respond("accept")}>
              <Text style={s.goldBtnText}>Acceptera</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%", maxWidth: 360, borderRadius: 24, padding: 24, alignItems: "center",
    backgroundColor: "#1A1A1D", borderWidth: 1, borderColor: "rgba(197,160,89,0.25)",
  },
  icon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(197,160,89,0.12)",
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  lead: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center" },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: -0.2, color: FG, textAlign: "center", marginTop: 6 },
  row: { flexDirection: "row", gap: 10, marginTop: 22, alignSelf: "stretch" },
  ghostBtn: {
    flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  ghostBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
  goldBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: GOLD },
  goldBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#0B0B0D" },
});
