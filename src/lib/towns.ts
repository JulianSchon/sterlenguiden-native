/**
 * Orter ur places.nearest_town är inte rena: ibland flera orter i samma fält
 * ("Löderup, Ravlunda och Rörum"), ibland samma ort stavad olika ("St Olof" och
 * "Sankt Olof") eller med extra blanksteg. Här görs de till en ren lista. Samma
 * regler måste användas när servern jämför en plats ort med användarens val.
 *
 * Detta är en första städning; innan lansering ska ortsnamnen i databasen
 * kontrolleras och rättas i sig.
 */

/** "  st. olof " → "Sankt olof" (versal första bokstav, ett blanksteg mellan orden) */
export function normalizeTown(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim().replace(/^st\.?\s+/i, "Sankt ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Delar upp ett fält med flera orter ("A, B och C") i separata, rena orter. */
export function splitTowns(raw: string): string[] {
  return raw.split(/,|&|\boch\b/i).map(normalizeTown).filter(Boolean);
}

/** Alla orter ur en lista fält, utan dubbletter (skiftläge ignoreras) och sorterade. */
export function uniqueTowns(rawValues: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of rawValues) {
    for (const town of splitTowns(raw)) {
      const key = town.toLowerCase();
      if (!seen.has(key)) seen.set(key, town);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "sv"));
}
