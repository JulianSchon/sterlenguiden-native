/**
 * Nät: känna igen fel som beror på att nätet saknas (inte att servern sa nej), och säga till om
 * det på ett ställe (OfflineNotice). Appen vet inte i förväg att nätet är borta — det märks när ett
 * anrop misslyckas.
 */

/** Felet beror på att nätet saknas eller inte svarar */
export function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const message = typeof e === "string" ? e : String((e as { message?: unknown }).message ?? "");
  const status = (e as { status?: unknown }).status;
  return status === 0
    || /network request failed|failed to fetch|network ?error|timed? ?out|internet connection|offline|load failed/i.test(message);
}

type Listener = () => void;
const listeners = new Set<Listener>();
let lastShown = 0;

/** Visa "Du är utan nät" (högst en gång per några sekunder, även om flera saker misslyckas samtidigt) */
export function notifyOffline(): void {
  const now = Date.now();
  if (now - lastShown < 4000) return;
  lastShown = now;
  listeners.forEach((l) => l());
}

export function onOffline(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
