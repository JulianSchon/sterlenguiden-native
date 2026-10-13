/**
 * "Appen har lugnat ner sig efter starten." De första sekunderna efter att appen öppnats har den
 * fullt upp: platser, berättelser och profilbild hämtas, och kortens stora bakgrundsbilder avkodas
 * i förväg (CardImagePreloader). En helskärmsanimation som startar då hackar och dess bilder hinner
 * inte laddas. Det som kan visas direkt vid start (presenten för ett nytt kort) väntar därför på
 * den här signalen.
 *
 * Sätts av CardImagePreloader när den är klar; TrophyHost sätter den ändå efter en stund om den
 * aldrig kommer.
 */
import { useSyncExternalStore } from "react";

let settled = false;
const listeners = new Set<() => void>();

export function markAppSettled(): void {
  if (settled) return;
  settled = true;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAppSettled(): boolean {
  return useSyncExternalStore(subscribe, () => settled);
}
