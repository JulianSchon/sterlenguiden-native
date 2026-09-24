/**
 * Mitt Österlen — streak överst, sedan samlarobjekt, listor och minnen
 * (de tre sista byggs i senare steg).
 *
 * TILLFÄLLIGT: siffran nedan är en hårdkodad demo tills streak-datan
 * (tabellen app_days) finns. Sidan finns nu för att testa elden.
 */
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import { StreakFlame } from "@/components/streak/StreakFlame";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";

const DEMO_STREAK = 12;

export default function MittOsterlenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
      >
        <View style={{ paddingTop: insets.top }}>
          <View style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <ArrowLeft size={24} color={FG} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={s.title}>Mitt Österlen</Text>
          </View>
        </View>

        <View style={s.hero}>
          <StreakFlame size={260} />
          <View style={s.numberWrap}>
            {/* Mörkt, mjukt sken bakom siffran så den syns mot elden. Tonar ut
                till helt transparent långt innan ytans kant — ingen synlig ruta. */}
            <Canvas style={s.scrim} pointerEvents="none">
              <Group origin={vec(170, 110)} transform={[{ scaleY: 0.6 }]}>
                <Circle cx={170} cy={110} r={100}>
                  <RadialGradient
                    c={vec(170, 110)}
                    r={100}
                    colors={["rgba(0,0,0,0.75)", "rgba(0,0,0,0.4)", "rgba(0,0,0,0)"]}
                    positions={[0, 0.5, 1]}
                  />
                </Circle>
              </Group>
            </Canvas>
            <Text style={s.number}>{DEMO_STREAK}</Text>
          </View>
          <Text style={s.label}>Dagars streak</Text>
          <Text style={s.hint}>Öppna appen varje dag</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 72, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG },
  hero: { alignItems: "center", paddingTop: 8 },
  // Siffran sitter över eldens nedre del, som på Whoop
  numberWrap: { marginTop: -84, width: 340, height: 100, alignItems: "center", justifyContent: "center" },
  scrim: { position: "absolute", left: 0, top: -60, width: 340, height: 220 },
  number: { fontFamily: "Inter_700Bold", fontSize: 92, color: "#FFFFFF", lineHeight: 100 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 24, color: FG, marginTop: 20 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED, marginTop: 6 },
});
