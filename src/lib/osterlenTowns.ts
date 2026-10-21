/**
 * De största orterna på Österlen, ungefär i storleksordning (flest invånare först), med sitt läge.
 * Används i onboardingen ("Var bor du?"): orterna man kan välja direkt, och den som ligger närmast
 * om man delat sin plats. Mindre orter skriver man själv under "Annan ort".
 */
import { distanceMeters } from "@/lib/checkin";

export const OSTERLEN_TOWNS: { name: string; lat: number; lng: number }[] = [
  { name: "Simrishamn", lat: 55.5565, lng: 14.3502 },
  { name: "Tomelilla", lat: 55.5446, lng: 13.9541 },
  { name: "Kivik", lat: 55.6853, lng: 14.2262 },
  { name: "Borrby", lat: 55.4545, lng: 14.1925 },
  { name: "Hammenhög", lat: 55.4972, lng: 14.1553 },
  { name: "Skillinge", lat: 55.4708, lng: 14.2783 },
  { name: "Brösarp", lat: 55.7219, lng: 14.1011 },
  { name: "Smedstorp", lat: 55.5958, lng: 14.1219 },
  { name: "Löderup", lat: 55.4125, lng: 14.1247 },
  { name: "Gärsnäs", lat: 55.5458, lng: 14.1736 },
  { name: "Sankt Olof", lat: 55.6372, lng: 14.1394 },
  { name: "Brantevik", lat: 55.5136, lng: 14.3483 },
];

/** Längre bort än så här från närmaste ort räknas man inte som på Österlen */
const OSTERLEN_RADIUS_KM = 12;

/** Närmaste ort på Österlen, eller null om man är någon annanstans */
export function nearestOsterlenTown(lat: number, lng: number): string | null {
  let best: { name: string; km: number } | null = null;
  for (const town of OSTERLEN_TOWNS) {
    const km = distanceMeters(lat, lng, town.lat, town.lng) / 1000;
    if (!best || km < best.km) best = { name: town.name, km };
  }
  return best && best.km <= OSTERLEN_RADIUS_KM ? best.name : null;
}
