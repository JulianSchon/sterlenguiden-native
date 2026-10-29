/**
 * Kortet som öppnas när man trycker på en skatt (ett kryss) på kartan. Tre lägen:
 *  - hittad:   skatten i färg, datum och kuriosa
 *  - framme:   inom 75 m — "Håll in för att öppna" (samma knapp som incheckningen) öppnar
 *              skattkistan (TreasureReveal)
 *  - på väg:   "varmare, kallare" — avståndet live, en mätare som fylls ju närmare man kommer
 *              (kallt → varmt) och en liten puls i telefonen som tätnar på nära håll
 *
 * Avståndet räknas ur användarens live-position (kartan följer den redan). Pulsen går bara medan
 * kortet är öppet — inget i bakgrunden.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useCollectibles, useCollected, type Collectible } from "@/hooks/useCollectibles";
import { fetchMyStanding, type LeaderboardEntry } from "@/hooks/useLeaderboard";
import { distanceMeters, formatDistance } from "@/lib/checkin";
import { STICKER_RADIUS_M } from "@/lib/stickers";
import { HoldToCheckIn } from "@/components/checkin/HoldToCheckIn";
import { StickerArt } from "./StickerArt";
import { TreasureReveal } from "./TreasureReveal";
import { cardIn, cardOut } from "@/components/map/PlaceCard";
import i18n from "i18next";
import { formatDate } from "@/i18n/dates";
import { pushOnce } from "@/lib/navigateOnce";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.62)";
const PURPLE = "#A78BFA";
const GOLD = "#E9C46A";
/** Längre bort än så här står mätaren på noll */
const FAR_M = 1000;

/** "Varmare, kallare" i ord */
function warmth(d: number): string {
  if (d <= STICKER_RADIUS_M) return i18n.t("treasure.here");
  if (d <= 150) return i18n.t("treasure.warm");
  if (d <= 300) return i18n.t("treasure.warmer");
  if (d <= FAR_M) return i18n.t("treasure.cold");
  return i18n.t("treasure.iceCold");
}

function StickerCard({
  collectible, collectedAt, userLoc, onClose,
}: {
  collectible: Collectible;
  /** ISO-tid när skatten hittades, eller undefined om användaren inte har den */
  collectedAt: string | undefined;
  userLoc: { latitude: number; longitude: number } | null;
  onClose: () => void;
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
    <View style={s.card}>
      <TouchableOpacity style={s.close} onPress={onClose} hitSlop={12}>
        <X size={18} color="rgba(255,255,255,0.6)" strokeWidth={2} />
      </TouchableOpacity>

      <View style={s.row}>
        <View style={s.art}>
          <StickerArt imagePath={collectible.imagePath} size={96} silhouette={!found} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>{i18n.t(found ? "treasure.yours" : "treasure.treasure")}</Text>
          <Text style={s.name} numberOfLines={2}>{collectible.name}</Text>
          {collectible.town ? <Text style={s.town}>{collectible.town}</Text> : null}
          {collectible.placeId != null && (
            <TouchableOpacity onPress={() => pushOnce(router, `/place/${collectible.placeId}?from=map`)} hitSlop={8}>
              <Text style={s.placeLink}>{i18n.t("treasure.viewPlace")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {found && (
        <View style={s.body}>
          <Text style={s.foundAt}>{i18n.t("treasure.found", { date: formatDate(collectedAt!, "d MMMM yyyy") })}</Text>
          {collectible.description ? <Text style={s.description}>{collectible.description}</Text> : null}
        </View>
      )}

      {!found && (
        <View style={s.body}>
          {distance == null ? (
            <Text style={s.hint}>{i18n.t("treasure.needLocation")}</Text>
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
          <Text style={s.safety}>{i18n.t("treasure.safety")}</Text>
          {near && userLoc ? (
            <HoldToCheckIn
              label={i18n.t("treasure.hold")}
              onStart={() => { standingBefore.current = fetchMyStanding("stickers").catch(() => null); }}
              onComplete={() => setRevealing({ haveBefore: collected.size, loc: userLoc })}
            />
          ) : (
            <View style={s.buttonOff}>
              <Text style={s.buttonOffText}>{i18n.t("treasure.goWithin", { meters: STICKER_RADIUS_M })}</Text>
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
          onNavigate={() => pushOnce(router, "/mitt-osterlen")}
          onClose={() => setRevealing(null)}
        />
      )}
    </View>
  );
}

/**
 * Skattkorten, ett i taget: den öppnade skatten och de närmaste runt den. Svep åt sidan = nästa /
 * föregående (kortet följer fingret, glider ut, och nästa glider in från andra hållet). Varje kort
 * har sin egen höjd, och kartans nederkant (Googles logga) följer den. En pil i kanten som puttar
 * till ibland visar att det finns fler att svepa till.
 */
export function TreasureCards({
  treasures, index, bottom, userLoc, collected, onIndexChange, onClose, onHeight,
}: {
  treasures: Collectible[];
  index: number;
  bottom: number;
  userLoc: { latitude: number; longitude: number } | null;
  /** Skattens id → när den hittades */
  collected: Map<string, string>;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Kortets höjd (kartans nederkant och Googles logga följer den) */
  onHeight: (height: number) => void;
}) {
  const { width } = useWindowDimensions();
  const canPrev = index > 0;
  const canNext = index < treasures.length - 1;
  const treasure = treasures[index];

  const tx = useSharedValue(0);
  const stepDir = useRef<0 | 1 | -1>(0);
  const step = (dir: 1 | -1) => {
    stepDir.current = dir;
    Haptics.selectionAsync().catch(() => {});
    onIndexChange(index + dir);
  };
  // Nästa skatt glider in från andra hållet
  useLayoutEffect(() => {
    if (!stepDir.current) return;
    tx.value = stepDir.current * width * 0.6;
    tx.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
    stepDir.current = 0;
  }, [treasure?.id, tx, width]);
  const swipe = useMemo(() => Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const can = e.translationX < 0 ? canNext : canPrev;
      tx.value = can ? e.translationX : e.translationX * 0.25;
    })
    .onEnd((e) => {
      const dir = e.translationX < -60 && canNext ? 1 : e.translationX > 60 && canPrev ? -1 : 0;
      if (dir === 0) {
        tx.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        return;
      }
      tx.value = withTiming(-dir * width * 0.6, { duration: 150, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) runOnJS(step)(dir as 1 | -1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [canPrev, canNext, width, tx, index]);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: 1 - Math.min(0.6, Math.abs(tx.value) / width),
  }));

  if (!treasure) return null;
  return (
    <Reanimated.View
      entering={cardIn}
      exiting={cardOut}
      style={[s.cards, { bottom }]}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
    >
      <GestureDetector gesture={swipe}>
        <Reanimated.View style={cardStyle}>
          <StickerCard
            key={treasure.id}
            collectible={treasure}
            collectedAt={collected.get(treasure.id)}
            userLoc={userLoc}
            onClose={onClose}
          />
        </Reanimated.View>
      </GestureDetector>
      {canPrev && <SwipeHint side="left" />}
      {canNext && <SwipeHint side="right" />}
    </Reanimated.View>
  );
}

/** Pilen i kortets kant: puttar till åt sitt håll med jämna mellanrum, så man ser att det går att svepa */
function SwipeHint({ side }: { side: "left" | "right" }) {
  const nudge = useSharedValue(0);
  useEffect(() => {
    const out = { duration: 220, easing: Easing.out(Easing.quad) };
    nudge.value = withRepeat(
      withSequence(withDelay(2200, withTiming(1, out)), withTiming(0, { duration: 260 }), withTiming(1, out), withTiming(0, { duration: 260 })),
      -1,
      false,
    );
  }, [nudge]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value * (side === "right" ? 5 : -5) }] }));
  const Icon = side === "right" ? ChevronRight : ChevronLeft;
  return (
    <Reanimated.View pointerEvents="none" style={[s.swipeHint, side === "right" ? { right: -6 } : { left: -6 }, style]}>
      <Icon size={18} color={PURPLE} strokeWidth={2.6} />
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  cards: { position: "absolute", left: 12, right: 12 },
  swipeHint: {
    position: "absolute", top: "50%", marginTop: -16, width: 24, height: 32, borderRadius: 12,
    alignItems: "center", justifyContent: "center", backgroundColor: "#121216",
    borderWidth: 0.5, borderColor: "rgba(167,139,250,0.45)",
  },
  card: {
    borderRadius: 22, padding: 16,
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
