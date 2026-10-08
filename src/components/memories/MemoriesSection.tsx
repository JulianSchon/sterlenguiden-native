/**
 * "Dina minnen" på Mitt Österlen: rad med senaste minnena, till boken och skapa nytt.
 *
 * Korten är Polaroidfoton, inte en kvadratisk bild+text-platta som Listor och platser redan
 * använder — ett minne ska läsas som en annan SORTS sak vid första ögonkastet, inte en till
 * variant av samma kort. Vit/krämfärgad ram, tjockare nedtill, titel+datum skrivet direkt på
 * den nedre remsan i Caveat (appens enda handstilston, medvetet reserverad hit) i stället för
 * som vanlig text under kortet.
 *
 * Tre detaljer till: korten ligger med en lätt, växlande lutning — som om de slängts ut på ett
 * bord, inte maskinellt uppradade; pappersramens EGEN kant (inte fotot i den) är sicksackad som
 * på gamla framkallade foton (klippta med en taggsax); och en halvgenomskinlig tejpbit (egen
 * lutning, egna rivna kortsidor) sitter ovanpå kortets överkant som om den klistrat fast det vid
 * bakgrunden. Alla taggiga/rivna kanter ritas som SVG-polygoner i stället för att försöka klippa
 * själva vyn, eftersom React Native inte har något CSS-liknande clip-path att tillgå rakt av.
 *
 * VIKTIGT (bugg rättad): sicksacken syntes inte först, för att kortets EGEN View hade samma
 * krämfärgade backgroundColor som SVG-polygonen rakt bakom den — polygonens taggiga urtag
 * avslöjade då bara en identiskt färgad rektangel bakom sig, inte något annorlunda. Kortets View
 * måste vara genomskinlig; det är ENDAST polygonen som får ge formen färg.
 *
 * Trycker man på ett minne gör det motstånd ett par gånger (som om tejpen håller emot), river
 * sig sen loss FRÅN BAKGRUNDEN — tejp och kort som EN enhet, inte kortet ensamt från en tejp
 * som ligger kvar — och trillar/tonar bort innan sidan öppnas. Respekterar Reduce Motion
 * (öppnar direkt utan animation då).
 */
import { useCallback, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import Reanimated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { ImageIcon } from "lucide-react-native";
import { useMemories, useSignedUrls, type Memory } from "@/hooks/useMemories";
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
// Tejpbiten lutar lite ANNORLUNDA än kortet den sitter på — annars ser den maskinellt
// centrerad ut i stället för som snabbt fasttejpad.
const TAPE_TILTS = [4, -3, 5, -4, 3, -5];

/** En rektangel som en SVG-polygon, med valfria kanter sicksackade (taggsax-klippta) och
 * resten raka. `edges` = [topp, höger, botten, vänster]. Vandrar runt alla fyra kanterna och
 * växlar — när en kant är taggig — mellan ytterlinjen och en punkt indragen `tooth` px, så det
 * blir en kontinuerlig taggig linje, inte bara hack i var och varannan punkt. Används både för
 * fotots egen kant (alla fyra sicksackade, som ett gammalt framkallat foto) och tejpbitens
 * kortsidor (bara kortsidorna rivna, långsidorna raka — som på riktig tejp). */
function tornRectPoints(w: number, h: number, tooth: number, segment: number, edges: [boolean, boolean, boolean, boolean]): string {
  const pts: string[] = [];
  const walk = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number, jagged: boolean) => {
    if (!jagged) { pts.push(`${x2.toFixed(1)},${y2.toFixed(1)}`); return; }
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
  walk(0, 0, w, 0, 0, 1, edges[0]);   // övre kanten, inåt = nedåt
  walk(w, 0, w, h, -1, 0, edges[1]);  // högra kanten, inåt = vänster
  walk(w, h, 0, h, 0, -1, edges[2]);  // nedre kanten, inåt = uppåt
  walk(0, h, 0, 0, 1, 0, edges[3]);   // vänstra kanten, inåt = höger
  return pts.join(" ");
}

// Samma mönster för alla kort (som en riktig taggsax ger ett jämnt, upprepat mönster) —
// beräknat en gång, inte per kort.
// Grundare tänder (3.5 -> 2), glesare (8 -> 15px mellan dem) — mindre taggigt, färre kurvor.
const ZIGZAG_POINTS = tornRectPoints(CARD_W, CARD_H, 2, 15, [true, true, true, true]);

// Tejpbiten: bara kortsidorna (vänster/höger) rivna, över- och underkant raka.
const TAPE_W = 72;
const TAPE_H = 26;
const TAPE_POINTS = tornRectPoints(TAPE_W, TAPE_H, 2.5, 6, [false, true, false, true]);

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
          {recent.map((m, i) => (
            <MemoryPolaroid
              key={m.id}
              memory={m}
              cover={urls[m.photoPaths[0]]}
              tilt={TILTS[i % TILTS.length]}
              tapeTilt={TAPE_TILTS[i % TAPE_TILTS.length]}
              onOpen={() => router.push(`/memories/${m.id}` as any)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function MemoryPolaroid({
  memory, cover, tilt, tapeTilt, onOpen,
}: { memory: Memory; cover: string | undefined; tilt: number; tapeTilt: number; onOpen: () => void }) {
  const reduceMotion = useReducedMotion();
  const [opening, setOpening] = useState(false);
  const rotate = useSharedValue(tilt);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  // Mitt Österlen stannar monterad bakom minnessidan (vanligt navigationsbeteende) — utan det
  // här skulle kortet komma tillbaka hopsvängt, nedfallet och genomskinligt efter att man gått
  // tillbaka, kvar i precis det läge det hade när animationen körde klart. Nollställ i stället
  // varje gång sidan får fokus igen.
  useFocusEffect(
    useCallback(() => {
      rotate.value = tilt;
      translateY.value = 0;
      opacity.value = 1;
      setOpening(false);
    }, [tilt])
  );

  function handlePress() {
    if (opening) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (reduceMotion) { onOpen(); return; }
    setOpening(true);

    // Gör motstånd ett par gånger (som om tejpen håller emot innan den släpper)...
    rotate.value = withSequence(
      withTiming(tilt + 9, { duration: 90, easing: Easing.out(Easing.quad) }),
      withTiming(tilt - 6, { duration: 110 }),
      withTiming(tilt + 3, { duration: 100 }),
      withTiming(tilt + 1, { duration: 70 }),
      // ...river sig sen loss från bakgrunden, hela biten (tejp+kort) tillsammans, och
      // fortsätter rotera ner i fallet
      withTiming(tilt + 60, { duration: 300, easing: Easing.in(Easing.cubic) })
    );
    const SWING_MS = 90 + 110 + 100 + 70;
    translateY.value = withDelay(SWING_MS, withTiming(90, { duration: 300, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(onOpen)();
    }));
    opacity.value = withDelay(SWING_MS + 40, withTiming(0, { duration: 260 }));
  }

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Pressable onPress={handlePress} style={s.cardTouchable}>
      {/* Tejp och kort i SAMMA animerade enhet nu — river man loss river man loss båda
          tillsammans, inte kortet ensamt från en tejp som ligger kvar. */}
      <Reanimated.View style={[s.unit, cardStyle]}>
        <View style={s.polaroid}>
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
            <Text style={s.captionTitle} numberOfLines={1}>{memory.title}</Text>
            <Text style={s.captionDate} numberOfLines={1}>{formatMemoryDate(memory.memoryDate)}</Text>
          </View>
        </View>

        {/* Sist i JSX = ovanpå kortet, precis som på riktigt. */}
        <View style={[s.tape, { transform: [{ rotate: `${tapeTilt}deg` }] }]}>
          <Svg width={TAPE_W} height={TAPE_H}>
            <Polygon points={TAPE_POINTS} fill="rgba(216,194,156,0.62)" />
          </Svg>
        </View>
      </Reanimated.View>
    </Pressable>
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
  // Extra luft runt om (padding, inte bara gap) så de lutande/sicksackade korten — och tejpbiten
  // som sticker upp ovanför kortets egen kant — aldrig klipps av radens egna kanter.
  row: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 10, gap: 20, marginTop: 10 },

  cardTouchable: { width: CARD_W, height: CARD_H },

  // Hela enheten som animerar: tejp + kort tillsammans, en enda rörelse. Skuggan ligger här,
  // inte på kortet ensamt — det är pappersbiten SOM HELHET som ska se ut att ligga ovanpå
  // bakgrunden.
  unit: {
    width: CARD_W, height: CARD_H,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  // Ramen: krämfärgat papper, tjockare nedtill än upptill/sidorna (det är den proportionen som
  // faktiskt läses som "Polaroid"). INGEN backgroundColor här — det är ENDAST SVG-polygonen
  // ovanpå som får ge formen färg, annars döljer en identiskt färgad rektangel bakom
  // polygonens taggiga urtag helt (se kommentaren högst upp — det var precis det som hände).
  polaroid: { width: CARD_W, height: CARD_H },
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

  // Centrerad ovanför kortets överkant, halvvägs utanpå — som att den tejpar fast kortet vid
  // bakgrunden bakom, inte vid något på själva kortet.
  tape: { position: "absolute", top: -TAPE_H * 0.55, left: (CARD_W - TAPE_W) / 2, zIndex: 1 },
});
