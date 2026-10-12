/**
 * Signalen från ringfirandet till Profil: "Använd ringen" sparar ringen och öppnar Profil, där
 * ringen sen faller ner över profilbilden på medlemskortet och sätter sig (SnapRing) — samma
 * princip som skatten som klistras in i samlingen efter kistan.
 *
 * requestRingSnap ges precis innan Profil öppnas. Profil lyssnar (subscribeRingSnap) och bygger om
 * medlemskortet medan firandet ännu täcker skärmen, så att ringen alltid börjar från samma läge —
 * även om kortet redan visade samma ring eller var vänt. Ett ringlager som skapas, eller får
 * ringen, medan signalen gäller spelar inklistringen, räknat från samma tidpunkt. Signalen
 * förbrukas inte; den gäller tills inklistringen hunnit spelas klart.
 */
let pending: { ringId: string; at: number } | null = null;
const listeners = new Set<() => void>();

/** Hur länge efter signalen ringen sätter sig — när firandets mörka bakgrund tonats bort */
export const RING_SNAP_DELAY = 1900;

export function requestRingSnap(ringId: string): void {
  pending = { ringId, at: Date.now() };
  listeners.forEach((listener) => listener());
}

/** Anropas när "Använd ringen" valts. Returnerar en funktion som slutar lyssna. */
export function subscribeRingSnap(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** När signalen gavs (ms) om den här ringen ska sätta sig, annars null. */
export function ringSnapAt(ringId: string | null | undefined): number | null {
  if (!pending || !ringId || pending.ringId !== ringId) return null;
  // Bara tills inklistringen hunnit spelas klart, med marginal för en sida som är sen att byggas
  if (Date.now() > pending.at + RING_SNAP_DELAY + 1500) return null;
  return pending.at;
}
