/**
 * Belöningsskärmen efter en lyckad incheckning: visitkort, eventuell ny
 * utmärkelse, nästa mål och ett tips om platsens erbjudanden.
 */
import { useEffect, useRef, useState } from "react";
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, StyleSheet, Animated, useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { Place } from "@/hooks/usePlaces";
import { useVisits } from "@/hooks/useVisits";
import { useOffers } from "@/hooks/useOffers";
import { useTrophies } from "@/hooks/useTrophies";
import { TrophyMedal } from "@/components/trophies/TrophyMedal";

const GOLD = "#C9A24C";
const GOLD_LT = "#E6C77A";
const FG = "#F5F1E8";

// Utmaningarna som faktiskt drivs av besök — det är dem man kan komma
// närmare genom att checka in. Övriga grupper (favoriter, svep, erbjudanden)
// påverkas inte av ett besök.
const VISIT_GROUPS = ["utforskaren", "mangsidig"];

export function CheckInReward({
  place, doneBefore, onClose,
}: {
  place: Place;
  /** Nycklar för troféer som redan var klara INNAN besöket, för att se vad som är nytt. */
  doneBefore: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const { trophies } = useTrophies();
  const { data: visits = [] } = useVisits();
  const { data: offers = [] } = useOffers(place.id);
  const [when] = useState(() => new Date());

  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
  }, []);

  const newlyUnlocked = trophies.filter((t) => t.done && !doneBefore.includes(t.key));
  const isRepeatVisit = visits.filter((v) => v.place_id === place.id).length > 1;

  // Närmast att klara bland de besöksdrivna utmaningarna
  const nextGoal = [...trophies]
    .filter((t) => VISIT_GROUPS.includes(t.groupId) && !t.done)
    .sort((a, b) => b.percent - a.percent)[0];

  const image =
    (place.image_url ?? "").split(",").map((u) => u.trim()).filter(Boolean)[0] ?? place.logo_url ?? null;
  const cardW = Math.min(360, winW - 32);
  const photoH = Math.round(cardW * 0.58);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Animated.View
          style={{
            width: cardW,
            opacity: enter,
            transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          }}
        >
          <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
            <View style={s.pill}>
              <Text style={s.pillText}>BESÖK REGISTRERAT</Text>
            </View>

            {/* Visitkort */}
            <View style={[s.visitCard, { height: photoH }]}>
              {image ? (
                <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "#242424" }]} />
              )}
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <SvgGrad id="visitFade" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="35%" stopColor="#000" stopOpacity={0} />
                    <Stop offset="100%" stopColor="#000" stopOpacity={0.82} />
                  </SvgGrad>
                </Defs>
                <SvgRect width="100%" height="100%" fill="url(#visitFade)" />
              </Svg>
              <View style={s.visitText}>
                <Text style={s.placeName} numberOfLines={2}>{place.name}</Text>
                <Text style={s.placeMeta} numberOfLines={1}>
                  {[place.nearest_town, format(when, "d MMMM yyyy 'kl.' HH:mm", { locale: sv })]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            </View>

            {isRepeatVisit && (
              <Text style={s.repeat}>Välkommen tillbaka! Besöket är sparat i din historik.</Text>
            )}

            {/* Ny utmärkelse — eller nästa mål */}
            {newlyUnlocked.length > 0 ? (
              <View style={s.block}>
                <Text style={s.blockTitle}>{newlyUnlocked.length === 1 ? "NY UTMÄRKELSE" : "NYA UTMÄRKELSER"}</Text>
                <View style={s.medalRow}>
                  {newlyUnlocked.slice(0, 3).map((t) => (
                    <View key={t.key} style={s.medalItem}>
                      <TrophyMedal size={110} tier={t.tier} Icon={t.Icon} unlocked groupId={t.groupId} />
                      <Text style={s.medalName} numberOfLines={1}>{t.identity}</Text>
                      <Text style={s.medalLevel} numberOfLines={1}>{t.levelName}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : nextGoal ? (
              <View style={s.block}>
                <Text style={s.blockTitle}>NÄSTA MÅL</Text>
                <View style={s.goalRow}>
                  <TrophyMedal size={64} tier={nextGoal.tier} Icon={nextGoal.Icon} unlocked={false} groupId={nextGoal.groupId} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.goalName}>{nextGoal.identity} · {nextGoal.levelName}</Text>
                    <Text style={s.goalReq}>{nextGoal.requirementText}</Text>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${Math.max(4, nextGoal.percent)}%` }]} />
                    </View>
                    <Text style={s.goalLeft}>{nextGoal.target - nextGoal.progress} kvar</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Tips om platsens erbjudanden */}
            {offers.length > 0 && (
              <TouchableOpacity
                style={s.offerRow}
                activeOpacity={0.8}
                onPress={() => { onClose(); router.push("/offers" as any); }}
              >
                <Text style={s.offerText}>
                  {offers.length === 1 ? "Platsen har 1 aktivt erbjudande" : `Platsen har ${offers.length} aktiva erbjudanden`}
                </Text>
                <ChevronRight size={18} color={GOLD_LT} strokeWidth={2} />
              </TouchableOpacity>
            )}

            {/* Minnen byggs i ett senare steg — visas som inaktiv så layouten syns */}
            <View style={s.memoryBtn}>
              <Text style={s.memoryText}>Skapa minne</Text>
              <Text style={s.memorySoon}>Kommer snart</Text>
            </View>

            <TouchableOpacity style={s.doneBtn} activeOpacity={0.85} onPress={onClose}>
              <Text style={s.doneText}>Klar</Text>
            </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: "#1A1A1D", borderRadius: 24, padding: 16,
    borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)",
  },
  pill: {
    alignSelf: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginBottom: 12,
    backgroundColor: "rgba(212,168,79,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.50)",
  },
  pillText: { fontFamily: "Inter_600SemiBold", fontSize: 10.5, color: GOLD_LT, letterSpacing: 1.8 },
  visitCard: { borderRadius: 18, overflow: "hidden", justifyContent: "flex-end", backgroundColor: "#242424" },
  visitText: { padding: 14 },
  placeName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 21, color: "#fff" },
  placeMeta: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.72)", marginTop: 3 },
  repeat: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.65)",
    textAlign: "center", marginTop: 12,
  },
  block: { marginTop: 16 },
  blockTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: GOLD_LT, letterSpacing: 1.8,
    textAlign: "center", marginBottom: 10,
  },
  medalRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  medalItem: { alignItems: "center", flex: 1 },
  medalName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: FG, marginTop: 10, textAlign: "center" },
  medalLevel: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginTop: 2, textAlign: "center" },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  goalName: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: FG },
  goalReq: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 8, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: GOLD },
  goalLeft: { fontFamily: "Inter_500Medium", fontSize: 12, color: GOLD_LT, marginTop: 5 },
  offerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
    backgroundColor: "rgba(212,168,79,0.10)", borderWidth: 1, borderColor: "rgba(197,160,89,0.35)",
  },
  offerText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: GOLD_LT },
  memoryBtn: {
    marginTop: 16, paddingVertical: 13, borderRadius: 14, alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  memoryText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: "rgba(255,255,255,0.35)" },
  memorySoon: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 2 },
  doneBtn: { marginTop: 12, paddingVertical: 15, borderRadius: 14, alignItems: "center", backgroundColor: GOLD },
  doneText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#121212" },
});
