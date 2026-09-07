/**
 * Företagsportal – enkel placeholder tills vi bygger ut den
 */
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const GOLD = "#C5A059";
const BG   = "#0D0D0D";

export default function BusinessLoginScreen() {
  return (
    <View style={s.bg}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={s.safe}>

        {/* Topbar */}
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <View style={s.center}>
          <Text style={s.label}>FÖRETAGSPORTAL</Text>
          <Text style={s.title}>Kommer snart</Text>
          <Text style={s.body}>
            Logga in som företagspartner är under uppbyggnad.{"\n"}
            Kontakta oss på info@osterlenappen.se för tidig åtkomst.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={s.btn} activeOpacity={0.85}>
            <Text style={s.btnText}>← Tillbaka</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  bg:      { flex: 1, backgroundColor: BG },
  safe:    { flex: 1, paddingHorizontal: 28 },
  backBtn: { marginTop: 16, padding: 4, alignSelf: "flex-start" },
  center:  { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  label: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 3,
    color: GOLD,
    marginBottom: 4,
  },
  title: {
    fontFamily: "PlayfairDisplay_400Regular",
    fontSize: 36,
    color: "#fff",
    textAlign: "center",
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 22,
  },
  btn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  btnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
});
