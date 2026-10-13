/**
 * Grå platshållare medan innehåll laddas — i stället för ett snurrande hjul. Sidan öppnas direkt
 * med sin riktiga form i grått, och innehållet tar platsen när det kommit. Alla platshållare i
 * appen pulserar i takt (en gemensam puls), så en sida full av dem andas som en enda yta.
 */
import { useEffect, useState } from "react";
import { Image, StyleSheet, View, type DimensionValue, type ImageProps, type StyleProp, type ViewStyle } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, makeMutable, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";

const TONES = { dark: "rgba(255,255,255,0.08)", light: "rgba(35,28,15,0.08)" };

// En puls för hela appen, igång bara medan någon platshållare syns
const pulse = makeMutable(0);
let mounted = 0;

function usePulse() {
  useEffect(() => {
    if (mounted++ === 0) {
      pulse.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
    }
    return () => {
      if (--mounted === 0) {
        cancelAnimation(pulse);
        pulse.value = 0;
      }
    };
  }, []);
}

export function Skeleton({
  width, height, radius = 8, style, tone,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Sidor som alltid är mörka (oavsett tema) skickar "dark" */
  tone?: "dark" | "light";
}) {
  usePulse();
  const { scheme } = useTheme();
  const anim = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * pulse.value }));
  return (
    <Reanimated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: TONES[tone ?? scheme] }, style, anim]}
    />
  );
}

/**
 * En bild som är en grå platshållare tills den hunnit laddas, och sen tonar in. Minnenas foton
 * ligger i en privat bucket bakom signerade länkar, så väntan är verklig — utan platshållaren
 * syns bara en tom, nästan svart yta som lätt läses som att något gått sönder.
 */
export function LoadingImage({
  source, resizeMode, style, tone,
}: {
  source: ImageProps["source"];
  resizeMode?: ImageProps["resizeMode"];
  style: StyleProp<ViewStyle>;
  tone?: "dark" | "light";
}) {
  const [loaded, setLoaded] = useState(false);
  const opacity = useSharedValue(0);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View style={[style, { overflow: "hidden" }]}>
      {!loaded && <Skeleton tone={tone} radius={0} style={StyleSheet.absoluteFill} />}
      <Reanimated.View style={[StyleSheet.absoluteFill, fade]}>
        <Image
          source={source}
          resizeMode={resizeMode}
          style={StyleSheet.absoluteFill}
          // Platshållaren tas bort först när bilden helt täcker den
          onLoad={() => {
            opacity.value = withTiming(1, { duration: 220 }, (done) => {
              if (done) runOnJS(setLoaded)(true);
            });
          }}
        />
      </Reanimated.View>
    </View>
  );
}
