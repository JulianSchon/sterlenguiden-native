/**
 * Sidan tonar fram som en helhet första gången den visas (som Facebook): bakgrundsfärgen en kort
 * stund, sedan hela innehållet på en gång. Toningen startar först när sidan är färdigbyggd (första
 * layouten + en bildruta), så man aldrig ser den byggas.
 *
 * Används på Sök, Kalender och Profil. Där ersätter den "tåget" (rutorna som gled in en och en):
 * tåget startade medan de tunga sidorna byggdes och tappade ibland bildrutor. En enda toning av
 * hela sidan är det lättaste telefonen kan göra, och ser likadan ut varje gång. Flikarna ligger
 * kvar när man byter, så den spelas bara första gången.
 */
import { useCallback, useRef } from "react";
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const FADE_MS = 200;

export function usePageFadeIn() {
  const opacity = useSharedValue(0);
  const started = useRef(false);
  const onLayout = useCallback(() => {
    if (started.current) return;
    started.current = true;
    requestAnimationFrame(() => {
      opacity.value = withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.quad) });
    });
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return { style, onLayout };
}
