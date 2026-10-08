/**
 * En <Image> som visar en diskret laddningsindikator tills bilden faktiskt har hunnit hämtas
 * och ritas upp. Minnenas foton ligger i en PRIVAT bucket och visas via tillfälliga signerade
 * länkar (se useSignedUrls i useMemories.ts) — det kostar en extra nätverksresa (hämta minnet,
 * sen signera länkarna) innan själva bildnedladdningen ens kan börja, så den riktiga väntetiden
 * är verklig, inte inbillad. Utan den här syns bara en tom (i appens mörka tema: nästan svart)
 * yta under tiden, vilket lätt läses som att något gått sönder i stället för att bara vänta.
 */
import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View, type ImageProps, type StyleProp, type ViewStyle } from "react-native";

const GOLD = "#C5A059";

export function LoadingImage({
  source, resizeMode, style, indicatorColor = GOLD,
}: {
  source: ImageProps["source"];
  resizeMode?: ImageProps["resizeMode"];
  style: StyleProp<ViewStyle>;
  indicatorColor?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={[style, { overflow: "hidden" }]}>
      <Image source={source} resizeMode={resizeMode} style={StyleSheet.absoluteFill} onLoad={() => setLoaded(true)} />
      {!loaded && (
        <View style={[StyleSheet.absoluteFill, s.overlay]} pointerEvents="none">
          <ActivityIndicator color={indicatorColor} size="small" />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { alignItems: "center", justifyContent: "center" },
});
