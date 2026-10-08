/**
 * Ett minne: foton (med helskärmsvisning), berättelse, platser och vilka som var med.
 *
 * Försättsfotot är en stor, stillastående Polaroid — samma papper/tejp/taggsax-kant som
 * förhandsvisningskortet i Mitt Österlen (delad geometri, se src/lib/polaroid.ts), bara i mycket
 * större skala. Ingen lutning och ingen rivanimation här: det är startsidan för läsning, inte ett
 * kort i en rad man bläddrar förbi, så den ska vara lugn och lätt att vila ögonen på. Titel och
 * datum är skrivna direkt på Polaroidens bildtext (Caveat, samma handstilston som kortet) i
 * stället för som en egen rubrikrad under — Polaroiden ÄR rubriken nu. Berättelsetexten är
 * medvetet INTE i Caveat: en hel brödtext i handstil hade blivit tröttsam att läsa och spätt ut
 * fontens särskilda, avgränsade roll i appen.
 */
import { useMemo, useState } from "react";
import {
  View, Text, Image, ScrollView, FlatList, Modal, TouchableOpacity, Alert, ActivityIndicator,
  useWindowDimensions, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, X, MapPin } from "lucide-react-native";
import Svg, { Polygon } from "react-native-svg";
import { usePlaces } from "@/hooks/usePlaces";
import { useMemory, useSignedUrls, useDeleteMemory } from "@/hooks/useMemories";
import { formatMemoryDate } from "@/lib/memories";
import { POLAROID_PAPER, POLAROID_TAPE, tornRectPoints } from "@/lib/polaroid";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

const HERO_MARGIN = 24;
const HERO_FRAME_PAD = 14;
const HERO_CAPTION_H = 96;
const HERO_TAPE_W = 110;
const HERO_TAPE_H = 34;
// Ingen cyklande lutning som på förhandsvisningskortraden — bara EN fast, svag lutning på
// tejpen, så den känns fasttejpad utan att hela försättsfotot lutar (det skulle störa läsningen).
const HERO_TAPE_TILT = -3;

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

  // Beror på skärmbredden, så omräknad här i stället för vid modulladdning (som det mindre,
  // fasta förhandsvisningskortet gör) — annars samma taggsax-geometri, bara skalad upp.
  const heroW = width - HERO_MARGIN * 2;
  const heroPhotoSize = heroW - HERO_FRAME_PAD * 2;
  const heroH = HERO_FRAME_PAD + heroPhotoSize + HERO_CAPTION_H;
  const heroZigzag = useMemo(() => tornRectPoints(heroW, heroH, 4, 26, [true, true, true, true]), [heroW, heroH]);
  const heroTapePoints = useMemo(() => tornRectPoints(HERO_TAPE_W, HERO_TAPE_H, 4, 9, [false, true, false, true]), []);

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
          {!photos[0] && (
            // Ett minne kan sparas helt utan foto (titeln räcker för att kunna spara, se
            // app/memories/edit.tsx) — då finns ingen Polaroid att skriva titeln på, så den
            // visas i stället som vanlig text här.
            <View style={s.fallbackHeader}>
              <Text style={s.fallbackDate}>{formatMemoryDate(memory.memoryDate).toUpperCase()}</Text>
              <Text style={s.fallbackTitle}>{memory.title}</Text>
            </View>
          )}
          {photos[0] && (
            <View style={s.heroOuter}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setLightbox(0)} style={[s.heroUnit, { width: heroW, height: heroH }]}>
                <View style={{ width: heroW, height: heroH }}>
                  <Svg width={heroW} height={heroH} style={StyleSheet.absoluteFill}>
                    <Polygon points={heroZigzag} fill={POLAROID_PAPER} />
                  </Svg>
                  <View style={[s.heroPhotoWrap, { left: HERO_FRAME_PAD, top: HERO_FRAME_PAD, width: heroPhotoSize, height: heroPhotoSize }]}>
                    <Image source={{ uri: photos[0] }} style={s.heroPhoto} resizeMode="cover" />
                  </View>
                  <View style={[s.heroCaption, { left: HERO_FRAME_PAD, right: HERO_FRAME_PAD, top: HERO_FRAME_PAD + heroPhotoSize, height: HERO_CAPTION_H }]}>
                    <Text style={s.heroCaptionTitle} numberOfLines={2}>{memory.title}</Text>
                    <Text style={s.heroCaptionDate}>{formatMemoryDate(memory.memoryDate)}</Text>
                  </View>
                </View>
                <View style={[s.heroTape, { left: (heroW - HERO_TAPE_W) / 2, transform: [{ rotate: `${HERO_TAPE_TILT}deg` }] }]}>
                  <Svg width={HERO_TAPE_W} height={HERO_TAPE_H}>
                    <Polygon points={heroTapePoints} fill={POLAROID_TAPE} />
                  </Svg>
                </View>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ padding: 16 }}>
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

  // Försättsfotots egen Polaroid-ram — samma material som förhandsvisningskortet
  // (src/lib/polaroid.ts), bara i stor, stillastående skala. Se kommentaren högst upp i filen.
  heroOuter: { alignItems: "center", paddingHorizontal: HERO_MARGIN, paddingTop: 18 },
  heroUnit: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 12, elevation: 6,
  },
  heroPhotoWrap: {
    position: "absolute", borderRadius: 3, overflow: "hidden", backgroundColor: "#000",
  },
  heroPhoto: { width: "100%", height: "100%" },
  heroCaption: { position: "absolute", justifyContent: "center", paddingHorizontal: 2 },
  heroCaptionTitle: { fontFamily: "Caveat_700Bold", fontSize: 30, lineHeight: 32, color: "#2A2419" },
  heroCaptionDate: { fontFamily: "Caveat_600SemiBold", fontSize: 19, lineHeight: 20, color: "rgba(42,36,25,0.55)", marginTop: 2 },
  // Centrerad ovanför Polaroidens överkant, halvvägs utanpå — samma idé som kortets egen tejp.
  heroTape: { position: "absolute", top: -HERO_TAPE_H * 0.55, zIndex: 1 },

  fallbackHeader: { paddingHorizontal: 16, paddingTop: 18 },
  fallbackDate: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 1.4, color: GOLD },
  fallbackTitle: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: FG, marginTop: 6 },

  story: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 24, color: "rgba(245,241,232,0.85)" },
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
