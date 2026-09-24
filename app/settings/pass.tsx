/**
 * Inställningar › Österlenpasset — hubben: status, lös in kod, köphistorik och
 * pass man gett bort. Köpet ligger på en egen skärm (settings/pass-buy.tsx).
 */
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Crown, Ticket, Receipt, Gift, Copy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useMembership } from "@/hooks/useMembership";
import { useIsBusiness } from "@/hooks/useUserRole";
import { usePassPurchases, usePassGifts } from "@/hooks/usePassHistory";
import { periodLabel } from "@/lib/membership";

const BG    = "#121212";
const CARD  = "#1A1A1A";
const FG    = "#EDEDED";
const MUTED = "#9E9E9E";
const GOLD  = "#C5A059";
const GOLD_TEXT = "#E8C674";
const BORDER = "rgba(197,160,89,0.14)";

const longDate = (d: Date | string) => format(new Date(d), "d MMMM yyyy", { locale: sv });

export default function PassHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const membership = useMembership();
  const { isBusiness } = useIsBusiness();
  const { data: purchases = [] } = usePassPurchases();
  const { data: gifts = [] } = usePassGifts();

  const handleManage = () => {
    Alert.alert("Hantera medlemskap", "Här kan du snart se och avsluta ditt pass. Det öppnas när betalningen är på plats.", [{ text: "OK" }]);
  };

  const validity = membership.renewsOn
    ? `Förnyas ${longDate(membership.renewsOn)}`
    : membership.until
      ? `Gäller till och med ${longDate(membership.until)}`
      : "Utan slutdatum";

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 44) }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Österlenpasset</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
        {isBusiness ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>För besökare</Text>
            <Text style={s.desc}>Österlenpasset är till för besökare och kan inte köpas med ett företagskonto.</Text>
          </View>
        ) : (
          <>
            <View>
              <Text style={s.eyebrow}>DITT MEDLEMSKAP</Text>
              <Text style={s.subtitle}>Status, presentkoder och dina köp – allt på ett ställe.</Text>
            </View>

            {/* Status */}
            <View>
              <Text style={s.groupLabel}>STATUS</Text>
              <View style={s.card}>
                <View style={s.rowInline}>
                  <Crown size={16} color={GOLD} strokeWidth={1.8} />
                  <Text style={s.cardTitle}>{membership.isMember ? "Aktivt Österlenpass" : "Inget aktivt pass"}</Text>
                </View>
                <Text style={s.desc}>
                  {membership.isMember
                    ? `${periodLabel(membership.period)}${membership.period ? " · " : ""}${validity}`
                    : "Lås upp rabatter och förmåner hos lokala företag på Österlen."}
                </Text>
                {membership.waitingBonusDays > 0 && (
                  <Text style={s.desc}>
                    {membership.waitingBonusDays} dagar från presentkod är sparade och används när passet slutar förnyas.
                  </Text>
                )}
                {membership.isMember && membership.autoRenews ? (
                  <TouchableOpacity style={s.ghostBtn} onPress={handleManage}>
                    <Text style={s.ghostBtnText}>Hantera medlemskap</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={s.cta} onPress={() => router.push("/settings/pass-buy" as any)}>
                    <Text style={s.ctaText}>{membership.isMember ? "Förläng passet" : "Skaffa Österlenpasset"}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Presentkod */}
            <View>
              <Text style={s.groupLabel}>PRESENTKOD</Text>
              <TouchableOpacity style={[s.card, s.rowCard]} activeOpacity={0.8} onPress={() => router.push("/settings/redeem" as any)}>
                <View style={s.tile}><Ticket size={16} color={GOLD} strokeWidth={1.6} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>Lös in presentkod</Text>
                  <Text style={s.desc}>Har du fått passet i present? Tiden läggs på ditt nuvarande pass.</Text>
                </View>
                <ChevronRight size={16} color="rgba(255,255,255,0.3)" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Köphistorik */}
            <View>
              <Text style={s.groupLabel}>KÖPHISTORIK</Text>
              <View style={{ gap: 8 }}>
                {purchases.length === 0 ? (
                  <View style={s.card}><Text style={s.desc}>Du har inte gjort några köp ännu.</Text></View>
                ) : (
                  purchases.map((p) => (
                    <View key={p.id} style={[s.card, s.rowCard]}>
                      <View style={s.tile}><Receipt size={16} color={GOLD} strokeWidth={1.6} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowLabel}>{periodLabel(p.period)}{p.kind === "gift" ? " (present)" : ""}</Text>
                        <Text style={s.desc}>{longDate(p.createdAt)}</Text>
                      </View>
                      <Text style={s.value}>{p.priceSek} kr</Text>
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* Presenter du gett bort */}
            <View>
              <Text style={s.groupLabel}>PRESENTER DU GETT BORT</Text>
              <View style={{ gap: 8 }}>
                {gifts.length === 0 ? (
                  <View style={s.card}><Text style={s.desc}>Du har inte gett bort något pass ännu.</Text></View>
                ) : (
                  gifts.map((g) => (
                    <View key={g.id} style={[s.card, s.rowCard]}>
                      <View style={s.tile}><Gift size={16} color={GOLD} strokeWidth={1.6} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowLabel} numberOfLines={1}>{g.recipientName || "Presentkort"}</Text>
                        <Text style={s.desc}>
                          {periodLabel(g.period)} · {g.claimed ? "Inlöst" : "Ej inlöst"}
                          {g.deliveryMethod === "print" ? " · Utskrift" : g.deliveryMethod === "email" ? " · Mejl" : ""}
                        </Text>
                      </View>
                      {!g.claimed && (
                        <TouchableOpacity
                          style={s.codePill}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            Share.share({ message: g.claimCode });
                          }}
                        >
                          <Copy size={14} color={GOLD_TEXT} strokeWidth={2} />
                          <Text style={s.codePillText}>{g.claimCode}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(197,160,89,0.25)", backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 18, color: FG, flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 64, gap: 20 },

  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2.2, color: GOLD },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, color: MUTED, marginTop: 6 },
  groupLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2, color: "rgba(158,158,158,0.7)", paddingLeft: 4, marginBottom: 8 },

  card: { backgroundColor: CARD, borderRadius: 18, padding: 14, borderWidth: 0.5, borderColor: BORDER, gap: 8 },
  rowCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowInline: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
  desc: { fontFamily: "Inter_400Regular", fontSize: 11.5, lineHeight: 17, color: MUTED },
  rowLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: FG, marginBottom: 2 },
  value: { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(237,237,237,0.8)" },

  tile: {
    width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(197,160,89,0.10)", borderWidth: 0.5, borderColor: "rgba(197,160,89,0.22)",
  },

  cta: { height: 40, borderRadius: 12, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", marginTop: 4 },
  ctaText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#0B0B0D" },
  ghostBtn: {
    height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 4,
    backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.25)",
  },
  ghostBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: GOLD },

  codePill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, backgroundColor: "rgba(197,160,89,0.12)",
  },
  codePillText: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, color: GOLD_TEXT },
});
