/**
 * Profilringar: ramen runt profilbilden. Ringar tjänas in och säljs aldrig (annars kräver Apple köp
 * i appen). Varje ring har en regel för när den låses upp — upplåst eller inte räknas alltid ur
 * riktig data (antal hittade skatter, klarade utmaningar), precis som troféerna, så det kan aldrig
 * hamna ur synk. Se useRingUnlocks.
 *
 * Ringarnas konst: speloramar gjorda i ChatGPT (assets/rings/, transparent mitt — hålet är ~72 %
 * av bildens bredd). Tills en ring har sin bild ritas den som en enkel metallring i sina färger.
 */

export type RingRule =
  | { kind: "free" }
  /** Låses upp vid så här många hittade skatter */
  | { kind: "treasures"; count: number }
  /** Låses upp när alla utmaningar är klarade */
  | { kind: "allChallenges" }
  /** Finns men går inte att låsa upp än */
  | { kind: "later" };

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
  { id: "gold", rule: { kind: "free" } },
  { id: "skattletare", rule: { kind: "treasures", count: 6 }, colors: ["#F0B98A", "#B8763E", "#6B3A18"] },
  { id: "skattjagare", rule: { kind: "treasures", count: 12 }, colors: ["#F4F6F8", "#AEB6C0", "#5E6670"] },
  { id: "skattmastare", rule: { kind: "treasures", count: 18 }, colors: ["#FBE49B", "#D4A740", "#7A5418"] },
  { id: "osterlenlegend", rule: { kind: "allChallenges" }, colors: ["#E9D5FF", "#A855F7", "#4C1D95"] },
  { id: "lightning", rule: { kind: "later" } },
];

export function findRing(id: string | null | undefined): AvatarRingDef | undefined {
  return id ? AVATAR_RINGS.find((r) => r.id === id) : undefined;
}
