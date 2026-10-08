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
import { ArrowLeft, X, MapPin, Plus, Pencil, Trash2 } from "lucide-react-native";
import Svg, { Polygon, Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import { usePlaces, firstImageUrl } from "@/hooks/usePlaces";
import { useMemory, useSignedUrls, useDeleteMemory } from "@/hooks/useMemories";
import { formatMemoryDate } from "@/lib/memories";
import { POLAROID_PAPER, POLAROID_TAPE, tornRectPoints } from "@/lib/polaroid";
import { PressableScale } from "@/components/PressableScale";

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
  // Stora bilder i en vertikal rad (scrolla neråt) i stället för en 3-kolumners rutnät med
  // tummar — samma breddmarginal som textspalten ovanför, så det läses som en sammanhängande
  // sida, inte ett separat bildgalleri.
  const galleryW = width - 32;
  const galleryH = galleryW * 0.9;

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
        {/* "Redigera" bort härifrån — ligger nu i åtgärdslistan längst ner på sidan tillsammans
            med Radera, i stället för att delas upp på två olika ställen. Titeln är dock kvar
            (annars står man utan ledtext alls längst upp) — en rad, trunkerad med "…" om den
            är för lång för att få plats, precis som vilken app-header som helst hanterar det. */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          {memory && <Text style={s.headerTitle} numberOfLines={1} ellipsizeMode="tail">{memory.title}</Text>}
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
            {memory.story ? (
              <View>
                {/* "Om dagen" hade varit naturligt, men ett minne kan spänna över mer än en
                    enskild dag — en mer generell rubrik i stället. */}
                <Text style={s.sectionLabel}>OM MINNET</Text>
                <Text style={s.story}>{memory.story}</Text>
              </View>
            ) : null}

            {/* Varje namn i en egen ruta i stället för en kommaseparerad lista — annars läses
                det bara som en lång uppräkning, inte som att var och en faktiskt var med. */}
            {memory.people.length > 0 && (
              <View style={{ marginTop: memory.story ? 24 : 0 }}>
                <Text style={s.sectionLabel}>VILKA VAR MED</Text>
                <View style={s.peopleRow}>
                  {memory.people.map((name) => (
                    <View key={name} style={s.personPill}>
                      <Text style={s.personPillText}>{name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {photos.length > 1 && (
            <>
              <View style={{ paddingHorizontal: 16, marginTop: 28 }}>
                <Text style={s.sectionLabel}>BILDER</Text>
              </View>
              <View style={s.gallery}>
                {photos.slice(1).map((uri, i) => (
                  <TouchableOpacity key={uri} onPress={() => setLightbox(i + 1)} activeOpacity={0.92}>
                    <Image source={{ uri }} style={{ width: galleryW, height: galleryH, borderRadius: 16 }} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Platser flyttade hit, under bilderna — stora kort med platsens egen bild och namnet
              skrivet direkt i bilden (med en mörk fade nedtill så texten alltid går att läsa,
              oavsett hur ljust fotot är), i stället för en liten textpill ovanför bilderna. */}
          {memoryPlaces.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginTop: 28 }}>
              <Text style={s.sectionLabel}>PLATSER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.placesRow}>
                {memoryPlaces.map((p) => (
                  <MemoryPlaceCard key={p.id} place={p} onPress={() => router.push(`/place/${p.id}` as any)} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Mer att göra härifrån, i stället för en ensam "Ta bort"-rad längst ner — samma
              rad-stil som listornas ⋮-meny (ikon i en cirkel + etikett). */}
          <View style={s.actions}>
            <Text style={s.sectionLabel}>MER</Text>
            <View style={{ gap: 8 }}>
              <ActionRow icon={<Plus size={18} color={FG} strokeWidth={2} />} label="Skapa nytt minne" onPress={() => router.push("/memories/edit" as any)} />
              {memoryPlaces.length > 0 && (
                <ActionRow
                  icon={<MapPin size={18} color={FG} strokeWidth={2} />}
                  label="Visa plats på kartan"
                  onPress={() => router.push({ pathname: "/(tabs)/map", params: { place: String(memoryPlaces[0].id) } } as any)}
                />
              )}
              <ActionRow icon={<Pencil size={18} color={FG} strokeWidth={2} />} label="Redigera minne" onPress={() => router.push({ pathname: "/memories/edit", params: { id: memory.id } } as any)} />
              <ActionRow icon={<Trash2 size={18} color="#E57373" strokeWidth={2} />} label="Radera minne" danger onPress={confirmDelete} />
            </View>
          </View>

          <View style={s.footer}>
            <Image source={require("../../assets/Osterlenappen-logo.png")} style={s.footerLogo} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={s.footerTagline}>Dina minnen finns alltid kvar här.</Text>
          </View>
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

/** Ett platskort med platsens egen bild, namnet skrivet direkt i bilden över en mörk fade
 * nedtill (samma SVG-gradient-mönster som platskorten i app/category/[categoryId].tsx — en
 * riktig gradient, inte expo-linear-gradient, som inte är kompilerad i dev-clienten än). */
function MemoryPlaceCard({ place, onPress }: { place: { id: number; name: string; image_url: string | null }; onPress: () => void }) {
  const img = firstImageUrl(place.image_url);
  return (
    <TouchableOpacity style={s.placeCard} activeOpacity={0.85} onPress={onPress}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.placeImageEmpty]}>
          <MapPin size={26} color={GOLD} strokeWidth={2} />
        </View>
      )}
      {img && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
            <Defs>
              <SvgGrad id={`mpg${place.id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#000" stopOpacity={0} />
                <Stop offset="45%" stopColor="#000" stopOpacity={0.3} />
                <Stop offset="100%" stopColor="#000" stopOpacity={0.82} />
              </SvgGrad>
            </Defs>
            <SvgRect width="100%" height="100%" fill={`url(#mpg${place.id})`} />
          </Svg>
        </View>
      )}
      <View style={s.placeNameWrap}>
        <Text style={s.placeName} numberOfLines={2}>{place.name}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** Samma rad-stil som listornas ⋮-meny (ListOptionsSheet) — ikon i en cirkel + etikett — fast
 * inline på sidan i stället för i en sheet. */
function ActionRow({ icon, label, danger, onPress }: { icon: React.ReactNode; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <PressableScale style={s.actionRow} scale={0.98} onPress={onPress}>
      <View style={s.actionIconWrap}>{icon}</View>
      <Text style={[s.actionLabel, danger && { color: "#E57373" }]}>{label}</Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  // Vanlig (inte versal/Montserrat-rubrik-konvention) — det här är minnets EGEN titel, fritext
  // av varierande längd, inte en kort fast app-etikett som "NYTT MINNE".
  headerTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 16, color: FG },
  notFound: { fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED, textAlign: "center", marginTop: 40 },

  // Försättsfotots egen Polaroid-ram — samma material som förhandsvisningskortet
  // (src/lib/polaroid.ts), bara i stor, stillastående skala. Se kommentaren högst upp i filen.
  // paddingTop högre än man kanske tror — tejpen sticker upp ovanför Polaroidens egen kant (se
  // heroTape nedan), och behöver luft så den inte krockar med headern ovanför.
  heroOuter: { alignItems: "center", paddingHorizontal: HERO_MARGIN, paddingTop: 44 },
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

  // Samma etikett-konvention som "Nytt minne"-formuläret (app/memories/edit.tsx): liten,
  // dämpad, versal.
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, letterSpacing: 1.2, color: MUTED, marginBottom: 10 },

  // Platser: stora kort (namnet skrivs i bilden, se placeNameWrap/placeName), inte en liten
  // textpill ovanför bilderna.
  placesRow: { gap: 12 },
  placeCard: {
    width: 160, height: 160, borderRadius: 16, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  placeImageEmpty: { alignItems: "center", justifyContent: "center" },
  placeNameWrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12 },
  placeName: {
    fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff",
    textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  // Varje namn i en egen ruta i stället för en kommaseparerad lista.
  peopleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  personPill: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: "rgba(197,160,89,0.14)", borderWidth: 1, borderColor: "rgba(197,160,89,0.35)",
  },
  personPillText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },

  // Stora bilder i en vertikal rad i stället för ett rutnät av tummar.
  gallery: { paddingHorizontal: 16, marginTop: 4, gap: 14 },

  // Åtgärdslistan längst ner — samma rad-stil som listornas ⋮-meny.
  actions: { paddingHorizontal: 16, marginTop: 36 },
  actionRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  actionIconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  actionLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: FG },

  // Loggan längst ner — en liten, varm avslutning på sidan, inte en ny hero.
  footer: { alignItems: "center", gap: 8, marginTop: 44, paddingHorizontal: 32 },
  footerLogo: { width: 44, height: 50, opacity: 0.8 },
  footerTagline: { fontFamily: "Inter_500Medium", fontSize: 13, letterSpacing: 0.3, color: MUTED, textAlign: "center" },

  lightbox: { flex: 1, backgroundColor: "#000" },
  close: {
    position: "absolute", right: 16, width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
});
