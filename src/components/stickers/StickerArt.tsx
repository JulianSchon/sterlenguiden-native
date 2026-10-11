/**
 * Stickerns bild: i färg när den är upplåst. Låst visas en mörk, lätt suddig version av samma
 * bild — man anar motivet (stenarna, kyrkan, hamnen) men ser det inte förrän man låst upp den.
 * (En helt platt siluett blev bara en knölig klump för detaljrika motiv som Ales stenar.)
 * Saknas konstfilen visas en lila platshållare tills den finns.
 */
import { Image, StyleSheet, View } from "react-native";
import Svg, { Circle, Polygon } from "react-native-svg";
import { stickerImageUrl } from "@/hooks/useCollectibles";

const STAR = "12,4.5 14.4,9.6 20,10.3 15.8,14.1 17,19.6 12,16.8 7,19.6 8.2,14.1 4,10.3 9.6,9.6";
const SILHOUETTE = "#3A3A44";

export function StickerArt({
  imagePath, size, silhouette,
}: { imagePath: string | null; size: number; silhouette: boolean }) {
  if (imagePath) {
    const uri = stickerImageUrl(imagePath);
    if (!silhouette) {
      return <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" />;
    }
    return (
      <View style={{ width: size, height: size }}>
        {/* Bilden själv, lätt suddig */}
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" blurRadius={Math.max(1, size / 40)} />
        {/* Samma form i mörkt ovanpå (tintColor = alla synliga pixlar i en färg) — släpper igenom
            en skymt av motivet */}
        <Image source={{ uri }} style={[StyleSheet.absoluteFill, { tintColor: SILHOUETTE, opacity: 0.78 }]} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={11} fill={silhouette ? SILHOUETTE : "#7C3AED"} stroke="#fff" strokeWidth={silhouette ? 0 : 1.2} />
        <Polygon points={STAR} fill={silhouette ? "#2A2A32" : "#FDE68A"} />
      </Svg>
    </View>
  );
}
