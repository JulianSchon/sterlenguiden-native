/**
 * Profilringar: ramen runt profilbilden — Österlens djur, från grisen till kronhjorten (Skånes
 * landskapsdjur). Ringar tjänas in och säljs aldrig (annars kräver Apple köp i appen). Varje ring
 * har en regel för när den låses upp — upplåst eller inte räknas alltid ur riktig data (antal
 * hittade skatter, klarade utmaningar), precis som troféerna, så det kan aldrig hamna ur synk. Se
 * useRingUnlocks. Databasen kontrollerar samma regler när en ring väljs (migration 029), så ingen
 * kan välja en ring den inte låst upp.
 *
 * Ringarnas konst: gjord i ChatGPT, beskuren så att hålet ligger exakt i bildens mitt
 * (assets/rings/ring-<id>.png). Djuret sitter ovanpå ringen och får gärna täcka en bit av
 * profilbilden. holeRatio = hålets diameter / bildens bredd, uppmätt vid beskärningen och 4 %
 * mindre, så ringen täcker profilbildens kant. Utan bild ritas ringen som en enkel metallring.
 */

export type RingRule =
  | { kind: "free" }
  /** Låses upp vid så här många hittade skatter */
  | { kind: "treasures"; count: number }
  /** Låses upp när alla utmaningar är klarade */
  | { kind: "allChallenges" };

export interface AvatarRingDef {
  id: string;
  rule: RingRule;
  /** Färger för den ritade reservringen (ljus → mörk) tills bilden finns */
  colors?: [string, string, string];
  /** Ringens bild (require), när den finns */
  image?: number;
  /** Hålets diameter som andel av bildens bredd */
  holeRatio?: number;
}

export const AVATAR_RINGS: AvatarRingDef[] = [
  { id: "none", rule: { kind: "free" } },
  { id: "gris", rule: { kind: "treasures", count: 6 }, colors: ["#FFC9D6", "#E58FA4", "#8C4A3A"], image: require("../../assets/rings/ring-gris.png"), holeRatio: 0.568 },
  { id: "far", rule: { kind: "treasures", count: 12 }, colors: ["#FFF6E2", "#E8D9B8", "#8A6B45"], image: require("../../assets/rings/ring-far.png"), holeRatio: 0.537 },
  { id: "ko", rule: { kind: "treasures", count: 18 }, colors: ["#C8F0A8", "#7DBE54", "#6B4A2A"], image: require("../../assets/rings/ring-ko.png"), holeRatio: 0.553 },
  { id: "kronhjort", rule: { kind: "allChallenges" }, colors: ["#F2C98E", "#C27A3A", "#5A3A1E"], image: require("../../assets/rings/ring-kronhjort.png"), holeRatio: 0.467 },
];

export function findRing(id: string | null | undefined): AvatarRingDef | undefined {
  return id ? AVATAR_RINGS.find((r) => r.id === id) : undefined;
}
