/**
 * Event öppnas alltid i panelen (EventSheet), aldrig som en egen sida — platser är sidor,
 * evenemang är paneler. Panelen finns EN gång, i appens rot (EventSheetHost), och vilken sida som
 * helst öppnar den med openEvent().
 *
 *   openEvent(event.id, { event })                       // visar direkt det man redan har
 *   openEvent(id, { saved, onToggleSave })               // sidan sköter sparat-läget själv (Kalender)
 */
import { useSyncExternalStore } from "react";
import type { Event } from "@/hooks/useEvents";

export interface EventSheetRequest {
  id: number;
  /** Eventet om sidan redan har det — panelen visas då direkt, utan att vänta på servern */
  event?: Event;
  /** Sidans eget sparat-läge och knapp (annars sparar panelen själv) */
  saved?: boolean;
  onToggleSave?: (id: number) => void;
  /** Bara för att skilja två öppningar av samma event åt */
  key: number;
}

let current: EventSheetRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openEvent(id: number, opts: Omit<EventSheetRequest, "id" | "key"> = {}) {
  current = { id, ...opts, key: Date.now() };
  emit();
}

export function closeEvent() {
  current = null;
  emit();
}

export function useEventSheetRequest() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => current,
  );
}
