/**
 * Upplåsningen av en skatt: en skattkista man själv trycker upp.
 *
 *  1. Kistan faller ner i mitten med en duns. "Tryck på kistan för att öppna den."
 *  2. Varje tryck skakar kistan (mer för varje gång), guldljuset läcker ut genom springan under
 *     locket, gnistor sprutar och vibrationen blir kraftigare (lätt → medel → kraftig).
 *  3. Fjärde trycket: locket sprängs av, blixt över hela skärmen, strålkransen tänds, konfetti —
 *     och skatten svävar upp ur kistan, snurrar ett varv och landar stort, lite snett, som ett
 *     riktigt klistermärke.
 *  4. "Du hittade en skatt!", namnet, samlingens stapel (2 → 3 av 24) och kuriosan.
 *  5. "Se i samlingen" (öppnar Mitt Österlen bakom den mörka bakgrunden, där skatten sen klistras
 *     in) eller "Fortsätt".
 *
 * Servern (collect_sticker, som själv kontrollerar avståndet) frågas direkt när kistan visas, så
 * svaret hinner komma medan man trycker. Har det inte kommit vid fjärde trycket fortsätter kistan
 * skaka av sig själv tills det gör det. Säger servern nej tonar kistan bort med ett besked.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/hooks/useAuth";
import { useCollectSticker, type Collectible } from "@/hooks/useCollectibles";
import { playSound } from "@/lib/sounds";
import { holdTrophyMoments } from "@/lib/trophyMoments";
import { addTreasureToPlace } from "@/lib/treasurePlacement";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { Confetti, FillBar, GOLD, GhostButton, GoldButton, GoldRays, Reveal } from "@/components/checkin/CelebrationFx";
import { ChestBase, ChestLid, CHEST_H, CHEST_SEAM_Y, CHEST_W } from "./TreasureChest";
import { StickerArt } from "./StickerArt";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.7)";
const TAPS = 4;
const CHEST = 200;
const STICKER = 220;
const TAP_HAPTICS = [
  Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium,
  Haptics.ImpactFeedbackStyle.Heavy, Haptics.ImpactFeedbackStyle.Heavy,
];
const SPARKS = ["#FFF1C1", "#F5D88A", "#E9C46A", "#FFFFFF"];

export function TreasureReveal({
  collectible, userLoc, total, haveBefore, onNavigate, onClose,
}: {
  collectible: Collectible;
  userLoc: { latitude: number; longitude: number };
  /** Antal skatter totalt, och hur många man hade innan den här */
  total: number;
  haveBefore: number;
  /** Öppna samlingen — anropas medan upplåsningen fortfarande täcker skärmen */
  onNavigate: () => void;
  /** Upplåsningen har tonat ut helt */
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const collect = useCollectSticker();
  const [taps, setTaps] = useState(0);
  const [found, setFound] = useState(false);
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  const backdrop = useSharedValue(0);
  const leave = useSharedValue(0);
  const chestIn = useSharedValue(0);
  const shake = useSharedValue(0);
  const bump = useSharedValue(0);
  const seam = useSharedValue(0);
  const sparks = useSharedValue(0);
  const hint = useSharedValue(0);
  const lid = useSharedValue(0);
  const chestOut = useSharedValue(0);
  const rise = useSharedValue(0);
  const flash = useSharedValue(0);
  const rays = useSharedValue(0);
  const burst = useSharedValue(0);
  const glow = useSharedValue(0);
  const text = useSharedValue(0);

  // Utmaningsfirandet väntar medan kistan är öppen
  useEffect(() => holdTrophyMoments(), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Kistan faller ner, och servern frågas direkt
  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    chestIn.value = withDelay(150, withTiming(1, { duration: 420, easing: Easing.in(Easing.quad) }));
    later(570, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}));
    bump.value = withDelay(570, withSequence(withTiming(-0.6, { duration: 80 }), withTiming(0, { duration: 260, easing: Easing.out(Easing.back(2)) })));
    hint.value = withDelay(900, withTiming(1, { duration: 400 }));
    collect
      .mutateAsync({ collectibleId: collectible.id, lat: userLoc.latitude, lng: userLoc.longitude })
      .then(() => {
        setFound(true);
        if (user) addTreasureToPlace(user.id, collectible.id);
      })
      .catch((e: Error) => {
        setError(e.message === "too_far"
          ? "Du är för långt bort. Gå lite närmare och försök igen."
          : "Det gick inte att öppna kistan. Försök igen.");
        hint.value = withTiming(0, { duration: 200 });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ett tryck: skaka, mer ljus genom springan, gnistor, kraftigare vibration
  const shakeOnce = (strength: number) => {
    const deg = 3 + strength * 2.5;
    shake.value = withSequence(
      withTiming(deg, { duration: 45 }), withTiming(-deg, { duration: 70 }),
      withTiming(deg * 0.6, { duration: 60 }), withTiming(-deg * 0.3, { duration: 55 }), withTiming(0, { duration: 60 }),
    );
    bump.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) }));
    sparks.value = 0;
    sparks.value = withTiming(1, { duration: 700, easing: Easing.linear });
  };

  const tap = () => {
    if (opened || error || leaving || chestIn.value < 1) return;
    const n = Math.min(taps + 1, TAPS);
    setTaps(n);
    shakeOnce(n);
    seam.value = withTiming(n / TAPS, { duration: 200 });
    hint.value = withTiming(0, { duration: 200 });
    Haptics.impactAsync(TAP_HAPTICS[n - 1]).catch(() => {});
    playSound("tick");
  };

  // Öppna när fjärde trycket gjorts OCH servern sagt ja — annars skakar kistan av sig själv tills dess
  useEffect(() => {
    if (opened || error || taps < TAPS) return;
    if (!found) {
      const id = setInterval(() => {
        shakeOnce(TAPS);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }, 650);
      return () => clearInterval(id);
    }
    setOpened(true);
    const t0 = 160;
    later(t0, () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      playSound("milestone");
    });
    later(t0 + 130, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}));
    lid.value = withDelay(t0, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    flash.value = withDelay(t0, withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 400 })));
    rays.value = withDelay(t0, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    burst.value = withDelay(t0, withTiming(1, { duration: 1400, easing: Easing.linear }));
    glow.value = withDelay(t0, withSequence(withTiming(1, { duration: 140 }), withTiming(0.6, { duration: 900 })));
    rise.value = withDelay(t0 + 80, withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) }));
    chestOut.value = withDelay(t0 + 450, withTiming(1, { duration: 500, easing: Easing.in(Easing.quad) }));
    text.value = withDelay(t0 + 900, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    later(t0 + 2300, () => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taps, found, error, opened]);

  const exitTo = (toCollection: boolean) => {
    if (leaving) return;
    setLeaving(true);
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) });
    rays.value = withTiming(0, { duration: 260 });
    const fadeAt = toCollection ? 900 : 140;
    if (toCollection) setTimeout(onNavigate, 300);
    backdrop.value = withDelay(fadeAt, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
    setTimeout(onClose, fadeAt + 340);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 24 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: Math.max(glow.value, seam.value * 0.35) }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.2 }));
  const chestStyle = useAnimatedStyle(() => ({
    opacity: interpolate(chestIn.value, [0, 0.3], [0, 1], "clamp") * (1 - chestOut.value),
    transform: [
      { translateY: interpolate(chestIn.value, [0, 1], [-height * 0.4, 0]) + chestOut.value * 90 },
      { rotate: `${shake.value}deg` },
      { scaleX: 1 + bump.value * 0.05 },
      { scaleY: 1 - bump.value * 0.04 },
    ],
  }));
  const lidStyle = useAnimatedStyle(() => ({
    opacity: 1 - interpolate(lid.value, [0.6, 1], [0, 1], "clamp"),
    transform: [{ translateY: -lid.value * 170 }, { translateX: lid.value * 40 }, { rotate: `${lid.value * 38}deg` }],
  }));
  // Ljuset i springan mellan lock och botten — starkare för varje tryck
  const seamStyle = useAnimatedStyle(() => ({ opacity: seam.value * (1 - lid.value) }));
  const stickerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rise.value, [0, 0.15], [0, 1], "clamp"),
    transform: [
      { translateY: interpolate(rise.value, [0, 1], [CHEST * 0.15, -CHEST * 0.05]) },
      { scale: interpolate(rise.value, [0, 0.7, 1], [0.25, 1.08, 1]) },
      { rotate: `${interpolate(rise.value, [0, 1], [0, -366])}deg` },
    ],
  }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateY: interpolate(text.value, [0, 1], [16, 0]) }],
  }));

  const raysSize = width * 1.9;
  const glowSize = width * 1.2;
  const centerY = height * 0.34;
  const chestH = (CHEST * CHEST_H) / CHEST_W;
  const seamY = (CHEST * CHEST_SEAM_Y) / CHEST_W;
  const bottomPad = Math.max(insets.bottom, 16) + 8;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => exitTo(false)}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          <View style={[s.anchor, { top: centerY - raysSize / 2, left: (width - raysSize) / 2, width: raysSize, height: raysSize }]}>
            <GoldRays size={raysSize} visible={rays} />
          </View>
          <Reanimated.View style={[s.anchor, { top: centerY - glowSize / 2, left: (width - glowSize) / 2, width: glowSize, height: glowSize }, glowStyle]}>
            <RadialGlow size={glowSize} color={GOLD} opacity={0.36} radiusRatio={0.55} />
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.View style={[s.root, contentStyle]} pointerEvents={leaving ? "none" : "auto"}>
          <Pressable style={s.root} onPress={tap}>
            {/* Kistan och skatten, centrerade kring samma punkt */}
            <View style={[s.anchor, { top: centerY - STICKER / 2, left: (width - STICKER) / 2, width: STICKER, height: STICKER }]} pointerEvents="none">
              <Reanimated.View style={[{ width: CHEST, height: chestH, marginTop: STICKER * 0.06 }, chestStyle]}>
                <View style={StyleSheet.absoluteFill}><ChestBase size={CHEST} /></View>
                <Reanimated.View style={[s.seam, { top: seamY - 3, left: CHEST * 0.08, width: CHEST * 0.84 }, seamStyle]} />
                <Reanimated.View style={[StyleSheet.absoluteFill, lidStyle]}><ChestLid size={CHEST} /></Reanimated.View>
                <View style={s.sparkOrigin}>
                  <Confetti progress={sparks} count={10} power={0.45} durationS={0.7} colors={SPARKS} />
                </View>
              </Reanimated.View>
              <Reanimated.View style={[StyleSheet.absoluteFill, s.center, stickerStyle]}>
                {/* Renderas från start (osynlig) så bilden hunnit laddas när locket flyger av */}
                <StickerArt imagePath={collectible.imagePath} size={STICKER} silhouette={false} />
              </Reanimated.View>
              <View style={[StyleSheet.absoluteFill, s.center]}>
                <Confetti progress={burst} count={40} power={1.15} />
              </View>
            </View>

            <View style={[s.below, { top: centerY + STICKER / 2 + 12 }]} pointerEvents="none">
              {!opened && !error && (
                <Reanimated.Text style={[s.hint, hintStyle]}>Tryck på kistan för att öppna den</Reanimated.Text>
              )}
              {error && <Text style={s.error}>{error}</Text>}
              <Reanimated.View style={[s.texts, textStyle]}>
                <Text style={s.eyebrow}>DU HITTADE EN SKATT!</Text>
                <Text style={s.name} numberOfLines={2}>{collectible.name}</Text>
                <View style={s.progress}>
                  <View style={s.progressTop}>
                    <Text style={s.progressLabel}>Österlens skatter</Text>
                    <Text style={s.progressCount}>{haveBefore + 1} av {total}</Text>
                  </View>
                  {opened && (
                    <FillBar from={haveBefore / Math.max(1, total)} to={(haveBefore + 1) / Math.max(1, total)} startAt={1350} durationMs={900} skip={false} />
                  )}
                </View>
                {collectible.description ? <Text style={s.description} numberOfLines={4}>{collectible.description}</Text> : null}
              </Reanimated.View>
            </View>
          </Pressable>

          <View style={[s.buttons, { height: 118 + bottomPad, paddingBottom: bottomPad }]}>
            {ready && (
              <>
                <Reveal show>
                  <GoldButton label="Se i samlingen" onPress={() => exitTo(true)} />
                </Reveal>
                <Reveal show delay={100}>
                  <GhostButton label="Fortsätt" onPress={() => exitTo(false)} />
                </Reveal>
              </>
            )}
            {error && (
              <Reveal show>
                <GhostButton label="Stäng" onPress={() => exitTo(false)} />
              </Reveal>
            )}
          </View>
        </Reanimated.View>

        <Reanimated.View style={[StyleSheet.absoluteFill, s.flash, flashStyle]} pointerEvents="none" />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#0B0A08" },
  flash: { backgroundColor: "#FFF6DE" },
  anchor: { position: "absolute", alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  seam: {
    position: "absolute", height: 6, borderRadius: 3, backgroundColor: "#FFE7A0",
    shadowColor: "#FFD36A", shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  sparkOrigin: { position: "absolute", left: 0, right: 0, top: "45%", height: 0 },
  below: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  hint: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: MUTED, textAlign: "center", marginTop: 8 },
  error: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#F2A0A0", textAlign: "center", marginTop: 8 },
  texts: { alignItems: "center", alignSelf: "stretch" },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2.6, color: GOLD },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 28, color: FG, marginTop: 6, textAlign: "center" },
  progress: {
    alignSelf: "stretch", marginTop: 16, padding: 12, borderRadius: 14,
    backgroundColor: "#17171A", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  progressTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  progressLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
  progressCount: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: GOLD },
  description: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: MUTED, textAlign: "center", marginTop: 12 },
  buttons: { paddingHorizontal: 20, gap: 10, justifyContent: "flex-end" },
});
