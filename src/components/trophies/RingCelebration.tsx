/**
 * Ny profilring: helskärmsfirandet när en ring låses upp (6/12/18 skatter, alla utmaningar).
 * Visas av belöningsvakten (TrophyHost), efter eventuella utmaningsfiranden — aldrig samtidigt.
 *
 *  1. Din egen profilbild tonar fram i mitten.
 *  2. Ringen faller ner över den, stor och snurrande, och smäller fast: blixt, strålkrans i ringens
 *     färg, konfetti och en kraftig vibration följd av en "klar"-vibration.
 *  3. "Ny profilring!", ringens namn och vad du gjorde för att få den.
 *  4. "Använd ringen" — sparar ringen och öppnar Profil bakom den mörka bakgrunden, där ringen
 *     sen faller ner över profilbilden på medlemskortet (SnapRing) — eller "Fortsätt".
 *
 * Ett tryck under animationen spolar fram den. Avslutet tonar ut som övriga belöningar.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateProfile } from "@/hooks/useAccount";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { playSound } from "@/lib/sounds";
import { useOnModalShown } from "@/hooks/useOnModalShown";
import type { AvatarRingDef } from "@/lib/avatarRings";
import { requestProfileReveal } from "@/lib/profileReveal";
import { Avatar } from "@/components/profile/Avatar";
import { AvatarRing } from "@/components/profile/AvatarRing";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { Confetti, GOLD, GhostButton, GoldButton, GoldRays } from "@/components/checkin/CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.72)";
const T_AVATAR = 250;
const T_DROP = 900;
const DROP_MS = 420;
const T_IMPACT = T_DROP + DROP_MS;
const T_TEXT = T_IMPACT + 450;
const T_READY = T_IMPACT + 1500;

export function RingCelebration({ ring, reason, onNavigate, onClose }: {
  ring: AvatarRingDef;
  /** Öppna Profil — anropas medan firandet fortfarande täcker skärmen */
  onNavigate: () => void;
  /** Vad man gjorde: "Du har hittat 6 av Österlens skatter." */
  reason: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const updateProfile = useUpdateProfile();
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const color = ring.colors?.[1] ?? GOLD;
  const confetti = ring.colors ? [ring.colors[0], ring.colors[1], ring.colors[2], "#FFFFFF"] : undefined;

  const backdrop = useSharedValue(0);
  const leave = useSharedValue(0);
  const avatarIn = useSharedValue(0);
  const drop = useSharedValue(0);
  const squash = useSharedValue(0);
  const flash = useSharedValue(0);
  const rays = useSharedValue(0);
  const glow = useSharedValue(0);
  const burst = useSharedValue(0);
  const text = useSharedValue(0);
  const buttons = useSharedValue(0);

  // Startar först när fönstret faktiskt syns (se useOnModalShown)
  const onShow = useOnModalShown(() => {
    backdrop.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
    avatarIn.value = withDelay(T_AVATAR, withTiming(1, { duration: 450, easing: Easing.out(Easing.back(1.4)) }));
    drop.value = withDelay(T_DROP, withTiming(1, { duration: DROP_MS, easing: Easing.in(Easing.cubic) }));
    later(T_DROP - 300, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}));
    later(T_IMPACT, () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      playSound("milestone");
    });
    later(T_IMPACT + 130, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}));
    squash.value = withDelay(T_IMPACT, withSequence(withTiming(1, { duration: 70 }), withSpring(0, { damping: 9, stiffness: 240 })));
    flash.value = withDelay(T_IMPACT, withSequence(withTiming(1, { duration: 50 }), withTiming(0, { duration: 450 })));
    rays.value = withDelay(T_IMPACT, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    glow.value = withDelay(T_IMPACT, withSequence(withTiming(1, { duration: 120 }), withTiming(0.6, { duration: 900 })));
    burst.value = withDelay(T_IMPACT, withTiming(1, { duration: 1500, easing: Easing.linear }));
    text.value = withDelay(T_TEXT, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    later(T_READY, () => {
      setReady(true);
      buttons.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    });
  });
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const tapToSkip = () => {
    if (ready) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    avatarIn.value = 1; drop.value = 1; squash.value = 0; flash.value = 0;
    rays.value = 1; glow.value = 0.6; burst.value = 1; text.value = 1; buttons.value = 1;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setReady(true);
  };

  const exit = (use: boolean) => {
    if (leaving) return;
    setLeaving(true);
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) });
    rays.value = withTiming(0, { duration: 260 });
    if (!use) {
      backdrop.value = withDelay(140, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
      setTimeout(onClose, 480);
      return;
    }
    // "Använd ringen": när innehållet tonats ut (bakom den stilla mörka ytan, där en omritning inte
    // syns) sparas ringen och Profil öppnas; bakgrunden tonas bort när sidan hunnit bli klar, och
    // där faller ringen ner över profilbilden (SnapRing)
    setTimeout(() => {
      requestProfileReveal("ring", ring.id);
      updateProfile.mutate({ avatar_ring: ring.id });
      onNavigate();
    }, 300);
    backdrop.value = withDelay(1150, withTiming(0, { duration: 480, easing: Easing.inOut(Easing.quad) }));
    setTimeout(onClose, 1650);
  };

  const AV = Math.min(160, Math.round(width * 0.4));
  const centerY = height * 0.36;
  const raysSize = Math.hypot(width, height) * 1.05;
  const glowSize = width * 1.2;
  const bottomPad = Math.max(insets.bottom, 16) + 8;

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 24 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.25 }));
  const avatarStyle = useAnimatedStyle(() => ({
    opacity: avatarIn.value,
    transform: [{ scale: interpolate(avatarIn.value, [0, 1], [0.6, 1]) * (1 - squash.value * 0.05) }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drop.value, [0, 0.2], [0, 1], "clamp"),
    transform: [
      { scale: interpolate(drop.value, [0, 1], [2.4, 1]) * (1 + squash.value * 0.06) },
      { rotate: `${interpolate(drop.value, [0, 1], [-140, 0])}deg` },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: interpolate(text.value, [0, 1], [16, 0]) }] }));
  const buttonsStyle = useAnimatedStyle(() => ({ opacity: buttons.value, transform: [{ translateY: interpolate(buttons.value, [0, 1], [14, 0]) }] }));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onShow={onShow} onRequestClose={() => exit(false)}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          <View style={[s.anchor, { top: centerY - raysSize / 2, left: (width - raysSize) / 2, width: raysSize, height: raysSize }]}>
            <GoldRays size={raysSize} visible={rays} color={ring.colors?.[0] ?? "#F5D88A"} />
          </View>
          <Reanimated.View style={[s.anchor, { top: centerY - glowSize / 2, left: (width - glowSize) / 2, width: glowSize, height: glowSize }, glowStyle]}>
            <RadialGlow size={glowSize} color={color} opacity={0.36} radiusRatio={0.55} />
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.View style={[s.root, contentStyle]} pointerEvents={leaving ? "none" : "auto"}>
          <Pressable style={s.root} onPress={tapToSkip}>
            <View style={[s.anchor, { top: centerY - AV / 2, left: (width - AV) / 2, width: AV, height: AV }]} pointerEvents="none">
              <Reanimated.View style={avatarStyle}>
                <Avatar size={AV} uri={avatarUrl} name={profile?.display_name ?? ""} color={profile?.circle_color ?? "#2A2A2A"} ring={null} />
              </Reanimated.View>
              <Reanimated.View style={[StyleSheet.absoluteFill, ringStyle]}>
                <AvatarRing ring={ring.id} size={AV}><View style={{ width: AV, height: AV }} /></AvatarRing>
              </Reanimated.View>
              <View style={[StyleSheet.absoluteFill, s.center]}>
                <Confetti progress={burst} count={40} power={1.2} colors={confetti} />
              </View>
            </View>

            <Reanimated.View style={[s.texts, { top: centerY + AV / 2 + 44 }, textStyle]} pointerEvents="none">
              <Text style={[s.eyebrow, { color: ring.colors?.[0] ?? GOLD }]}>NY PROFILRING!</Text>
              <Text style={s.name}>{t(`appearance.ring.${ring.id}` as "appearance.ring.none")}</Text>
              <Text style={s.reason}>{reason}</Text>
            </Reanimated.View>
          </Pressable>

          <Reanimated.View style={[s.buttons, { paddingBottom: bottomPad }, buttonsStyle]} pointerEvents={ready ? "auto" : "none"}>
            <GoldButton label="Använd ringen" onPress={() => exit(true)} />
            <GhostButton label="Fortsätt" onPress={() => exit(false)} />
          </Reanimated.View>
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
  texts: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2.6 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 30, color: FG, marginTop: 6, textAlign: "center" },
  reason: { fontFamily: "Inter_500Medium", fontSize: 15.5, color: MUTED, marginTop: 10, textAlign: "center" },
  buttons: { paddingHorizontal: 20, gap: 10 },
});
