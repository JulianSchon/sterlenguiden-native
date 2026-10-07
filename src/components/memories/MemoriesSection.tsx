/**
 * "Dina minnen" på Mitt Österlen: rad med senaste minnena, till boken och skapa nytt.
 *
 * Korten är Polaroidfoton, inte en kvadratisk bild+text-platta som Listor och platser redan
 * använder — ett minne ska läsas som en annan SORTS sak vid första ögonkastet, inte en till
 * variant av samma kort. Vit/krämfärgad ram, tjockare nedtill, titel+datum skrivet direkt på
 * den nedre remsan i Caveat (appens enda handstilston, medvetet reserverad hit) i stället för
 * som vanlig text under kortet.
 *
 * Två detaljer till: korten ligger med en lätt, växlande lutning — som om de slängts ut på ett
 * bord, inte maskinellt uppradade — och ramens kant är sicksackad som på gamla framkallade foton
 * (klippta med en taggsax, inte en rak kant). Sicksacken ritas som en SVG-polygon bakom
 * foto+text i stället för att försöka klippa själva kortet, eftersom React Native inte har något
 * CSS-liknande clip-path att tillgå rakt av.
 */
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import Svg, { Polygon } from "react-native-svg";
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
const CARD_H = FRAME_PAD + PHOTO_SIZE + CAPTION_H;
const PAPER = "#F0E9D8";

// Lutningen växlar per kort (efter index) i stället för att vara slumpad — annars hoppar
// vinkeln vid varje omritning. Några mjuka, aldrig extrema vinklar.
const TILTS = [-3, 2, -4, 3, -2, 4];

/** Sicksackad rektangel som en SVG-polygon: vandrar runt alla fyra kanter och växlar mellan
 * den yttre linjen och en punkt indragen `tooth` px, så det blir en kontinuerlig taggig linje
 * (som en taggsax-klippt fotokant), inte bara hack i var och varannan sida. */
function zigzagRectPoints(w: number, h: number, tooth: number, segment: number): string {
  const pts: string[] = [];
  const walk = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const n = Math.max(4, Math.round(len / segment));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const inward = i % 2 === 1;
      const x = x1 + dx * t + (inward ? nx * tooth : 0);
      const y = y1 + dy * t + (inward ? ny * tooth : 0);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
  };
  walk(0, 0, w, 0, 0, 1);   // övre kanten, inåt = nedåt
  walk(w, 0, w, h, -1, 0);  // högra kanten, inåt = vänster
  walk(w, h, 0, h, 0, -1);  // nedre kanten, inåt = uppåt
  walk(0, h, 0, 0, 1, 0);   // vänstra kanten, inåt = höger
  return pts.join(" ");
}

// Samma mönster för alla kort (som en riktig taggsax ger ett jämnt, upprepat mönster) —
// beräknat en gång, inte per kort.
const ZIGZAG_POINTS = zigzagRectPoints(CARD_W, CARD_H, 3.5, 8);

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
          {recent.map((m, i) => {
            const cover = urls[m.photoPaths[0]];
            const tilt = TILTS[i % TILTS.length];
            return (
              <TouchableOpacity
                key={m.id}
                style={[s.polaroid, { transform: [{ rotate: `${tilt}deg` }] }]}
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  router.push(`/memories/${m.id}` as any);
                }}
              >
                <Svg width={CARD_W} height={CARD_H} style={StyleSheet.absoluteFill}>
                  <Polygon points={ZIGZAG_POINTS} fill={PAPER} />
                </Svg>
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
  // Extra luft runt om (padding, inte bara gap) så de lutande/sicksackade korten aldrig klipps
  // av radens egna kanter när de roterar lite utanför sin egen rektangel.
  row: { paddingHorizontal: 20, paddingVertical: 10, gap: 20, marginTop: 10 },

  // Ramen: krämfärgat papper, tjockare nedtill än upptill/sidorna (det är den proportionen som
  // faktiskt läses som "Polaroid") — bakgrundsfärgen sätts här OCH i SVG-polygonen ovanpå, så
  // skuggan (som följer rektangeln, inte sicksacken) aldrig visar fel färg i springorna.
  polaroid: {
    width: CARD_W, height: CARD_H, backgroundColor: PAPER,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  photoWrap: {
    position: "absolute", left: FRAME_PAD, top: FRAME_PAD, width: PHOTO_SIZE, height: PHOTO_SIZE,
    borderRadius: 2, overflow: "hidden", backgroundColor: "#000",
  },
  photo: { width: "100%", height: "100%" },
  noPhoto: { backgroundColor: "rgba(0,0,0,0.08)", alignItems: "center", justifyContent: "center" },
  caption: {
    position: "absolute", left: FRAME_PAD, right: FRAME_PAD, top: FRAME_PAD + PHOTO_SIZE, height: CAPTION_H,
    justifyContent: "center", paddingHorizontal: 2,
  },
  captionTitle: { fontFamily: "Caveat_700Bold", fontSize: 21, lineHeight: 22, color: "#2A2419" },
  captionDate: { fontFamily: "Caveat_600SemiBold", fontSize: 15, lineHeight: 16, color: "rgba(42,36,25,0.55)", marginTop: 1 },
});
