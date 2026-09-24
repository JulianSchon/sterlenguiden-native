/** Österlenboken: alla minnen, grupperade i säsongskapitel med nyast överst. */
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus, ImageIcon } from "lucide-react-native";
import { useMemories, useSignedUrls } from "@/hooks/useMemories";
import { formatMemoryDate, groupBySeason } from "@/lib/memories";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

export default function MemoriesBookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: memories = [], isLoading } = useMemories();
  const { data: urls = {} } = useSignedUrls(memories.map((m) => m.photoPaths[0]).filter(Boolean));
  const chapters = groupBySeason(memories);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.title}>Österlenboken</Text>
          <TouchableOpacity style={s.newBtn} onPress={() => router.push("/memories/edit" as any)}>
            <Plus size={22} color="#121212" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={GOLD} />
      ) : memories.length === 0 ? (
        <Text style={s.empty}>Inga minnen än. Tryck på + för att skapa det första.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 32 }}>
          {chapters.map((chapter) => (
            <View key={chapter.label}>
              <Text style={s.chapter}>{chapter.label}</Text>
              {chapter.items.map((m) => {
                const cover = urls[m.photoPaths[0]];
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={s.row}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/memories/${m.id}` as any)}
                  >
                    {cover ? (
                      <Image source={{ uri: cover }} style={s.cover} resizeMode="cover" />
                    ) : (
                      <View style={[s.cover, s.noCover]}>
                        <ImageIcon size={24} color="rgba(255,255,255,0.25)" strokeWidth={1.5} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.name} numberOfLines={2}>{m.title}</Text>
                      <Text style={s.sub}>
                        {formatMemoryDate(m.memoryDate)} · {m.photoPaths.length} foton
                        {m.placeIds.length > 0 ? ` · ${m.placeIds.length} platser` : ""}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  title: { flex: 1, fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG },
  newBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  empty: { fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED, textAlign: "center", marginTop: 40, paddingHorizontal: 32 },

  chapter: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG, paddingHorizontal: 16, marginTop: 28, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 8 },
  cover: { width: 88, height: 88, borderRadius: 14 },
  noCover: { backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: FG },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 4 },
});
