/**
 * Kortens bakgrundsbilder hämtas i förväg så att kortet inte visas som en enfärgad
 * yta medan bilden laddas. I utvecklingsläget serveras bilderna av Metro över nätet
 * (därför märks laddningen där som mest); i en färdig app ligger de i själva appen
 * och behöver inget förhämtas.
 */
import { Image } from "react-native";
import { CARD_VARIANTS } from "@/lib/cardVariants";

export function prefetchCardImages() {
  for (const variant of CARD_VARIANTS) {
    if (!variant.bgImage) continue;
    const uri = Image.resolveAssetSource(variant.bgImage)?.uri;
    if (uri?.startsWith("http")) Image.prefetch(uri).catch(() => {});
  }
}
