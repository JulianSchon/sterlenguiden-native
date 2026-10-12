/**
 * Signalen från ringfirandet till Profil: "Använd ringen" sparar ringen och öppnar Profil, där
 * ringen sen faller ner över profilbilden på medlemskortet och sätter sig (SnapRing) — samma
 * princip som skatten som klistras in i samlingen efter kistan.
 *
 * requestRingSnap sätts precis innan Profil öppnas; SnapRing tar signalen när ringen dyker upp
 * på kortet. Gäller bara en kort stund, så en gammal signal aldrig spelas långt senare.
 */
let pending: { ringId: string; at: number } | null = null;

/** Hur länge efter signalen ringen sätter sig — när firandets mörka bakgrund tonats bort */
export const RING_SNAP_DELAY = 1900;

export function requestRingSnap(ringId: string): void {
  pending = { ringId, at: Date.now() };
}

/** Om ringen ska sätta sig nu: när signalen gavs (ms), annars null. Signalen förbrukas. */
export function takeRingSnap(ringId: string | null | undefined): number | null {
  if (!pending || !ringId || pending.ringId !== ringId || Date.now() - pending.at > 8000) return null;
  const at = pending.at;
  pending = null;
  return at;
}
