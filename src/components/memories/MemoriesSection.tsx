/** "Dina minnen" på Mitt Österlen: rad med senaste minnena, till boken och skapa nytt. */
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ImageIcon } from "lucide-react-native";
import { useMemories, useSignedUrls } from "@/hooks/useMemories";
import { formatMemoryDate } from "@/lib/memories";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const RECENT = 10;

export function MemoriesSection() {
  const router = useRouter();
  const { data: memories = [] } = useMemories();
  const recent = memories.slice(0, RECENT);
  const { data: urls = {} } = useSignedUrls(recent.map((m) => m.photoPaths[0]).filter(Boolean));

  return (
    <View style={s.section}>
      <View style={s.head}>
        <Text style={s.title}>Dina minnen</Text>
        <View style={s.actions}>
          {memories.length > 0 && (
            <TouchableOpacity onPress={() => router.push("/memories" as any)} hitSlop={8}>
              <Text style={s.action}>Till boken</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push("/memories/edit" as any)} hitSlop={8}>
            <Text style={s.action}>+ Skapa minne</Text>
          </TouchableOpacity>
        </View>
      </View>

      {recent.length === 0 ? (
        <Text style={s.empty}>Varje plats du besöker kan bli en del av din egen berättelse.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {recent.map((m) => {
            const cover = urls[m.photoPaths[0]];
            return (
              <TouchableOpacity
                key={m.id}
                style={s.card}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  router.push(`/memories/${m.id}` as any);
                }}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={s.photo} resizeMode="cover" />
                ) : (
                  <View style={[s.photo, s.noPhoto]}>
                    <ImageIcon size={26} color="rgba(255,255,255,0.25)" strokeWidth={1.5} />
                  </View>
                )}
                <Text style={s.name} numberOfLines={1}>{m.title}</Text>
                <Text style={s.sub}>{formatMemoryDate(m.memoryDate)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 32 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16 },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG },
  actions: { flexDirection: "row", gap: 16 },
  action: { fontFamily: "Inter_500Medium", fontSize: 13, color: GOLD },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, lineHeight: 21, paddingHorizontal: 16, marginTop: 10 },
  row: { paddingHorizontal: 16, gap: 12, marginTop: 14 },
  card: { width: 150 },
  photo: { width: 150, height: 150, borderRadius: 16 },
  noPhoto: { backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG, marginTop: 8 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, marginTop: 1 },
});
