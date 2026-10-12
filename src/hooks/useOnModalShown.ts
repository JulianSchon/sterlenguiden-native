/**
 * Startar ett helskärmsfirandes animation först när dess Modal FAKTISKT syns på skärmen
 * (Modal.onShow), inte när komponenten skapas.
 *
 * En Modal tar en stund att visas, och längre när telefonen är upptagen (allt som ska synas byggs
 * först). Startade animationen redan när komponenten skapades kunde den hinna spelas klart innan
 * fönstret syntes — kistan stod då redan på plats i stället för att falla ner, och det varierade
 * från gång till gång. Starten sker en bildruta efter onShow; syns fönstret av någon anledning
 * aldrig rapporteras startar den ändå efter `fallbackMs`.
 *
 *   const onShow = useOnModalShown(() => { ...starta animationerna... });
 *   <Modal visible ... onShow={onShow}>
 */
import { useCallback, useEffect, useRef } from "react";

export function useOnModalShown(start: () => void, fallbackMs = 1500): () => void {
  const startRef = useRef(start);
  startRef.current = start;
  const started = useRef(false);

  const begin = useCallback(() => {
    if (started.current) return;
    started.current = true;
    requestAnimationFrame(() => startRef.current());
  }, []);

  useEffect(() => {
    const t = setTimeout(begin, fallbackMs);
    return () => clearTimeout(t);
  }, [begin, fallbackMs]);

  return begin;
}
