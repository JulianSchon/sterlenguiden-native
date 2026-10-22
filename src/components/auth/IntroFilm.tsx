/**
 * Introfilmen första gången appen öppnas: korta glimtar av Österlen (rapsfält, äppelblom, fälten
 * från ovan, dynerna, kaffet, havet i kvällsljus) som tonar in i varandra och till sist i mörker.
 * Sedan tänds loggan, och när den tonat undan ligger startsidan med knapparna under.
 *
 * Filmen ligger i appen (assets/intro/intro.mp4, 7 sekunder, 2 MB) så den spelas direkt, även
 * utan nät. Den visas en gång (sparas i telefonen). Ett tryck hoppar fram till loggan. Saknas
 * videomodulen i appen, eller vill telefonen ha mindre rörelse, hoppas filmen över.
 */
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet } from "react-native";
import { requireOptionalNativeModule } from "expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";

const SEEN_KEY = "intro-seen:v1";
const FILM = require("../../../assets/intro/intro.mp4");
/** Om filmen inte kommit igång efter så här lång tid hoppar vi över den */
const START_TIMEOUT_MS = 2500;

type Phase = "film" | "logo" | "out";

/** Om introt ska visas: aldrig sett och videomodulen finns. null medan det kollas. */
export function useShouldShowIntro(reduced: boolean): boolean | null {
  const [show, setShow] = useState<boolean | null>(null);
  useEffect(() => {
    if (reduced || !requireOptionalNativeModule("ExpoVideo")) { setShow(false); return; }
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => setShow(v !== "1"))
      .catch(() => setShow(false));
  }, [reduced]);
  return show;
}

/** onReveal: startsidan kan börja visa sig (det svarta börjar tona undan). onDone: introt är borta. */
export function IntroFilm({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  // Laddas först här: att importera expo-video i en app utan modulen kraschar hela appen
  const { useVideoPlayer, VideoView } = require("expo-video") as typeof import("expo-video");
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("film");
  const started = useRef(false);

  const player = useVideoPlayer(FILM, (p) => {
    p.muted = true;
    p.audioMixingMode = "mixWithOthers"; // musiken man lyssnar på fortsätter
    p.play();
  });

  const logo = useSharedValue(0);
  const cover = useSharedValue(1);

  useEffect(() => {
    AsyncStorage.setItem(SEEN_KEY, "1").catch(() => {});
    const end = player.addListener("playToEnd", () => setPhase("logo"));
    const status = player.addListener("statusChange", ({ status: st }) => {
      if (st === "readyToPlay") started.current = true;
      if (st === "error") setPhase("logo");
    });
    const timeout = setTimeout(() => { if (!started.current) setPhase("logo"); }, START_TIMEOUT_MS);
    return () => { end.remove(); status.remove(); clearTimeout(timeout); };
  }, [player]);

  useEffect(() => {
    if (phase !== "logo") return;
    // Loggan tänds i mörkret, står en stund och tonar sedan undan tillsammans med det svarta
    logo.value = withSequence(
      withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }),
      withDelay(450, withTiming(0, { duration: 550, easing: Easing.in(Easing.quad) })),
    );
    const reveal = setTimeout(onReveal, 950);
    cover.value = withDelay(950, withTiming(0, { duration: 600, easing: Easing.inOut(Easing.quad) }, (done) => {
      if (done) runOnJS(setPhase)("out");
    }));
    return () => clearTimeout(reveal);
  }, [phase, logo, cover, onReveal]);

  useEffect(() => {
    if (phase === "out") onDone();
  }, [phase, onDone]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: logo.value, transform: [{ scale: 0.96 + logo.value * 0.04 }] }));

  if (phase === "out") return null;
  return (
    <Reanimated.View style={[StyleSheet.absoluteFill, s.root, coverStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhase("logo")} accessibilityLabel={t("auth.welcome.skipIntro")}>
        {phase === "film" && (
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        )}
        <Reanimated.View style={[StyleSheet.absoluteFill, s.center, logoStyle]} pointerEvents="none">
          <Image source={require("../../../assets/Osterlenappen-logo.png")} style={s.logo} resizeMode="contain" />
        </Reanimated.View>
      </Pressable>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: "#0A0806", zIndex: 10 },
  center: { alignItems: "center", justifyContent: "center" },
  logo: { width: 84, height: 94 },
});
