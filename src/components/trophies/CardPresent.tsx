/**
 * Nytt kort: presenten när man fått ett belöningskort (Skattjägare, månadens/årets besökare).
 * Visas av belöningsvakten (TrophyHost) efter utmaningar och ringar — aldrig samtidigt. Samma
 * språk som skattkistan (TreasureReveal), men kortare: man har redan vunnit, det är bara att öppna.
 *
 *  1. In: skärmen mörknar och paketet dunsar ner i mitten, med en skakning och ett dammoln.
 *  2. Trycken (tre): paketet hoppar och skakar hårdare för varje tryck, ljus läcker ut under
 *     locket, "kameran" zoomar in och vibrationen blir kraftigare. Mellan trycken bultar det.
 *  3. Smällen: paketet glöder och skakar okontrollerat en kvarts sekund — blixt, locket flyger av,
 *     konfetti, strålkrans, och kortet (ditt eget medlemskort i den nya designen) skjuter upp ur
 *     paketet, kommer upp lutat och gungar på plats som skatten gör.
 *  4. "Nytt kort!", kortets namn och vad man gjorde för att få det.
 *  5. "Använd kortet" — sparar designen och öppnar Profil bakom den mörka bakgrunden, där kortet
 *     sen landar på sin plats (CardReveal) — eller "Fortsätt".
 *
 * Presenten räknas som öppnad (visas inte igen) i smällen. Ett tryck efter smällen spolar fram.
 *
 * Prestanda: allt (kortet, konfettin, knapparna) byggs medan skärmen mörknar, och paketet släpps
 * först när dess bilder laddats — annars föll ett osynligt paket och bilden dök upp efteråt.
 * Medlemskortet byggs EN gång, och efter smällen ritas ingenting om alls — knapparna, utgången och
 * spolningen styrs bara av animationsvärden och refs (varje omritning tappade bildrutor). Vid
 * utgången tas allt tungt bort först när innehållet tonats ut helt, och resten av utgången (Profil,
 * bakgrundens toning) startar först när det är gjort.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateProfile } from "@/hooks/useAccount";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { markCardSeen, rewardCardName, type RewardCard } from "@/hooks/useRewardCards";
import { useOnModalShown } from "@/hooks/useOnModalShown";
import { playSound } from "@/lib/sounds";
import { requestProfileReveal } from "@/lib/profileReveal";
import { formatDate } from "@/i18n/dates";
import { MemberCard, CARD_W, CARD_H } from "@/components/MemberCard";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { Confetti, GOLD, GhostButton, GoldButton, GoldRays } from "@/components/checkin/CelebrationFx";
import { PresentBase, PresentLid, PRESENT_H, PRESENT_SEAM_Y, PRESENT_W, prefetchPresentImages } from "./PresentBox";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.72)";
const TAPS = 3;
const HINTS = ["Tryck på paketet!", "Igen!", "Nästan…!"];
const SPARKS = ["#FFF1C1", "#F5D88A", "#E9C46A", "#FFFFFF"];
const DUST = ["#C9B38A", "#A88E62", "#E2D3B0"];
const BOOM_DELAY = 300;
// Paketet släpps tidigast så här länge efter att fönstret syns (allt hinner byggas bakom den mörknande skärmen)
const DROP_AT = 420;
const DROP_MS = 380;
const T_TEXT = 1000;
const T_READY = 2000;
/** Kortet kommer upp lutat och fjädrar på plats — samma rörelse som skatten ur kistan */
const TILT_START = -28;
const TILT_SPRING = { stiffness: 195, damping: 7.8, mass: 1 };

const hit = (style: Haptics.ImpactFeedbackStyle) => Haptics.impactAsync(style).catch(() => {});
const noop = () => {};

/** Hämtar presentens bilder (paketet, kortet) i förväg. Klar när alla hämtats — eller efter högst
 * några sekunder, så presenten aldrig fastnar på ett långsamt nät. */
export function prefetchCardPresent(card: RewardCard): Promise<void> {
  const jobs = [...prefetchPresentImages(), ...(card.imageUrl ? [Image.prefetch(card.imageUrl)] : [])];
  const all = Promise.all(jobs.map((job) => job.catch(() => false))).then(noop);
  return Promise.race([all, new Promise<void>((resolve) => setTimeout(resolve, 4000))]);
}

export function CardPresent({ card, onNavigate, onClose }: {
  card: RewardCard;
  /** Öppna Profil — anropas medan presenten fortfarande täcker skärmen */
  onNavigate: () => void;
  /** Presenten har tonat ut helt */
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const updateProfile = useUpdateProfile();
  const [taps, setTaps] = useState(0);
  // Utgången: allt tungt bort när innehållet tonats ut, så bakgrunden kan tonas mjukt
  const [cleared, setCleared] = useState(false);
  // Lägen som inte ska rita om något (se överst)
  const opened = useRef(false);
  const ready = useRef(false);
  const leaving = useRef(false);
  const skipped = useRef(false);
  const toProfile = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  // Storlekar: paketet stort i mitten, kortet nästan skärmbrett när det landat
  const PRESENT = Math.round(Math.min(width * 0.8, height * 0.4));
  const presentH = (PRESENT * PRESENT_H) / PRESENT_W;
  const presentY = height * 0.42;
  const seamOffset = presentH * (PRESENT_SEAM_Y / PRESENT_H) - presentH / 2; // springan mot paketets mitt
  const cardW = Math.min(width - 48, 380);
  const cardH = (cardW * CARD_H) / CARD_W;
  const finalY = height * 0.3;

  const backdrop = useSharedValue(0);
  const leave = useSharedValue(0);
  const presentIn = useSharedValue(0);
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
  const presentOut = useSharedValue(0);
  const rise = useSharedValue(0);
  const tilt = useSharedValue(TILT_START);
  const flash = useSharedValue(0);
  const rays = useSharedValue(0);
  const burst = useSharedValue(0);
  const glow = useSharedValue(0);
  const text = useSharedValue(0);
  const hint = useSharedValue(0);
  const buttons = useSharedValue(0);

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

  // 1. In: skärmen mörknar när fönstret faktiskt syns (se useOnModalShown). Paketet släpps när
  // fönstret syns OCH paketets två bilder laddats — tidigast DROP_AT efter att fönstret syntes.
  // (Laddas bilderna aldrig släpps det ändå efter en stund.)
  const shownAt = useRef<number | null>(null);
  const imagesLoaded = useRef(new Set<"lid" | "base">());
  const dropped = useRef(false);
  const landed = useRef(false);
  const dropWhenReady = () => {
    if (dropped.current || shownAt.current == null || imagesLoaded.current.size < 2) return;
    dropped.current = true;
    const dropAt = Math.max(0, DROP_AT - (Date.now() - shownAt.current));
    const landAt = dropAt + DROP_MS;
    presentIn.value = withDelay(dropAt, withTiming(1, { duration: DROP_MS, easing: Easing.in(Easing.cubic) }));
    // Landningen — allt det visuella på animationstråden, i exakt rätt bildruta
    later(landAt, () => hit(Haptics.ImpactFeedbackStyle.Heavy));
    screenShake.value = withDelay(landAt, withSequence(
      withTiming(6, { duration: 40 }), withTiming(-4.8, { duration: 50 }), withTiming(3, { duration: 50 }), withTiming(0, { duration: 60 }),
    ));
    squash.value = withDelay(landAt, withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 280, easing: Easing.out(Easing.back(2.5)) })));
    dust.value = withDelay(landAt, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
    glow.value = withDelay(landAt, withTiming(0.2, { duration: 400 }));
    rays.value = withDelay(landAt, withTiming(0.12, { duration: 600 }));
    hint.value = withDelay(landAt + 250, withTiming(1, { duration: 300 }));
    later(landAt + 300, () => { landed.current = true; });
  };
  const onShow = useOnModalShown(() => {
    backdrop.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
    shownAt.current = Date.now();
    dropWhenReady();
  });
  const imageLoaded = (part: "lid" | "base") => {
    imagesLoaded.current.add(part);
    dropWhenReady();
  };
  useEffect(() => {
    const t = setTimeout(() => { imagesLoaded.current.add("lid").add("base"); dropWhenReady(); }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Ett tryck: hopp, skak, gnistor
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
    if (n >= 2) shakeScreen(3 + n * 1.5);
  };

  const skipToEnd = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTremble(0);
    hot.value = 0; lid.value = 1; presentOut.value = 1; flash.value = 0; zoom.value = 0; screenShake.value = 0;
    rays.value = 1; glow.value = 0.65; burst.value = 1; hint.value = 0;
    rise.value = 1; tilt.value = 0; text.value = 1;
    cancelAnimation(buttons);
    buttons.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    hit(Haptics.ImpactFeedbackStyle.Heavy);
    skipped.current = true;
    ready.current = true;
  };

  const tap = () => {
    if (opened.current && !ready.current && !skipped.current && !leaving.current) { skipToEnd(); return; }
    if (opened.current || leaving.current || !landed.current || taps >= TAPS) return;
    const n = taps + 1;
    setTaps(n);
    punch(n);
    seam.value = withTiming(n / TAPS, { duration: 220 });
    zoom.value = withTiming(n / TAPS, { duration: 320, easing: Easing.out(Easing.cubic) });
    glow.value = withTiming(0.2 + n * 0.2, { duration: 300 });
    rays.value = withTiming(0.12 + n * 0.13, { duration: 300 });
    setTremble(n * 0.8);
    hint.value = withSequence(withTiming(1.25, { duration: 90 }), withTiming(1, { duration: 200 }));
    hit(n === 1 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
    if (n >= 2) later(90, () => hit(Haptics.ImpactFeedbackStyle.Rigid));
    playSound("tick");
  };

  // Mellan trycken bultar paketet som ett hjärta (från andra trycket, tills smällen)
  useEffect(() => {
    if (taps < 2 || taps >= TAPS) return;
    const id = setInterval(() => hit(Haptics.ImpactFeedbackStyle.Soft), 650);
    return () => clearInterval(id);
  }, [taps]);

  // 3. Smällen efter sista trycket
  useEffect(() => {
    if (opened.current || taps < TAPS) return;
    opened.current = true;
    markCardSeen(card.id);
    hot.value = withTiming(1, { duration: BOOM_DELAY, easing: Easing.in(Easing.quad) });
    setTremble(5);
    [0, 60, 120, 170, 215, 255].forEach((at, i) => later(at, () => hit(i < 3 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Rigid)));
    later(BOOM_DELAY, () => {
      setTremble(0);
      hit(Haptics.ImpactFeedbackStyle.Heavy);
      playSound("milestone");
      shakeScreen(14);
    });
    later(BOOM_DELAY + 130, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}));
    flash.value = withDelay(BOOM_DELAY, withSequence(withTiming(1, { duration: 50 }), withTiming(0, { duration: 500 })));
    lid.value = withDelay(BOOM_DELAY, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    presentOut.value = withDelay(BOOM_DELAY + 120, withTiming(1, { duration: 550, easing: Easing.in(Easing.quad) }));
    burst.value = withDelay(BOOM_DELAY, withTiming(1, { duration: 1700, easing: Easing.linear }));
    rays.value = withDelay(BOOM_DELAY, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    glow.value = withDelay(BOOM_DELAY, withSequence(withTiming(1, { duration: 120 }), withTiming(0.65, { duration: 900 })));
    zoom.value = withDelay(BOOM_DELAY, withTiming(0, { duration: 500 }));
    hint.value = withTiming(0, { duration: 150 });
    rise.value = withDelay(BOOM_DELAY + 40, withTiming(1, { duration: 750, easing: Easing.out(Easing.back(1.4)) }));
    tilt.value = withDelay(BOOM_DELAY + 40, withSpring(0, TILT_SPRING));
    later(BOOM_DELAY + 790, () => hit(Haptics.ImpactFeedbackStyle.Medium));
    text.value = withDelay(BOOM_DELAY + T_TEXT, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    // Knapparna finns redan (osynliga) och tonas bara fram
    buttons.value = withDelay(BOOM_DELAY + T_READY, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    later(BOOM_DELAY + T_READY, () => { ready.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taps]);

  // Knapparna finns från start men är osynliga tills de tonats fram — ett tryck där innan dess
  // räknas som ett tryck på skärmen
  const press = (use: boolean) => (ready.current ? exit(use) : tap());

  const exit = (use: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    toProfile.current = use;
    // Innehållet tonas ut (260 ms); först när det är helt borta tas allt tungt bort, bakom den
    // stilla mörka bakgrunden (en fast tid kunde klippa en sen toning mitt i)
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(setCleared)(true);
    });
    rays.value = withTiming(0, { duration: 260 });
  };

  // Resten av utgången, när det tunga väl tagits bort
  useEffect(() => {
    if (!cleared) return;
    if (!toProfile.current) {
      backdrop.value = withDelay(60, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
      later(400, onClose);
      return;
    }
    // "Använd kortet": designen sparas och Profil öppnas bakom den mörka ytan; bakgrunden tonas bort
    // när sidan hunnit bli klar, och där landar kortet på sin plats (CardReveal)
    requestProfileReveal("card", card.id);
    updateProfile.mutate({ card_color: card.id });
    onNavigate();
    backdrop.value = withDelay(850, withTiming(0, { duration: 480, easing: Easing.inOut(Easing.quad) }));
    later(850 + 480 + 20, onClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleared]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 24 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.42 }));
  const stageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: screenShake.value }, { scale: 1 + zoom.value * 0.14 }],
  }));
  const presentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(presentIn.value, [0, 0.25], [0, 1], "clamp") * (1 - presentOut.value),
    transform: [
      { translateY: interpolate(presentIn.value, [0, 1], [-height * 0.6, 0]) - jump.value * 22 + presentOut.value * height * 0.3 },
      { rotate: `${shake.value + tremble.value}deg` },
      { scaleX: 1 + squash.value * 0.08 },
      { scaleY: 1 - squash.value * 0.07 },
    ],
  }));
  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lid.value * height * 0.75 }, { translateX: -lid.value * 60 }, { rotate: `${-lid.value * 70}deg` }],
  }));
  const seamStyle = useAnimatedStyle(() => ({ opacity: Math.max(seam.value, hot.value) * (1 - lid.value) }));
  const beamsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, seam.value * 0.9 + hot.value) * (1 - presentOut.value) }));
  const hotStyle = useAnimatedStyle(() => ({ opacity: hot.value * 0.55 * (1 - lid.value) }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rise.value, [0, 0.1], [0, 1], "clamp"),
    transform: [
      { translateY: interpolate(rise.value, [0, 1], [presentY + seamOffset - finalY, 0]) },
      { scale: interpolate(rise.value, [0, 1], [0.15, 1]) },
      { rotate: `${tilt.value}deg` },
    ],
  }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, hint.value), transform: [{ scale: Math.max(1, hint.value) }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: interpolate(text.value, [0, 1], [18, 0]) }] }));
  const buttonsStyle = useAnimatedStyle(() => ({ opacity: buttons.value, transform: [{ translateY: interpolate(buttons.value, [0, 1], [14, 0]) }] }));

  // Medlemskortet byggs en gång (se överst) — samma element varje gång komponenten ritas om
  const cardElement = useMemo(() => (
    <MemberCard
      width={cardW}
      displayName={profile?.display_name ?? ""}
      isMember
      disableFlip
      memberSince={profile?.created_at ? formatDate(profile.created_at, "MMMM yyyy") : null}
      cardColor={card.id}
      avatarUrl={avatarUrl}
      circleColor={profile?.circle_color}
      avatarRing={profile?.avatar_ring}
      onBuyPress={noop}
    />
  ), [cardW, card.id, profile?.display_name, profile?.created_at, profile?.circle_color, profile?.avatar_ring, avatarUrl]);

  const raysSize = Math.hypot(width, height) * 1.05;
  const glowSize = width * 1.4;
  const bottomPad = Math.max(insets.bottom, 16) + 8;
  const reason = card.kind === "treasures"
    ? "Du har hittat alla Österlens skatter."
    : card.kind === "visits_month" && card.period
      ? `Flest besök i hela appen under ${formatDate(`${card.period}-01T12:00:00`, "MMMM yyyy")}.`
      : `Flest besök i hela appen under ${card.period ?? ""}.`;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onShow={onShow} onRequestClose={() => exit(false)}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        {!cleared && (<>
        {/* Strålkrans och glöd över hela skärmen */}
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          <View style={[s.anchor, { top: finalY - raysSize / 2, left: (width - raysSize) / 2, width: raysSize, height: raysSize }]}>
            <GoldRays size={raysSize} visible={rays} maxOpacity={0.55} />
          </View>
          <Reanimated.View style={[s.anchor, { top: presentY - glowSize / 2, left: (width - glowSize) / 2, width: glowSize, height: glowSize }, glowStyle]}>
            <RadialGlow size={glowSize} color={GOLD} opacity={0.4} radiusRatio={0.6} />
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.View style={[s.root, contentStyle]}>
          <Pressable style={s.root} onPress={tap}>
            {/* Paketet, med kamerans zoom och skak */}
            <Reanimated.View style={[StyleSheet.absoluteFill, stageStyle]} pointerEvents="none">
              <View style={[s.anchor, { top: presentY - presentH / 2, left: (width - PRESENT) / 2, width: PRESENT, height: presentH }]}>
                {/* Ljuset ur springan, bakom paketet */}
                <Reanimated.View style={[s.anchor, { top: presentH / 2 + seamOffset - PRESENT, left: -PRESENT / 2, width: PRESENT * 2, height: PRESENT * 2 }, beamsStyle]}>
                  <GoldRays size={PRESENT * 2} visible={seam} maxOpacity={0.9} />
                </Reanimated.View>
                <Reanimated.View style={[{ width: PRESENT, height: presentH }, presentStyle]}>
                  <View style={StyleSheet.absoluteFill}><PresentBase size={PRESENT} onLoad={() => imageLoaded("base")} /></View>
                  <Reanimated.View style={[s.seam, { top: presentH / 2 + seamOffset - 4, left: PRESENT * 0.13, width: PRESENT * 0.74 }, seamStyle]} />
                  <Reanimated.View style={[StyleSheet.absoluteFill, lidStyle]}><PresentLid size={PRESENT} onLoad={() => imageLoaded("lid")} /></Reanimated.View>
                  <Reanimated.View style={[s.anchor, { top: presentH / 2 + seamOffset - PRESENT * 0.4, left: PRESENT * 0.1, width: PRESENT * 0.8, height: PRESENT * 0.8 }, hotStyle]}>
                    <RadialGlow size={PRESENT * 0.8} color="#FFF4D6" opacity={1} radiusRatio={0.6} />
                  </Reanimated.View>
                </Reanimated.View>
                <View style={[s.sparkOrigin, { top: presentH / 2 + seamOffset }]}>
                  <Confetti progress={sparks} count={14} power={0.7} durationS={0.8} colors={SPARKS} />
                </View>
                <View style={[s.sparkOrigin, { top: presentH * 0.9 }]}>
                  <Confetti progress={dust} count={14} power={0.35} durationS={0.7} colors={DUST} />
                </View>
              </View>
            </Reanimated.View>

            {/* Explosionen och kortet — finns från start (osynligt, så bilden hunnit laddas), syns vid smällen */}
            <View style={[s.anchor, { top: presentY - 1, left: width / 2 - 1, width: 2, height: 2 }]} pointerEvents="none">
              <Confetti progress={burst} count={80} power={1.7} durationS={1.6} />
            </View>
            <Reanimated.View
              style={[s.anchor, { top: finalY - cardH / 2, left: (width - cardW) / 2, width: cardW, height: cardH }, cardStyle]}
              pointerEvents="none"
            >
              {cardElement}
            </Reanimated.View>

            <View style={[s.below, { top: presentY + presentH / 2 + 4 }]} pointerEvents="none">
              <Reanimated.Text style={[s.hint, hintStyle]}>{HINTS[Math.min(taps, TAPS - 1)]}</Reanimated.Text>
            </View>
            <Reanimated.View style={[s.below, { top: finalY + cardH / 2 + 28 }, textStyle]} pointerEvents="none">
              <Text style={s.eyebrow}>NYTT KORT!</Text>
              <Text style={s.name}>{rewardCardName(card, t)}</Text>
              <Text style={s.reason}>{reason}</Text>
            </Reanimated.View>
          </Pressable>

          <Reanimated.View style={[s.buttons, { paddingBottom: bottomPad }, buttonsStyle]}>
            <GoldButton label="Använd kortet" onPress={() => press(true)} />
            <GhostButton label="Fortsätt" onPress={() => press(false)} />
          </Reanimated.View>
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
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2.6, color: GOLD },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 28, color: FG, marginTop: 6, textAlign: "center" },
  reason: { fontFamily: "Inter_500Medium", fontSize: 15.5, color: MUTED, marginTop: 10, textAlign: "center" },
  buttons: { paddingHorizontal: 20, gap: 10 },
});
