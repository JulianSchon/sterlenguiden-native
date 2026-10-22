/**
 * Den lilla kartan på platssidan (överst i Hitta hit-kortet): samma svartvita karta som Karta,
 * med platsen mitt i och guldnålen som studsar ner när kartan syns. Går inte att dra i — ett tryck
 * öppnar den stora kartan på platsen (glasknappen i hörnet visar att det går). Nålen ligger ovanpå kartan (inte som en markör), eftersom kartan står still
 * med platsen i mitten; på Android är kartan en färdig bild (liteMode), det billigaste som finns.
 *
 * Kartan byggs först när sidan ber om det (när man närmar sig den), och tonar in när Google
 * ritat klart. Till dess syns en grå yta.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Maximize2 } from "lucide-react-native";
import MapView from "react-native-maps";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Skeleton } from "@/components/Skeleton";
import { useTheme } from "@/theme/ThemeProvider";
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_IS_STYLEABLE, MAP_PROVIDER } from "@/components/map/mapStyle";
import { SELECTED_ANCHOR, SELECTED_SIZE, SelectedPin } from "@/components/map/MapPins";

const MINI_MAP_H = 180;

export function PlaceMiniMap({ lat, lng, mount, onPress }: {
  lat: number;
  lng: number;
  /** Bygg kartan nu (sidan har kommit fram och man närmar sig den) */
  mount: boolean;
  onPress: () => void;
}) {
  const { scheme } = useTheme();
  const dark = scheme === "dark";
  const [width, setWidth] = useState(0);
  const [drawn, setDrawn] = useState(false);
  // Den grå ytan tas bort när kartan tonat in helt
  const [shown, setShown] = useState(false);
  const fade = useSharedValue(0);

  // Säkerhet: visar kartan ändå om Google aldrig säger att den ritat klart
  useEffect(() => {
    if (!mount || drawn) return;
    const t = setTimeout(() => setDrawn(true), 2500);
    return () => clearTimeout(t);
  }, [mount, drawn]);
  useEffect(() => {
    if (!drawn) return;
    fade.value = withTiming(1, { duration: 280 }, (done) => {
      if (done) runOnJS(setShown)(true);
    });
  }, [drawn, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={s.wrap}
      accessibilityLabel="Visa på kartan"
    >
      {!shown && <Skeleton radius={0} style={StyleSheet.absoluteFill} />}
      {mount && (
        <Reanimated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="none">
          <MapView
            provider={MAP_PROVIDER}
            style={StyleSheet.absoluteFill}
            initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.018, longitudeDelta: 0.018 }}
            customMapStyle={MAP_IS_STYLEABLE ? (dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE) : undefined}
            userInterfaceStyle={dark ? "dark" : "light"}
            liteMode
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            showsCompass={false}
            onMapLoaded={() => setDrawn(true)}
          />
          {drawn && width > 0 && (
            <View
              style={[s.pin, {
                left: width / 2 - SELECTED_SIZE.width * SELECTED_ANCHOR.x,
                top: MINI_MAP_H / 2 - SELECTED_SIZE.height * SELECTED_ANCHOR.y,
              }]}
            >
              <SelectedPin />
            </View>
          )}
        </Reanimated.View>
      )}
      <View style={s.expand} pointerEvents="none">
        <BlurView
          intensity={20}
          tint={dark ? "dark" : "light"}
          style={[StyleSheet.absoluteFill, s.glass, {
            backgroundColor: dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)",
            borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
          }]}
        />
        <Maximize2 size={15} color={dark ? "rgba(255,255,255,0.85)" : "#1A1A1A"} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { height: MINI_MAP_H, overflow: "hidden" },
  pin: { position: "absolute" },
  expand: { position: "absolute", top: 10, right: 10, width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  glass: { borderRadius: 17, overflow: "hidden", borderWidth: 1 },
});
