/**
 * Inställningar › Om appen
 */
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Globe, Shield, FileText, Heart } from "lucide-react-native";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";

const VERSION = "1.0.0 (1)";

const LINKS = [
  { id: "web",      Icon: Globe,    label: "Webbplats",        url: "https://osterlenguiden.se"                 },
  { id: "privacy",  Icon: Shield,   label: "Integritetspolicy", url: "https://osterlenguiden.se/privacy"         },
  { id: "terms",    Icon: FileText, label: "Användarvillkor",   url: "https://osterlenguiden.se/terms"           },
  { id: "made",     Icon: Heart,    label: "Gjord med kärlek i Skåne", url: null                                },
] as const;

export default function AboutSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const safeTop = Math.max(insets.top, 44);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[ab.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={ab.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={ab.headerTitle}>Om appen</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ab.body}>
        {/* Logo area */}
        <View style={ab.logoCard}>
          <View style={ab.logoCircle}>
            <Text style={ab.logoText}>Ö</Text>
          </View>
          <Text style={ab.appName}>Österlenguiden</Text>
          <Text style={ab.appVersion}>Version {VERSION}</Text>
        </View>

        {/* Links */}
        <View style={ab.card}>
          {LINKS.map(({ id, Icon, label, url }, i) => (
            <TouchableOpacity
              key={id}
              style={[ab.row, i > 0 && { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }]}
              onPress={() => url && Linking.openURL(url)}
              disabled={!url}
            >
              <View style={ab.iconTile}><Icon size={16} color={GOLD} strokeWidth={1.6} /></View>
              <Text style={[ab.rowLabel, !url && { color: MUTED }]}>{label}</Text>
              {url && <ChevronRight size={15} color="rgba(255,255,255,0.25)" strokeWidth={2} />}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={ab.footer}>© 2025 Österlenguiden. Alla rättigheter förbehållna.</Text>
      </ScrollView>
    </View>
  );
}

const ab = StyleSheet.create({
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

  logoCard: {
    backgroundColor: CARD, borderRadius: 22, padding: 32,
    alignItems: "center", gap: 10, borderWidth: 1,
    borderColor: "rgba(197,160,89,0.18)",
  },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(197,160,89,0.12)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.30)",
    alignItems: "center", justifyContent: "center",
  },
  logoText: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 34, color: GOLD },
  appName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG, marginTop: 4 },
  appVersion: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },

  card: { backgroundColor: CARD, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: BORDER },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 16, paddingHorizontal: 20, gap: 14 },
  iconTile: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "rgba(197,160,89,0.10)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.18)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  rowLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: FG, flex: 1 },
  footer: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, textAlign: "center", paddingTop: 8 },
});
