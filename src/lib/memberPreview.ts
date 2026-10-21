/**
 * Bara i testversionen (__DEV__): visa appen som om man inte vore medlem, utan att röra kontot.
 * Så kan man se köpsidan, det låsta kortet och erbjudandena som en ny användare ser dem. I den
 * riktiga appen finns brytaren inte, och värdet är alltid av.
 */
import { useSyncExternalStore } from "react";

let previewNonMember = false;
const listeners = new Set<() => void>();

export function setPreviewNonMember(on: boolean): void {
  if (!__DEV__) return;
  previewNonMember = on;
  listeners.forEach((listener) => listener());
}

export function usePreviewNonMember(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => __DEV__ && previewNonMember,
  );
}
