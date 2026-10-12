/**
 * Signalen från ringfirandet till Profil: "Använd ringen" sparar ringen och öppnar Profil, där
 * ringen sen faller ner över profilbilden på medlemskortet och sätter sig (SnapRing) — samma
 * princip som skatten som klistras in i samlingen efter kistan.
 *
 * requestRingSnap sätts precis innan Profil öppnas. Signalen FÖRBRUKAS INTE: varje SnapRing som
 * visar den ringen medan signalen gäller spelar inklistringen, räknat från samma tidpunkt. (När
 * den förbrukades kunde en gammal, osynlig kopia av Profil — kvar i navigeringen — ta den, och
 * den kopia man faktiskt såg fick ringen utan animation.) Gäller bara tills inklistringen spelats.
 */
let pending: { ringId: string; at: number } | null = null;

/** Hur länge efter signalen ringen sätter sig — när firandets mörka bakgrund tonats bort */
export const RING_SNAP_DELAY = 1900;

export function requestRingSnap(ringId: string): void {
  pending = { ringId, at: Date.now() };
}

/** När signalen gavs (ms) om den här ringen ska sätta sig, annars null. */
export function ringSnapAt(ringId: string | null | undefined): number | null {
  if (!pending || !ringId || pending.ringId !== ringId) return null;
  // Bara tills inklistringen hunnit spelas klart
  if (Date.now() > pending.at + RING_SNAP_DELAY + 600) return null;
  return pending.at;
}

let buzzedFor: number | null = null;

/** Bara första kopian som landar vibrerar — spelas inklistringen i två kopior av Profil samtidigt
 * ska telefonen ändå bara vibrera en gång. */
export function claimSnapBuzz(at: number): boolean {
  if (buzzedFor === at) return false;
  buzzedFor = at;
  return true;
}
