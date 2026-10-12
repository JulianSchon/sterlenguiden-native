/**
 * Signalen från ett belöningsfirande till Profil: "Använd ringen" / "Använd kortet" sparar valet och
 * öppnar Profil, där belöningen sen sätter sig på medlemskortet — ringen faller ner över
 * profilbilden (SnapRing), det nya kortet landar på sin plats (CardReveal). Samma princip som
 * skatten som klistras in i samlingen efter kistan.
 *
 * requestProfileReveal ges precis innan Profil öppnas. Profil lyssnar (subscribeProfileReveal) och
 * bygger om medlemskortet medan firandet ännu täcker skärmen, så att belöningen alltid börjar från
 * samma läge — även om kortet redan visade samma ring, var vänt eller låg utanför skärmen. Det som
 * skapas, eller får den nya ringen/designen, medan signalen gäller spelar inklistringen, räknat
 * från samma tidpunkt. Signalen förbrukas inte; den gäller tills inklistringen hunnit spelas klart.
 */
export type RevealKind = "ring" | "card";

let pending: { kind: RevealKind; id: string; at: number } | null = null;
const listeners = new Set<() => void>();

/** Hur länge efter signalen belöningen sätter sig — när firandets mörka bakgrund tonats bort */
export const REVEAL_DELAY = 1900;

export function requestProfileReveal(kind: RevealKind, id: string): void {
  pending = { kind, id, at: Date.now() };
  listeners.forEach((listener) => listener());
}

/** Anropas när "Använd …" valts. Returnerar en funktion som slutar lyssna. */
export function subscribeProfileReveal(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** När signalen gavs (ms) om den här ringen/designen ska sätta sig, annars null. */
export function revealAt(kind: RevealKind, id: string | null | undefined): number | null {
  if (!pending || !id || pending.kind !== kind || pending.id !== id) return null;
  // Bara tills inklistringen hunnit spelas klart, med marginal för en sida som är sen att byggas
  if (Date.now() > pending.at + REVEAL_DELAY + 1500) return null;
  return pending.at;
}
