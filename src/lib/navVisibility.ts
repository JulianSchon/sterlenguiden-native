/**
 * Navigeringen nere kan gömmas medan något täcker sidan (kartans filterark): den glider ner och
 * kommer tillbaka när arket stängs.
 *
 *   setNavHidden(true) … setNavHidden(false)
 */
import { useSyncExternalStore } from "react";

let hidden = false;
const listeners = new Set<() => void>();

export function setNavHidden(next: boolean) {
  if (next === hidden) return;
  hidden = next;
  listeners.forEach((l) => l());
}

export function useNavHidden() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => hidden,
  );
}
