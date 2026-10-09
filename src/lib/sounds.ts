/**
 * Belöningsljuden — en enda plats som alla belöningsögonblick anropar (stämpeln, siffrorna som
 * rullar, milstolpar, hålla-inne-knappen). Ljud gör en belöning dubbelt så "saftig" när det
 * sitter i exakt samma ögonblick som vibrationen och animationen.
 *
 * TILLS VIDARE TYST: appen har ingen ljudmodul inbyggd i dev-clienten än (expo-audio är en native
 * modul — att importera den innan nästa EAS-build kraschar hela appen vid start, se
 * pending_eas_build_features). Alla anrop finns redan på rätt ställen; vid nästa build fylls
 * bara den här funktionen i med expo-audio och ljudfilerna, ingenting annat behöver ändras.
 */
export type SoundName =
  | "holdComplete" | "stamp" | "tick" | "milestone" | "welcomeBack"
  /** En stapel som fylls (stigande ton) */
  | "fill"
  /** Man går om någon i topplistan */
  | "climb";

export function playSound(_name: SoundName): void {
  // Medvetet tom tills expo-audio finns i dev-clienten (nästa EAS-build).
}
