/**
 * "Dina minnen" på Mitt Österlen: rad med senaste minnena, till boken och skapa nytt.
 *
 * Korten är Polaroidfoton, inte en kvadratisk bild+text-platta som Listor och platser redan
 * använder — ett minne ska läsas som en annan SORTS sak vid första ögonkastet, inte en till
 * variant av samma kort. Vit/krämfärgad ram, tjockare nedtill, titel+datum skrivet direkt på
 * den nedre remsan i Caveat (appens enda handstilston, medvetet reserverad hit) i stället för
 * som vanlig text under kortet. Ingen tilt/spridning i den här raden — den ska gå lätt att
 * scanna i en horisontell rad; en spridd, lite snedvriden layout passar bättre inne i själva
 * "boken" (hela minnesarkivet), en separat sak för en annan gång.
 */
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

const CARD_W = 150;
const FRAME_PAD = 8;
const CAPTION_H = 52;
const PHOTO_SIZE = CARD_W - FRAME_PAD * 2;

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
                style={s.polaroid}
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  router.push(`/memories/${m.id}` as any);
                }}
              >
                <View style={s.photoWrap}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={s.photo} resizeMode="cover" />
                  ) : (
                    <View style={[s.photo, s.noPhoto]}>
                      <ImageIcon size={26} color="rgba(0,0,0,0.2)" strokeWidth={1.5} />
                    </View>
                  )}
                </View>
                <View style={s.caption}>
                  <Text style={s.captionTitle} numberOfLines={1}>{m.title}</Text>
                  <Text style={s.captionDate} numberOfLines={1}>{formatMemoryDate(m.memoryDate)}</Text>
                </View>
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
  // Playfair bort — bara för personnamn i appen numera, sektionsrubriker delar Montserrat
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: FG },
  actions: { flexDirection: "row", gap: 16 },
  action: { fontFamily: "Inter_500Medium", fontSize: 13, color: GOLD },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, lineHeight: 21, paddingHorizontal: 16, marginTop: 10 },
  row: { paddingHorizontal: 16, gap: 16, marginTop: 14 },

  // Polaroidramen: krämfärgat papper, tjockare nedtill än upptill/sidorna — den proportionen är
  // det som faktiskt läses som "Polaroid", inte bara en vit kant runt om.
  polaroid: {
    width: CARD_W, backgroundColor: "#F0E9D8", borderRadius: 3,
    paddingHorizontal: FRAME_PAD, paddingTop: FRAME_PAD,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  photoWrap: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 2, overflow: "hidden", backgroundColor: "#000" },
  photo: { width: "100%", height: "100%" },
  noPhoto: { backgroundColor: "rgba(0,0,0,0.08)", alignItems: "center", justifyContent: "center" },
  caption: { height: CAPTION_H, justifyContent: "center", paddingHorizontal: 2 },
  captionTitle: { fontFamily: "Caveat_700Bold", fontSize: 21, lineHeight: 22, color: "#2A2419" },
  captionDate: { fontFamily: "Caveat_600SemiBold", fontSize: 15, lineHeight: 16, color: "rgba(42,36,25,0.55)", marginTop: 1 },
});
