/**
 * Upplåsningen av en skatt: en stor skattkista man själv trycker upp. Byggd för att trappa upp
 * spänningen snabbt och sen smälla — inte ett jämnt tempo:
 *
 *  1. In (0,6 s): skärmen mörknar, kistan dundrar ner i mitten (stor, nästan skärmbredd) med en
 *     tung duns, en skakning av hela bilden och ett dammoln.
 *  2. Trycken (fyra): varje tryck får kistan att hoppa och skaka hårdare, ljus strålar ut ur
 *     springan under locket (mer för varje gång), "kameran" zoomar in, gnistor sprutar och
 *     vibrationen blir kraftigare. Mellan trycken darrar kistan och bultar som ett hjärta.
 *     Texten driver på: "Tryck på kistan!" → "Igen!" → "Mer!" → "Nästan…!"
 *  3. Smällen: kistan glöder vitt och skakar okontrollerat i en kvarts sekund — sen exploderar
 *     den: blixt över hela skärmen, locket skjuts av, konfetti över hela skärmen, strålkransen
 *     tänds, och skatten skjuter upp ur kistan, snurrar ett varv och landar stort.
 *  4. Snabbt efter: "Du hittade en skatt!", namnet, samlingens stapel och kuriosan.
 *  5. "Se i samlingen" (öppnar Mitt Österlen bakom den mörka bakgrunden, där skatten sen klistras
 *     in) eller "Fortsätt".
 *
 * Prestanda: inget tungt skapas i ett ögonblick då något rör sig. Bara kistan finns från start;
 * explosionens konfetti, skatten, dess glöd och texterna byggs medan kistan står still och väntar
 * på första trycket, och tonas sen bara fram. Vid utgången tonas innehållet först, sen tas allt
 * tungt bort bakom en stilla mörk yta, och först därefter tonas bakgrunden.
 *
 * Servern (collect_sticker, som själv kontrollerar avståndet) frågas direkt när kistan visas, så
 * svaret hinner komma medan man trycker. Har det inte kommit vid fjärde trycket fortsätter kistan
 * bulta tills det gör det. Säger servern nej slocknar kistan med ett besked.
 */
import { useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { stickerImageUrl, useCollectSticker, type Collectible } from "@/hooks/useCollectibles";
import { playSound } from "@/lib/sounds";
import { holdTrophyMoments } from "@/lib/trophyMoments";
import { addTreasureToPlace } from "@/lib/treasurePlacement";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { Confetti, FillBar, GOLD, GhostButton, GoldButton, GoldRays, Reveal } from "@/components/checkin/CelebrationFx";
import { ChestBase, ChestLid, CHEST_H, CHEST_SEAM_Y, CHEST_W } from "./TreasureChest";
import { StickerArt } from "./StickerArt";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.72)";
const TAPS = 4;
const HINTS = ["Tryck på kistan!", "Igen!", "Mer!", "Nästan…!"];
const SPARKS = ["#FFF1C1", "#F5D88A", "#E9C46A", "#FFFFFF"];
const DUST = ["#C9B38A", "#A88E62", "#E2D3B0"];
const BOOM_DELAY = 300;

const hit = (style: Haptics.ImpactFeedbackStyle) => Haptics.impactAsync(style).catch(() => {});

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
  const collect = useCollectSticker();
  const [taps, setTaps] = useState(0);
  const [found, setFound] = useState(false);
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Andra steget (explosionen, skatten, texterna) byggs först när kistan landat och står still
  const [armed, setArmed] = useState(false);
  // Utgången: allt tungt bort när innehållet tonats ut, så bakgrunden kan tonas mjukt
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  // Storlekar: kistan nästan skärmbredd, skatten lika stor när den landat
  const CHEST = Math.round(Math.min(width * 0.86, height * 0.44));
  const STICKER = Math.round(Math.min(width * 0.8, height * 0.36));
  const chestY = height * 0.42;
  const finalY = height * 0.33;
  const chestH = (CHEST * CHEST_H) / CHEST_W;
  const seamOffset = chestH * (CHEST_SEAM_Y / CHEST_H) - chestH / 2; // springan mot kistans mitt

  const backdrop = useSharedValue(0);
  const leave = useSharedValue(0);
  const chestIn = useSharedValue(0);
  const squash = useSharedValue(0);
  const jump = useSharedValue(0);
  const shake = useSharedValue(0);
  const tremble = useSharedValue(0);
  const zoom = useSharedValue(0);
  const screenShake = useSharedValue(0);
  const seam = useSharedValue(0);
  const hot = useSharedValue(0);
  const sparks = useSharedValue(0);
  const dust = useSharedValue(0);
  const lid = useSharedValue(0);
  const chestOut = useSharedValue(0);
  const rise = useSharedValue(0);
  const flash = useSharedValue(0);
  const rays = useSharedValue(0);
  const burst = useSharedValue(0);
  const glow = useSharedValue(0);
  const text = useSharedValue(0);
  const hint = useSharedValue(0);
  const landGlow = useSharedValue(0);

  // Utmaningsfirandet väntar medan kistan är öppen
  useEffect(() => holdTrophyMoments(), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const shakeScreen = (px: number) => {
    screenShake.value = withSequence(
      withTiming(px, { duration: 40 }), withTiming(-px * 0.8, { duration: 50 }),
      withTiming(px * 0.5, { duration: 50 }), withTiming(0, { duration: 60 }),
    );
  };
  const setTremble = (deg: number) => {
    cancelAnimation(tremble);
    tremble.value = deg === 0 ? withTiming(0, { duration: 80 }) : withRepeat(
      withSequence(withTiming(deg, { duration: 55 }), withTiming(-deg, { duration: 55 })), -1, true,
    );
  };

  // 1. In: kistan dundrar ner, och servern frågas direkt. Skattens bild förhämtas, så den är
  // laddad när kistan exploderar även om man trycker blixtsnabbt
  useEffect(() => {
    if (collectible.imagePath) Image.prefetch(stickerImageUrl(collectible.imagePath)).catch(() => {});
    backdrop.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
    chestIn.value = withDelay(120, withTiming(1, { duration: 380, easing: Easing.in(Easing.cubic) }));
    later(500, () => {
      hit(Haptics.ImpactFeedbackStyle.Heavy);
      shakeScreen(7);
      squash.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 280, easing: Easing.out(Easing.back(2.5)) }));
      dust.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
      glow.value = withTiming(0.2, { duration: 400 });
      rays.value = withTiming(0.12, { duration: 600 });
    });
    hint.value = withDelay(750, withTiming(1, { duration: 300 }));
    later(650, () => setArmed(true));
    collect
      .mutateAsync({ collectibleId: collectible.id, lat: userLoc.latitude, lng: userLoc.longitude })
      .then(() => {
        setFound(true);
        addTreasureToPlace(collectible.id);
      })
      .catch((e: Error) => {
        setError(e.message === "too_far"
          ? "Du är för långt bort. Gå lite närmare och försök igen."
          : "Det gick inte att öppna kistan. Försök igen.");
        setTremble(0);
        seam.value = withTiming(0, { duration: 300 });
        glow.value = withTiming(0, { duration: 300 });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Ett tryck: hopp, skak, gnistor (ljuset, zoomen och vibrationen sätts i tap)
  const punch = (n: number) => {
    jump.value = withSequence(withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 230, easing: Easing.in(Easing.quad) }));
    const deg = 4 + n * 3;
    shake.value = withSequence(
      withTiming(deg, { duration: 45 }), withTiming(-deg, { duration: 70 }),
      withTiming(deg * 0.6, { duration: 60 }), withTiming(-deg * 0.3, { duration: 55 }), withTiming(0, { duration: 60 }),
    );
    later(320, () => {
      squash.value = withSequence(withTiming(0.7, { duration: 60 }), withTiming(0, { duration: 240, easing: Easing.out(Easing.back(2)) }));
    });
    sparks.value = 0;
    sparks.value = withTiming(1, { duration: 800, easing: Easing.linear });
    if (n >= 3) shakeScreen(3 + n);
  };

  const tap = () => {
    if (opened || error || leaving || chestIn.value < 1 || taps >= TAPS) return;
    const n = taps + 1;
    setTaps(n);
    punch(n);
    seam.value = withTiming(n / TAPS, { duration: 220 });
    zoom.value = withTiming(n / TAPS, { duration: 320, easing: Easing.out(Easing.cubic) });
    glow.value = withTiming(0.2 + n * 0.15, { duration: 300 });
    rays.value = withTiming(0.12 + n * 0.1, { duration: 300 });
    setTremble(n * 0.7);
    hint.value = withSequence(withTiming(1.25, { duration: 90 }), withTiming(1, { duration: 200 }));
    hit(n === 1 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
    if (n >= 3) later(90, () => hit(Haptics.ImpactFeedbackStyle.Rigid));
    playSound("tick");
  };

  // Mellan trycken bultar kistan som ett hjärta (från andra trycket)
  useEffect(() => {
    if (taps < 2 || opened || error) return;
    const id = setInterval(() => hit(Haptics.ImpactFeedbackStyle.Soft), 650);
    return () => clearInterval(id);
  }, [taps, opened, error]);

  // 3. Smällen — när fjärde trycket gjorts OCH servern sagt ja; annars bultar kistan tills dess
  useEffect(() => {
    if (opened || error || taps < TAPS) return;
    if (!found) {
      const id = setInterval(() => { punch(TAPS); hit(Haptics.ImpactFeedbackStyle.Medium); }, 700);
      return () => clearInterval(id);
    }
    setOpened(true);
    // Uppbyggnad: vitglödande, okontrollerat skakande
    hot.value = withTiming(1, { duration: BOOM_DELAY, easing: Easing.in(Easing.quad) });
    setTremble(5);
    [0, 60, 120, 170, 215, 255].forEach((at, i) => later(at, () => hit(i < 3 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Rigid)));
    // BOOM
    later(BOOM_DELAY, () => {
      setTremble(0);
      hit(Haptics.ImpactFeedbackStyle.Heavy);
      playSound("milestone");
      shakeScreen(14);
    });
    later(BOOM_DELAY + 130, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}));
    flash.value = withDelay(BOOM_DELAY, withSequence(withTiming(1, { duration: 50 }), withTiming(0, { duration: 500 })));
    lid.value = withDelay(BOOM_DELAY, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    chestOut.value = withDelay(BOOM_DELAY + 120, withTiming(1, { duration: 550, easing: Easing.in(Easing.quad) }));
    burst.value = withDelay(BOOM_DELAY, withTiming(1, { duration: 1700, easing: Easing.linear }));
    rays.value = withDelay(BOOM_DELAY, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    glow.value = withDelay(BOOM_DELAY, withSequence(withTiming(1, { duration: 120 }), withTiming(0.65, { duration: 900 })));
    zoom.value = withDelay(BOOM_DELAY, withTiming(0, { duration: 500 }));
    hint.value = withTiming(0, { duration: 150 });
    rise.value = withDelay(BOOM_DELAY + 40, withTiming(1, { duration: 750, easing: Easing.out(Easing.back(1.4)) }));
    later(BOOM_DELAY + 790, () => hit(Haptics.ImpactFeedbackStyle.Medium));
    landGlow.value = withDelay(BOOM_DELAY + 700, withTiming(1, { duration: 500 }));
    text.value = withDelay(BOOM_DELAY + 700, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
    later(BOOM_DELAY + 1500, () => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taps, found, error, opened]);

  const exitTo = (toCollection: boolean) => {
    if (leaving) return;
    setLeaving(true);
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) });
    rays.value = withTiming(0, { duration: 260 });
    // Innehållet tonas ut (260 ms), sen tas allt tungt bort bakom den stilla mörka bakgrunden
    setTimeout(() => setCleared(true), 280);
    const fadeAt = toCollection ? 950 : 360;
    if (toCollection) setTimeout(onNavigate, 330);
    backdrop.value = withDelay(fadeAt, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
    setTimeout(onClose, fadeAt + 340);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 24 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.42 }));
  // "Kameran": inzoomning per tryck + skakning av hela bilden
  const stageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: screenShake.value }, { scale: 1 + zoom.value * 0.14 }],
  }));
  const chestStyle = useAnimatedStyle(() => ({
    opacity: interpolate(chestIn.value, [0, 0.25], [0, 1], "clamp") * (1 - chestOut.value),
    transform: [
      { translateY: interpolate(chestIn.value, [0, 1], [-height * 0.6, 0]) - jump.value * 22 + chestOut.value * height * 0.3 },
      { rotate: `${shake.value + tremble.value}deg` },
      { scaleX: 1 + squash.value * 0.08 },
      { scaleY: 1 - squash.value * 0.07 },
    ],
  }));
  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lid.value * height * 0.75 }, { translateX: lid.value * 60 }, { rotate: `${lid.value * 80}deg` }],
  }));
  const seamStyle = useAnimatedStyle(() => ({ opacity: Math.max(seam.value, hot.value) * (1 - lid.value) }));
  // Ljuset som strålar ut ur springan (bakom kistan)
  const beamsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, seam.value * 0.9 + hot.value) * (1 - chestOut.value) }));
  // Vitglöden över kistan precis före smällen
  const hotStyle = useAnimatedStyle(() => ({ opacity: hot.value * 0.55 * (1 - lid.value) }));
  const stickerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rise.value, [0, 0.1], [0, 1], "clamp"),
    transform: [
      { translateY: interpolate(rise.value, [0, 1], [chestY + seamOffset - finalY, 0]) },
      { scale: interpolate(rise.value, [0, 1], [0.2, 1]) },
      { rotate: `${interpolate(rise.value, [0, 1], [0, -360])}deg` },
    ],
  }));
  const landGlowStyle = useAnimatedStyle(() => ({ opacity: landGlow.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, hint.value), transform: [{ scale: Math.max(1, hint.value) }] }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateY: interpolate(text.value, [0, 1], [18, 0]) }],
  }));

  // Precis stor nog att nå skärmens hörn från kistan — en större SVG kostar bara mer att rita
  const raysSize = Math.hypot(width, height) * 1.05;
  const glowSize = width * 1.4;
  const bottomPad = Math.max(insets.bottom, 16) + 8;
  const showDescription = !!collectible.description && height >= 720;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => exitTo(false)}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        {!cleared && (<>
        {/* Strålkrans och glöd över hela skärmen */}
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          <View style={[s.anchor, { top: chestY - raysSize / 2, left: (width - raysSize) / 2, width: raysSize, height: raysSize }]}>
            <GoldRays size={raysSize} visible={rays} maxOpacity={0.55} />
          </View>
          <Reanimated.View style={[s.anchor, { top: chestY - glowSize / 2, left: (width - glowSize) / 2, width: glowSize, height: glowSize }, glowStyle]}>
            <RadialGlow size={glowSize} color={GOLD} opacity={0.4} radiusRatio={0.6} />
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.View style={[s.root, contentStyle]} pointerEvents={leaving ? "none" : "auto"}>
          <Pressable style={s.root} onPress={tap}>
            {/* Kistan, med kamerans zoom och skak */}
            <Reanimated.View style={[StyleSheet.absoluteFill, stageStyle]} pointerEvents="none">
              <View style={[s.anchor, { top: chestY - chestH / 2, left: (width - CHEST) / 2, width: CHEST, height: chestH }]}>
                {/* Ljuset ur springan, bakom kistan */}
                <Reanimated.View style={[s.anchor, { top: chestH / 2 + seamOffset - CHEST, left: -CHEST / 2, width: CHEST * 2, height: CHEST * 2 }, beamsStyle]}>
                  <GoldRays size={CHEST * 2} visible={seam} maxOpacity={0.9} />
                </Reanimated.View>
                <Reanimated.View style={[{ width: CHEST, height: chestH }, chestStyle]}>
                  <View style={StyleSheet.absoluteFill}><ChestBase size={CHEST} /></View>
                  <Reanimated.View style={[s.seam, { top: chestH / 2 + seamOffset - 4, left: CHEST * 0.1, width: CHEST * 0.8 }, seamStyle]} />
                  <Reanimated.View style={[StyleSheet.absoluteFill, lidStyle]}><ChestLid size={CHEST} /></Reanimated.View>
                  <Reanimated.View style={[s.anchor, { top: chestH / 2 + seamOffset - CHEST * 0.4, left: CHEST * 0.1, width: CHEST * 0.8, height: CHEST * 0.8 }, hotStyle]}>
                    <RadialGlow size={CHEST * 0.8} color="#FFF4D6" opacity={1} radiusRatio={0.6} />
                  </Reanimated.View>
                </Reanimated.View>
                <View style={[s.sparkOrigin, { top: chestH / 2 + seamOffset }]}>
                  <Confetti progress={sparks} count={14} power={0.7} durationS={0.8} colors={SPARKS} />
                </View>
                <View style={[s.sparkOrigin, { top: chestH * 0.86 }]}>
                  <Confetti progress={dust} count={14} power={0.35} durationS={0.7} colors={DUST} />
                </View>
              </View>
            </Reanimated.View>

            {/* Explosionen och skatten — byggs i förväg (armed), syns först vid smällen */}
            {armed && (<>
            <View style={[s.anchor, { top: chestY - 1, left: width / 2 - 1, width: 2, height: 2 }]} pointerEvents="none">
              <Confetti progress={burst} count={80} power={1.7} durationS={1.6} />
            </View>
            <Reanimated.View
              style={[s.anchor, { top: finalY - STICKER / 2, left: (width - STICKER) / 2, width: STICKER, height: STICKER }, stickerStyle]}
              pointerEvents="none"
            >
              <Reanimated.View style={[s.anchor, { width: STICKER, height: STICKER, top: 0, left: 0 }, landGlowStyle]}>
                <RadialGlow size={STICKER} color={GOLD} opacity={0.35} radiusRatio={0.75} />
              </Reanimated.View>
              {/* Renderas från start (osynlig) så bilden hunnit laddas när kistan exploderar */}
              <View style={{ transform: [{ rotate: "-4deg" }] }}>
                <StickerArt imagePath={collectible.imagePath} size={STICKER} silhouette={false} />
              </View>
            </Reanimated.View>

            </>)}

            {!error && (
              <View style={[s.below, { top: chestY + chestH / 2 + 18 }]} pointerEvents="none">
                <Reanimated.Text style={[s.hint, hintStyle]}>{HINTS[Math.min(taps, TAPS - 1)]}</Reanimated.Text>
              </View>
            )}
            {error && (
              <View style={[s.below, { top: chestY + chestH / 2 + 18 }]} pointerEvents="none">
                <Text style={s.error}>{error}</Text>
              </View>
            )}
            {armed && (
              <Reanimated.View style={[s.below, { top: finalY + STICKER / 2 + 10 }, textStyle]} pointerEvents="none">
                <Text style={s.eyebrow}>DU HITTADE EN SKATT!</Text>
                <Text style={s.name} numberOfLines={2}>{collectible.name}</Text>
                <View style={s.progress}>
                  <View style={s.progressTop}>
                    <Text style={s.progressLabel}>Österlens skatter</Text>
                    <Text style={s.progressCount}>{haveBefore + 1} av {total}</Text>
                  </View>
                  <FillBar from={haveBefore / Math.max(1, total)} to={(haveBefore + 1) / Math.max(1, total)} startAt={BOOM_DELAY + 950} durationMs={700} skip={false} play={opened} />
                </View>
                {showDescription ? <Text style={s.description} numberOfLines={3}>{collectible.description}</Text> : null}
              </Reanimated.View>
            )}
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
        </>)}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#0B0A08" },
  flash: { backgroundColor: "#FFF6DE" },
  anchor: { position: "absolute", alignItems: "center", justifyContent: "center" },
  seam: {
    position: "absolute", height: 8, borderRadius: 4, backgroundColor: "#FFE7A0",
    shadowColor: "#FFD36A", shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  sparkOrigin: { position: "absolute", left: 0, right: 0, height: 0 },
  below: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  hint: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: FG, textAlign: "center" },
  error: { fontFamily: "Inter_600SemiBold", fontSize: 15.5, color: "#F2A0A0", textAlign: "center" },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2.6, color: GOLD },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 28, color: FG, marginTop: 6, textAlign: "center" },
  progress: {
    alignSelf: "stretch", marginTop: 14, padding: 12, borderRadius: 14,
    backgroundColor: "#17171A", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  progressTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  progressLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: FG },
  progressCount: { fontFamily: "Montserrat_700Bold", fontSize: 14.5, color: GOLD },
  description: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: MUTED, textAlign: "center", marginTop: 12 },
  buttons: { paddingHorizontal: 20, gap: 10, justifyContent: "flex-end" },
});
