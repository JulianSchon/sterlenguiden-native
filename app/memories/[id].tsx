/** Ett minne: foton (med helskärmsvisning), berättelse, platser och vilka som var med. */
import { useMemo, useState } from "react";
import {
  View, Text, Image, ScrollView, FlatList, Modal, TouchableOpacity, Alert, ActivityIndicator,
  useWindowDimensions, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, X, MapPin } from "lucide-react-native";
import { usePlaces } from "@/hooks/usePlaces";
import { useMemory, useSignedUrls, useDeleteMemory } from "@/hooks/useMemories";
import { formatMemoryDate } from "@/lib/memories";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { data: memory, isLoading } = useMemory(id);
  const { data: places = [] } = usePlaces();
  const { data: urls = {} } = useSignedUrls(memory?.photoPaths ?? []);
  const deleteMemory = useDeleteMemory();
  const [lightbox, setLightbox] = useState<number | null>(null);

  const photos = (memory?.photoPaths ?? []).map((p) => urls[p]).filter((u): u is string => !!u);
  const memoryPlaces = useMemo(
    () => (memory ? places.filter((p) => memory.placeIds.includes(p.id)) : []),
    [memory, places]
  );
  const tile = (width - 32 - 12) / 3;

  function confirmDelete() {
    if (!memory) return;
    Alert.alert("Ta bort minnet", "Minnet och dess foton tas bort för gott.", [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Ta bort", style: "destructive",
        onPress: async () => {
          await deleteMemory.mutateAsync(memory);
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {memory && (
            <TouchableOpacity onPress={() => router.push({ pathname: "/memories/edit", params: { id: memory.id } } as any)}>
              <Text style={s.headerAction}>Redigera</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={GOLD} />
      ) : !memory ? (
        <Text style={s.notFound}>Minnet finns inte längre.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 32 }}>
          {photos[0] && (
            <TouchableOpacity activeOpacity={0.9} onPress={() => setLightbox(0)}>
              <Image source={{ uri: photos[0] }} style={{ width, height: width * 0.75 }} resizeMode="cover" />
            </TouchableOpacity>
          )}

          <View style={{ padding: 16 }}>
            <Text style={s.date}>{formatMemoryDate(memory.memoryDate).toUpperCase()}</Text>
            <Text style={s.title}>{memory.title}</Text>

            {memory.story ? <Text style={s.story}>{memory.story}</Text> : null}

            {memoryPlaces.length > 0 && (
              <View style={s.chips}>
                {memoryPlaces.map((p) => (
                  <TouchableOpacity key={p.id} style={s.chip} onPress={() => router.push(`/place/${p.id}` as any)}>
                    <MapPin size={13} color={GOLD} strokeWidth={2} />
                    <Text style={s.chipText} numberOfLines={1}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {memory.people.length > 0 && (
              <Text style={s.people}>Med: {memory.people.join(", ")}</Text>
            )}
          </View>

          {photos.length > 1 && (
            <View style={s.grid}>
              {photos.slice(1).map((uri, i) => (
                <TouchableOpacity key={uri} onPress={() => setLightbox(i + 1)} activeOpacity={0.85}>
                  <Image source={{ uri }} style={{ width: tile, height: tile, borderRadius: 10 }} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.deleteBtn} onPress={confirmDelete}>
            <Text style={s.deleteText}>Ta bort minnet</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Helskärmsvisning: svep i sidled mellan fotona */}
      <Modal visible={lightbox !== null} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <View style={s.lightbox}>
          {lightbox !== null && (
            <FlatList
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={lightbox}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              keyExtractor={(uri) => uri}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width, height }} resizeMode="contain" />
              )}
            />
          )}
          <TouchableOpacity style={[s.close, { top: insets.top + 12 }]} onPress={() => setLightbox(null)}>
            <X size={26} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </Modal>
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
  headerAction: { fontFamily: "Inter_500Medium", fontSize: 14, color: GOLD },
  notFound: { fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED, textAlign: "center", marginTop: 40 },

  date: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 1.4, color: GOLD },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 28, color: FG, marginTop: 6 },
  story: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 24, color: "rgba(245,241,232,0.85)", marginTop: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: FG, flexShrink: 1 },
  people: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, marginTop: 16 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16 },
  deleteBtn: { alignItems: "center", marginTop: 40, paddingVertical: 14 },
  deleteText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#E57373" },

  lightbox: { flex: 1, backgroundColor: "#000" },
  close: {
    position: "absolute", right: 16, width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
});
