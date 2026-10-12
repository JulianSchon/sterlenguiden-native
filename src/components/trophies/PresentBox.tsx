/**
 * Paketet i kortpresenten — samma uppbyggnad som skattkistan (TreasureChest): en bild klippt vid
 * skarven till ett lock och en låda (assets/present/), så att locket kan flyga av när paketet
 * öppnas. Båda bilderna har samma kvadratiska mått och ligger exakt ovanpå varandra;
 * PRESENT_SEAM_Y är skarven där de möts (där ljuset läcker ut), i bildens pixlar.
 *
 * TILLFÄLLIG BILD: ett enkelt ritat paket tills Viktors ChatGPT-bild finns. Den klipps då på
 * samma sätt som kistan, och PRESENT_SEAM_Y sätts efter den nya bilden.
 */
import { Image } from "react-native";

export const PRESENT_W = 600;
export const PRESENT_H = 600;
export const PRESENT_SEAM_Y = 252;

const LID = require("../../../assets/present/present-lid.png");
const BASE = require("../../../assets/present/present-base.png");

export function PresentLid({ size }: { size: number }) {
  return <Image source={LID} style={{ width: size, height: (size * PRESENT_H) / PRESENT_W }} resizeMode="contain" />;
}

export function PresentBase({ size }: { size: number }) {
  return <Image source={BASE} style={{ width: size, height: (size * PRESENT_H) / PRESENT_W }} resizeMode="contain" />;
}
