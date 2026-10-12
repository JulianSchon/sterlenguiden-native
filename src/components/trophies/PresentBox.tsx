/**
 * Paketet i kortpresenten — gjort i samma stil som skattkistan (ChatGPT) och klippt vid skarven
 * till ett lock och en låda (assets/present/), så att locket kan flyga av när paketet öppnas.
 * Båda bilderna har samma kvadratiska mått och ligger exakt ovanpå varandra; PRESENT_SEAM_Y är
 * skarven där de möts (där ljuset läcker ut), i bildens pixlar.
 */
import { Image } from "react-native";

export const PRESENT_W = 600;
export const PRESENT_H = 600;
export const PRESENT_SEAM_Y = 336;

const LID = require("../../../assets/present/present-lid.png");
const BASE = require("../../../assets/present/present-base.png");

export function PresentLid({ size, onLoad }: { size: number; onLoad?: () => void }) {
  return <Image source={LID} style={{ width: size, height: (size * PRESENT_H) / PRESENT_W }} resizeMode="contain" onLoad={onLoad} />;
}

export function PresentBase({ size, onLoad }: { size: number; onLoad?: () => void }) {
  return <Image source={BASE} style={{ width: size, height: (size * PRESENT_H) / PRESENT_W }} resizeMode="contain" onLoad={onLoad} />;
}

/** I utvecklingsläget serveras bilderna av Metro över nätet — hämta dem i förväg (som kortens
 * bilder, se cardImages.ts). I en färdig app ligger de i själva appen. */
export function prefetchPresentImages() {
  for (const source of [LID, BASE]) {
    const uri = Image.resolveAssetSource(source)?.uri;
    if (uri?.startsWith("http")) Image.prefetch(uri).catch(() => {});
  }
}
