/**
 * Kortet som öppnas när man trycker på en skatt (lila nål) på kartan. Tre lägen:
 *  - hittad:   skatten i färg, datum och kuriosa
 *  - framme:   inom 75 m — "Håll in för att öppna" (samma knapp som incheckningen) öppnar
 *              skattkistan (TreasureReveal)
 *  - på väg:   "varmare, kallare" — avståndet live, en mätare som fylls ju närmare man kommer
 *              (kallt → varmt) och en liten puls i telefonen som tätnar på nära håll
 *
 * Avståndet räknas ur användarens live-position (kartan följer den redan). Pulsen går bara medan
 * kortet är öppet — inget i bakgrunden.
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, type LayoutChangeEvent } from "react-native";
import Reanimated, {
  Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useCollectibles, useCollected, type Collectible } from "@/hooks/useCollectibles";
import { fetchMyStanding, type LeaderboardEntry } from "@/hooks/useLeaderboard";
import { distanceMeters, formatDistance } from "@/lib/checkin";
import { STICKER_RADIUS_M } from "@/lib/stickers";
import { HoldToCheckIn } from "@/components/checkin/HoldToCheckIn";
import { StickerArt } from "./StickerArt";
import { TreasureReveal } from "./TreasureReveal";
import { cardIn, cardOut } from "@/components/map/PlaceCard";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.62)";
const PURPLE = "#A78BFA";
const GOLD = "#E9C46A";
/** Längre bort än så här står mätaren på noll */
const FAR_M = 1000;

/** "Varmare, kallare" i ord */
function warmth(d: number): string {
  if (d <= STICKER_RADIUS_M) return "Du är framme!";
  if (d <= 150) return "Varmt! Nästan framme";
  if (d <= 300) return "Varmare…";
  if (d <= FAR_M) return "Kallt — fortsätt mot nålen";
  return "Iskallt — skatten är långt bort";
}

export function StickerCard({
  collectible, collectedAt, userLoc, bottom, onClose, onLayout,
}: {
  collectible: Collectible;
  /** ISO-tid när skatten hittades, eller undefined om användaren inte har den */
  collectedAt: string | undefined;
  userLoc: { latitude: number; longitude: number } | null;
  bottom: number;
  onClose: () => void;
  /** Kartan behöver kortets höjd (Googles logga ska ligga ovanför kortet) */
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const router = useRouter();
  const { data: collectibles = [] } = useCollectibles();
  const { data: collected = new Map<string, string>() } = useCollected();
  const [revealing, setRevealing] = useState<{ haveBefore: number; loc: { latitude: number; longitude: number } } | null>(null);
  // Min rad i topplistan "Flest skatter" före — hämtas redan medan man håller knappen
  const standingBefore = useRef<Promise<LeaderboardEntry | null> | null>(null);
  const found = !!collectedAt;
  const distance = userLoc
    ? distanceMeters(userLoc.latitude, userLoc.longitude, collectible.lat, collectible.lng)
    : null;
  const near = distance != null && distance <= STICKER_RADIUS_M;
  const heat = distance == null ? 0 : Math.max(0, Math.min(1, 1 - (distance - STICKER_RADIUS_M) / (FAR_M - STICKER_RADIUS_M)));

  // Mätaren glider mot sitt nya läge när avståndet ändras
  const meter = useSharedValue(heat);
  useEffect(() => {
    meter.value = withTiming(heat, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [heat, meter]);

  // Pulsen: tätare ju närmare (var 2,5 s vid 300 m, var 0,7 s precis utanför) — och en tydlig
  // "framme"-vibration när man kommer innanför radien
  const wasNear = useRef(near);
  useEffect(() => {
    if (found || distance == null) return;
    if (near && !wasNear.current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    wasNear.current = near;
    if (near || distance > 300) return;
    const every = 700 + ((distance - STICKER_RADIUS_M) / (300 - STICKER_RADIUS_M)) * 1800;
    const id = setInterval(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), every);
    return () => clearInterval(id);
  }, [found, near, distance]);


  const meterStyle = useAnimatedStyle(() => ({
    width: `${Math.max(4, meter.value * 100)}%`,
    backgroundColor: interpolateColor(meter.value, [0, 0.5, 1], ["#5B8DEF", "#E9A23B", "#FF6A2B"]),
  }));

  return (
    <Reanimated.View entering={cardIn} exiting={cardOut} onLayout={onLayout} style={[s.card, { bottom }]}>
      <TouchableOpacity style={s.close} onPress={onClose} hitSlop={12}>
        <X size={18} color="rgba(255,255,255,0.6)" strokeWidth={2} />
      </TouchableOpacity>

      <View style={s.row}>
        <View style={s.art}>
          <StickerArt imagePath={collectible.imagePath} size={96} silhouette={!found} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>{found ? "DIN SKATT" : "SKATT"}</Text>
          <Text style={s.name} numberOfLines={2}>{collectible.name}</Text>
          {collectible.town ? <Text style={s.town}>{collectible.town}</Text> : null}
          {collectible.placeId != null && (
            <TouchableOpacity onPress={() => router.push(`/place/${collectible.placeId}` as any)} hitSlop={8}>
              <Text style={s.placeLink}>Visa platsen</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {found ? (
        <View style={s.body}>
          <Text style={s.foundAt}>Hittad {format(new Date(collectedAt!), "d MMMM yyyy", { locale: sv })}</Text>
          {collectible.description ? <Text style={s.description}>{collectible.description}</Text> : null}
        </View>
      ) : (
        <View style={s.body}>
          {distance == null ? (
            <Text style={s.hint}>Slå på platsåtkomst för att kunna hitta skatten.</Text>
          ) : (
            <>
              <View style={s.warmRow}>
                <Text style={[s.warmText, near && { color: GOLD }]}>{warmth(distance)}</Text>
                {!near && <Text style={s.distance}>{formatDistance(distance)}</Text>}
              </View>
              <View style={s.meterTrack}>
                <Reanimated.View style={[s.meterFill, meterStyle]} />
              </View>
            </>
          )}
          <Text style={s.safety}>Var uppmärksam på omgivningen och respektera privat mark.</Text>
          {near && userLoc ? (
            <HoldToCheckIn
              label="Håll in för att öppna"
              onStart={() => { standingBefore.current = fetchMyStanding("stickers").catch(() => null); }}
              onComplete={() => setRevealing({ haveBefore: collected.size, loc: userLoc })}
            />
          ) : (
            <View style={s.buttonOff}>
              <Text style={s.buttonOffText}>Gå inom {STICKER_RADIUS_M} m för att öppna</Text>
            </View>
          )}
        </View>
      )}

      {revealing && (
        <TreasureReveal
          collectible={collectible}
          userLoc={revealing.loc}
          total={collectibles.length}
          haveBefore={revealing.haveBefore}
          standingBefore={standingBefore.current ?? undefined}
          onNavigate={() => router.push("/mitt-osterlen" as any)}
          onClose={() => setRevealing(null)}
        />
      )}
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  card: {
    position: "absolute", left: 12, right: 12, borderRadius: 22, padding: 16,
    backgroundColor: "#121216", borderWidth: 0.5, borderColor: "rgba(167,139,250,0.45)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24,
  },
  close: { position: "absolute", top: 14, right: 14, zIndex: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  art: {
    width: 96, height: 96,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 6,
  },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.6, color: PURPLE },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: FG, marginTop: 4, paddingRight: 24 },
  town: { fontFamily: "Inter_400Regular", fontSize: 13.5, color: MUTED, marginTop: 2 },
  placeLink: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: PURPLE, marginTop: 6 },
  body: { marginTop: 14, gap: 10 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: MUTED },
  warmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  warmText: { fontFamily: "Inter_700Bold", fontSize: 15, color: FG },
  distance: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: FG, fontVariant: ["tabular-nums"] },
  meterTrack: { height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.10)", overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 5 },
  safety: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(245,241,232,0.45)" },
  buttonOff: { height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  buttonOffText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "rgba(255,255,255,0.45)" },
  foundAt: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: PURPLE },
  description: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: "rgba(245,241,232,0.85)" },
});
