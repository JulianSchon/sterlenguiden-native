/**
 * Inställningar › Österlenpasset
 * Shows current membership status + upsell or management CTA
 */
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Crown, Check, Star } from "lucide-react-native";
import Svg, { Defs, RadialGradient, Stop, Ellipse, Path, LinearGradient, Rect } from "react-native-svg";
import { useProfile } from "@/hooks/useProfile";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";

const PERKS = [
  "Exklusiva rabatter hos lokala partners",
  "Tidiga biljetter till populära events",
  "Tillgång till Mitt Österlen-reseparet",
  "Personliga rekommendationer",
  "Stöd till lokala företag och kulturen",
] as const;

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

export default function PassSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: profile } = useProfile();

  const isMember = !!(profile as any)?.is_member;
  const expiresAt = (profile as any)?.membership_expires_at as string | undefined;
  const safeTop = Math.max(insets.top, 44);

  const handlePurchase = () => {
    Alert.alert("Österlenpasset", "Betalningsflödet lanseras snart. Vi meddelar dig när det är klart!", [{ text: "OK" }]);
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
        {/* Card visual */}
        <View style={p.cardVisualWrap}>
          <GoldMiniCard />
          {isMember && (
            <View style={p.activeBadge}>
              <Crown size={13} color="#121212" strokeWidth={2.2} />
              <Text style={p.activeBadgeText}>AKTIVT</Text>
            </View>
          )}
        </View>

        {/* Status section */}
        <View style={p.card}>
          <Text style={p.eyebrow}>STATUS</Text>
          {isMember ? (
            <>
              <Text style={p.statusActive}>Ditt kort är aktivt</Text>
              {expiresAt && (
                <Text style={p.statusSub}>
                  Förnyas {new Date(expiresAt).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })}
                </Text>
              )}
              <TouchableOpacity style={p.manageBtn}>
                <Text style={p.manageBtnText}>Hantera prenumeration</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={p.statusInactive}>Inget aktivt kort</Text>
              <Text style={p.statusSub}>Få tillgång till exklusiva erbjudanden och upplevelser på Österlen.</Text>
            </>
          )}
        </View>

        {/* Perks */}
        {!isMember && (
          <View style={p.card}>
            <Text style={p.eyebrow}>VADDÅ INGÅR</Text>
            <View style={{ gap: 12 }}>
              {PERKS.map((perk) => (
                <View key={perk} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={p.checkCircle}><Check size={11} color="#121212" strokeWidth={2.8} /></View>
                  <Text style={p.perkText}>{perk}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Price + CTA */}
        {!isMember && (
          <View style={p.priceCard}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text style={p.price}>49 kr</Text>
              <Text style={p.priceSub}>/månad</Text>
            </View>
            <Text style={p.priceNote}>Avsluta när du vill. Inga bindningstider.</Text>
            <TouchableOpacity style={p.ctaBtn} onPress={handlePurchase}>
              <Crown size={16} color="#121212" strokeWidth={2.2} />
              <Text style={p.ctaBtnText}>Aktivera Österlenpasset</Text>
            </TouchableOpacity>
            <Text style={p.priceFooter}>Priser kan ändras. Faktureras månadsvis via Apple / Google.</Text>
          </View>
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

  priceCard: {
    backgroundColor: CARD, borderRadius: 22, padding: 24, borderWidth: 1,
    borderColor: "rgba(197,160,89,0.22)", gap: 10, alignItems: "center",
  },
  price: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 38, color: FG },
  priceSub: { fontFamily: "Inter_400Regular", fontSize: 16, color: MUTED },
  priceNote: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 52, borderRadius: 14, backgroundColor: GOLD,
    width: "100%", marginTop: 6,
  },
  ctaBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#121212" },
  priceFooter: { fontFamily: "Inter_400Regular", fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 17 },
});
