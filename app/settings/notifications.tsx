/**
 * Inställningar › Notiser
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Bell, CalendarDays, Tag } from "lucide-react-native";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";

const NOTIF_ITEMS = [
  { id: "events",   Icon: CalendarDays, title: "Nya event",     sub: "Få notis när ett nytt evenemang publiceras i din region." },
  { id: "offers",   Icon: Tag,          title: "Erbjudanden",   sub: "Exklusiva deals och rabatter från Österlenpasset-partners." },
  { id: "system",   Icon: Bell,         title: "Systemnyheter", sub: "Uppdateringar och viktiga meddelanden från oss." },
] as const;

export default function NotificationsSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [prefs, setPrefs] = useState({ events: true, offers: true, system: true });

  const safeTop = Math.max(insets.top, 44);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[n.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={n.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={n.headerTitle}>Notiser</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={n.body}>
        <View style={n.card}>
          {NOTIF_ITEMS.map(({ id, Icon, title, sub }, i) => (
            <View
              key={id}
              style={[n.row, i > 0 && { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }]}
            >
              <View style={n.iconTile}>
                <Icon size={17} color={GOLD} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={n.rowTitle}>{title}</Text>
                <Text style={n.rowSub} numberOfLines={2}>{sub}</Text>
              </View>
              <Switch
                value={prefs[id]}
                onValueChange={(v) => setPrefs((p) => ({ ...p, [id]: v }))}
                trackColor={{ false: "rgba(255,255,255,0.12)", true: "rgba(197,160,89,0.55)" }}
                thumbColor={prefs[id] ? GOLD : "rgba(255,255,255,0.5)"}
              />
            </View>
          ))}
        </View>
        <Text style={n.footNote}>
          Notiser kräver att du godkänt dem i enhetens systeminställningar. Hantera tillstånd under Inställningar → Österlenguiden.
        </Text>
      </ScrollView>
    </View>
  );
}

const n = StyleSheet.create({
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
  body: { padding: 20, gap: 16, paddingBottom: 60 },
  card: { backgroundColor: CARD, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: BORDER },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 16, paddingHorizontal: 20, gap: 14 },
  iconTile: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(197,160,89,0.10)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.20)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  rowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, lineHeight: 17 },
  footNote: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, lineHeight: 18, paddingHorizontal: 4 },
});
