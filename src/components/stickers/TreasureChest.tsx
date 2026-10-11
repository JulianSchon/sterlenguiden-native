/**
 * Skattkistan i upplåsningen — gjord i samma stil som skatterna (ChatGPT) och klippt vid skarven
 * till ett lock och en botten (assets/treasure/), så att locket kan flyga av när kistan öppnas.
 * Båda bilderna har samma kvadratiska mått och ligger exakt ovanpå varandra; CHEST_SEAM_Y är
 * skarven där de möts (där ljuset läcker ut), i bildens pixlar.
 */
import { Image } from "react-native";

export const CHEST_W = 600;
export const CHEST_H = 600;
export const CHEST_SEAM_Y = 289;

const LID = require("../../../assets/treasure/chest-lid.png");
const BASE = require("../../../assets/treasure/chest-base.png");

export function ChestLid({ size }: { size: number }) {
  return <Image source={LID} style={{ width: size, height: (size * CHEST_H) / CHEST_W }} resizeMode="contain" />;
}

export function ChestBase({ size }: { size: number }) {
  return <Image source={BASE} style={{ width: size, height: (size * CHEST_H) / CHEST_W }} resizeMode="contain" />;
}
