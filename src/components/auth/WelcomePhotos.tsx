/**
 * Bildspelet bakom startsidan: Österlen, en bild i taget. Liggande bilder glider sakta i sidled,
 * stående zoomar långsamt in. Efter en stund tonar nästa bild in ovanpå, och så vidare runt.
 *
 * Bilderna ligger i appen (assets/welcome, från Pexels) så de syns direkt, även utan nät. Medan en
 * annan sida ligger ovanpå står bildspelet still — rörde det sig samtidigt som sidan gled undan såg
 * det ut som ett hack. Vill telefonen ha mindre rörelse byts bilderna utan att röra sig.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import Reanimated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from "react-native-reanimated";

/** Bredd delat med höjd för varje bild */
const PHOTOS = [
  { source: require("../../../assets/welcome/ales-stenar.jpg"), ratio: 3000 / 2000 },
  { source: require("../../../assets/welcome/hammars-backar.jpg"), ratio: 1600 / 2400 },
  { source: require("../../../assets/welcome/kor-hammars-backar.jpg"), ratio: 3000 / 2000 },
  { source: require("../../../assets/welcome/strand.jpg"), ratio: 1600 / 2840 },
  { source: require("../../../assets/welcome/rapsfalt.jpg"), ratio: 1600 / 2400 },
];
/** Så länge en bild syns innan nästa tonar in */
const SHOW_MS = 7000;
const FADE_MS = 1400;
/** Hur mycket en stående bild zoomar in medan den syns */
const ZOOM = 0.08;

export function WelcomePhotos() {
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(0);
  // Bilden under (den som just tonas bort), så övertoningen inte blinkar
  const [previous, setPrevious] = useState<number | null>(null);
  const [focused, setFocused] = useState(true);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    if (!focused) return;
    const timer = setTimeout(() => {
      setPrevious(current);
      setCurrent((i) => (i + 1) % PHOTOS.length);
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [current, focused]);

  // Samma nyckel per bild, så bilden som tonas bort fortsätter röra sig där den var
  const layers = previous !== null ? [previous, current] : [current];
  return (
    <>
      {layers.map((i) => (
        <Photo
          key={i}
          index={i}
          moving={focused}
          fadeIn={i === current && previous !== null}
          reduced={reduced}
          onShown={i === current ? () => setPrevious(null) : undefined}
        />
      ))}
    </>
  );
}

function Photo({ index, moving, fadeIn, reduced, onShown }: {
  index: number; moving: boolean; fadeIn: boolean; reduced: boolean; onShown?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const photo = PHOTOS[index];
  const landscape = photo.ratio > width / height;
  // Liggande: lika hög som skärmen och bredare, så den kan glida. Stående: fyller skärmen.
  const photoW = landscape ? Math.ceil(height * photo.ratio) : width;
  const photoH = landscape ? height : Math.max(height, Math.ceil(width / photo.ratio));
  const travel = Math.max(0, photoW - width);

  const opacity = useSharedValue(fadeIn ? 0 : 1);
  const progress = useSharedValue(0);
  const shownRef = useRef(onShown);
  shownRef.current = onShown;

  useEffect(() => {
    if (!fadeIn) return;
    opacity.value = withTiming(1, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) });
    const timer = setTimeout(() => shownRef.current?.(), FADE_MS + 50);
    return () => clearTimeout(timer);
  }, [fadeIn, opacity]);

  useEffect(() => {
    if (reduced || !moving) {
      cancelAnimation(progress);
      return;
    }
    // Rör sig hela tiden den syns, och lite in i övertoningen till nästa
    const left = 1 - progress.value;
    progress.value = withTiming(1, { duration: (SHOW_MS + FADE_MS) * left, easing: Easing.linear });
    return () => cancelAnimation(progress);
  }, [moving, reduced, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: landscape
      ? [{ translateX: -(0.15 + 0.7 * progress.value) * travel }]
      : [{ scale: 1 + ZOOM * progress.value }],
  }));

  return (
    <Reanimated.View style={[s.photo, { width: photoW, height: photoH, top: (height - photoH) / 2 }, style]}>
      <ExpoImage source={photo.source} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  photo: { position: "absolute", left: 0 },
});
