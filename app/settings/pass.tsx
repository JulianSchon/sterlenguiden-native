/**
 * Inställningar › Österlenpasset
 * Medlem: status (aktivt till/förnyas, sparade presentdagar). Ej medlem: förmåner,
 * val av pass och köpknapp. Själva betalningen är inte inkopplad än — köpknappen
 * säger tills vidare att den öppnar vid lansering.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Crown, Check, Ticket } from "lucide-react-native";
import Svg, { Defs, RadialGradient, Stop, Ellipse, Path, LinearGradient, Rect } from "react-native-svg";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useMembership } from "@/hooks/useMembership";
import { useIsBusiness } from "@/hooks/useUserRole";
import { usePassProducts, type PassProduct } from "@/hooks/usePassProducts";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";

const PERKS = [
  "Rabatter och förmåner hos lokala företag på Österlen",
  "Nya erbjudanden och upplevelser tillkommer under säsongen",
  "Du stöder lokala företag och kulturen på Österlen",
] as const;

const DEFAULT_PRODUCT = "month";

function GoldMiniCard() {
  return (
    <Svg width={320} height={180} viewBox="0 0 320 180" style={{ borderRadius: 20, overflow: "hidden" }}>
      <Defs>
        <LinearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1a1a1a" />
          <Stop offset="1" stopColor="#0e0e0e" />
        </LinearGradient>
        <LinearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#F0D080" />
          <Stop offset="0.5" stopColor="#C5A059" />
          <Stop offset="1" stopColor="#9B7A2E" />
        </LinearGradient>
        <RadialGradient id="glow" cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#C5A059" stopOpacity="0.18" />
          <Stop offset="1" stopColor="#C5A059" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={320} height={180} rx={20} fill="url(#cardGrad)" />
      <Ellipse cx={160} cy={70} rx={200} ry={110} fill="url(#glow)" />
      {/* Wave lines */}
      {[50,66,82].map((y, i) => (
        <Path
          key={i}
          d={`M -10 ${y} Q 80 ${y-12+i*3} 160 ${y+6-i*2} T 330 ${y-4}`}
          stroke="url(#goldGrad)" strokeWidth={0.8} fill="none" strokeOpacity={0.55 - i*0.1}
        />
      ))}
      {/* Inner border */}
      <Rect x={8} y={8} width={304} height={164} rx={14} stroke="url(#goldGrad)" strokeWidth={0.8} fill="none" strokeOpacity={0.35} />
    </Svg>
  );
}

const longDate = (d: Date) => format(d, "d MMMM yyyy", { locale: sv });
const price = (p: PassProduct) => `${Math.round(p.priceSek)} kr`;

export default function PassSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const membership = useMembership();
  const { isBusiness } = useIsBusiness();
  const { data: products = [], isLoading: productsLoading } = usePassProducts();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const safeTop = Math.max(insets.top, 44);
  const selected = products.find((x) => x.id === (selectedId ?? DEFAULT_PRODUCT)) ?? products[0];
  const currentPlan = products.find((x) => x.id === membership.period);

  const handlePurchase = () => {
    Alert.alert("Österlenpasset", "Betalningen öppnar vid lansering. Vi meddelar dig när det är klart!", [{ text: "OK" }]);
  };

  const handleManage = () => {
    Alert.alert("Hantera medlemskap", "Här kan du snart se och avsluta ditt pass. Det öppnas när betalningen är på plats.", [{ text: "OK" }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[p.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={p.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={p.headerTitle}>Österlenpasset</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={p.body}>
        {isBusiness ? (
          <View style={p.card}>
            <Text style={p.statusInactive}>För besökare</Text>
            <Text style={p.statusSub}>Österlenpasset är till för besökare och kan inte köpas med ett företagskonto.</Text>
          </View>
        ) : (
          <>
            <View style={p.cardVisualWrap}>
              <GoldMiniCard />
              {membership.isMember && (
                <View style={p.activeBadge}>
                  <Crown size={13} color="#121212" strokeWidth={2.2} />
                  <Text style={p.activeBadgeText}>AKTIVT</Text>
                </View>
              )}
            </View>

            {membership.isMember ? (
              <View style={p.card}>
                <Text style={p.eyebrow}>STATUS</Text>
                <Text style={p.statusActive}>Ditt pass är aktivt</Text>
                {currentPlan && <Text style={p.statusSub}>{currentPlan.name}</Text>}
                {membership.renewsOn ? (
                  <Text style={p.statusSub}>Förnyas {longDate(membership.renewsOn)}</Text>
                ) : membership.until ? (
                  <Text style={p.statusSub}>Gäller till {longDate(membership.until)}</Text>
                ) : null}
                {membership.waitingBonusDays > 0 && (
                  <Text style={p.statusSub}>
                    {membership.waitingBonusDays} dagar från presentkod är sparade och används när passet slutar förnyas.
                  </Text>
                )}
                <TouchableOpacity style={p.manageBtn} onPress={handleManage}>
                  <Text style={p.manageBtnText}>Hantera medlemskap</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={p.card}>
                  <Text style={p.eyebrow}>VAD INGÅR</Text>
                  <View style={{ gap: 12 }}>
                    {PERKS.map((perk) => (
                      <View key={perk} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                        <View style={p.checkCircle}><Check size={11} color="#121212" strokeWidth={2.8} /></View>
                        <Text style={p.perkText}>{perk}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {productsLoading ? (
                  <ActivityIndicator color={GOLD} />
                ) : (
                  <>
                    <View style={p.card}>
                      <Text style={p.eyebrow}>VÄLJ PASS</Text>
                      <View style={{ gap: 10 }}>
                        {products.map((product) => {
                          const active = selected?.id === product.id;
                          return (
                            <TouchableOpacity
                              key={product.id}
                              style={[p.plan, active && p.planActive]}
                              activeOpacity={0.85}
                              onPress={() => setSelectedId(product.id)}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={p.planName}>{product.name}</Text>
                                {product.description ? <Text style={p.planDesc}>{product.description}</Text> : null}
                              </View>
                              <Text style={[p.planPrice, active && { color: GOLD }]}>{price(product)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {selected && (
                      <View style={p.priceCard}>
                        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                          <Text style={p.price}>{price(selected)}</Text>
                          <Text style={p.priceSub}>{selected.autoRenew ? "förnyas automatiskt" : "engångsköp"}</Text>
                        </View>
                        <TouchableOpacity style={p.ctaBtn} onPress={handlePurchase}>
                          <Crown size={16} color="#121212" strokeWidth={2.2} />
                          <Text style={p.ctaBtnText}>Aktivera Österlenpasset</Text>
                        </TouchableOpacity>
                        <Text style={p.priceFooter}>
                          {selected.autoRenew
                            ? "Passet förnyas automatiskt tills du avslutar det. Priset kan ändras; du får besked i förväg och kan avsluta innan ändringen börjar gälla. Du avslutar när du vill under Hantera medlemskap."
                            : "Engångsköp som inte förnyas. Priset gäller för hela perioden."}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            <TouchableOpacity style={p.codeLink} onPress={() => router.push("/settings/redeem" as any)}>
              <Ticket size={15} color={MUTED} strokeWidth={2} />
              <Text style={p.codeLinkText}>Har du en presentkod?</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const p = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, flex: 1 },
  body: { padding: 20, gap: 16, paddingBottom: 60, alignItems: "stretch" },

  cardVisualWrap: { alignItems: "center", position: "relative" },
  activeBadge: {
    position: "absolute", bottom: 12, right: "10%",
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: GOLD, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  activeBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#121212", letterSpacing: 1.5 },

  card: { backgroundColor: CARD, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: BORDER, gap: 10 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "rgba(197,160,89,0.75)", letterSpacing: 2, textTransform: "uppercase" },
  statusActive: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: GOLD },
  statusInactive: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG },
  statusSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, lineHeight: 19 },
  manageBtn: {
    marginTop: 4, height: 42, borderRadius: 12,
    backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  manageBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: GOLD },

  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
  },
  perkText: { fontFamily: "Inter_400Regular", fontSize: 14, color: FG, flex: 1, lineHeight: 20 },

  plan: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.03)",
  },
  planActive: { borderColor: "rgba(197,160,89,0.8)", backgroundColor: "rgba(197,160,89,0.08)" },
  planName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  planDesc: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 2 },
  planPrice: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: MUTED },

  priceCard: {
    backgroundColor: CARD, borderRadius: 22, padding: 24, borderWidth: 1,
    borderColor: "rgba(197,160,89,0.22)", gap: 10, alignItems: "center",
  },
  price: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 38, color: FG },
  priceSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 52, borderRadius: 14, backgroundColor: GOLD,
    width: "100%", marginTop: 6,
  },
  ctaBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#121212" },
  priceFooter: { fontFamily: "Inter_400Regular", fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 17 },

  codeLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  codeLinkText: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },
});
