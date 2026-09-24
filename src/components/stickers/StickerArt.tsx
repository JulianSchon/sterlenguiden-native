/**
 * Stickerns bild: i färg när den är upplåst, annars som mörk silhuett av samma
 * bild. Saknas konstfilen visas en lila platshållare tills den finns.
 */
import { Image, View } from "react-native";
import Svg, { Circle, Polygon } from "react-native-svg";
import { stickerImageUrl, type Collectible } from "@/hooks/useCollectibles";

const STAR = "12,4.5 14.4,9.6 20,10.3 15.8,14.1 17,19.6 12,16.8 7,19.6 8.2,14.1 4,10.3 9.6,9.6";
const SILHOUETTE = "#3A3A44";

export function StickerArt({
  collectible, size, silhouette,
}: { collectible: Collectible; size: number; silhouette: boolean }) {
  if (collectible.imagePath) {
    return (
      <Image
        source={{ uri: stickerImageUrl(collectible.imagePath) }}
        // tintColor gör alla synliga pixlar till en enda färg = silhuett
        style={{ width: size, height: size, tintColor: silhouette ? SILHOUETTE : undefined }}
        resizeMode="contain"
      />
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
