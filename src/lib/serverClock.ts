/**
 * Serverns klocka i appen — så att erbjudandets nedräkning och klockan på medlemskortets baksida
 * inte går att lura genom att ställa om telefonens klocka.
 *
 * Varje gång servern berättar vad klockan är (vid en aktivering, och när appen startar eller
 * kommer tillbaka från bakgrunden) sparas den tiden tillsammans med en monoton tidmätare
 * (performance.now), som bara räknar uppåt och inte påverkas om man ändrar klockan i
 * inställningarna. serverNow() = serverns senaste tid + hur lång tid som gått sedan dess.
 * Innan servern hörts av används telefonens klocka.
 */
let anchor: { serverMs: number; mono: number } | null = null;

export function syncServerClock(serverMs: number): void {
  anchor = { serverMs, mono: performance.now() };
}

export function serverNow(): number {
  return anchor ? anchor.serverMs + (performance.now() - anchor.mono) : Date.now();
}
