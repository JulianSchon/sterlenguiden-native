/**
 * Delat "material" för Polaroid-pappret — samma papper, samma tejp, samma taggsax-kant, i två
 * skalor: Mitt Österlens förhandsvisningskort (liten, lutande, i en rad) och minnets egen sida
 * (stor, stillastående hero). Legat som en egen funktion/färguppsättning i stället för att
 * dupliceras i båda filerna.
 */

export const POLAROID_PAPER = "#F0E9D8";
export const POLAROID_TAPE = "rgba(216,194,156,0.62)";

/** En rektangel som en SVG-polygon, med valfria kanter sicksackade (taggsax-klippta) och
 * resten raka. `edges` = [topp, höger, botten, vänster]. Vandrar runt alla fyra kanterna och
 * växlar — när en kant är taggig — mellan ytterlinjen och en punkt indragen `tooth` px, så det
 * blir en kontinuerlig taggig linje, inte bara hack i var och varannan punkt. Används både för
 * fotots egen kant (alla fyra sicksackade, som ett gammalt framkallat foto) och tejpbitens
 * kortsidor (bara kortsidorna rivna, långsidorna raka — som på riktig tejp). */
export function tornRectPoints(w: number, h: number, tooth: number, segment: number, edges: [boolean, boolean, boolean, boolean]): string {
  const pts: string[] = [];
  const walk = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number, jagged: boolean) => {
    if (!jagged) { pts.push(`${x2.toFixed(1)},${y2.toFixed(1)}`); return; }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const n = Math.max(4, Math.round(len / segment));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const inward = i % 2 === 1;
      const x = x1 + dx * t + (inward ? nx * tooth : 0);
      const y = y1 + dy * t + (inward ? ny * tooth : 0);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
  };
  walk(0, 0, w, 0, 0, 1, edges[0]);   // övre kanten, inåt = nedåt
  walk(w, 0, w, h, -1, 0, edges[1]);  // högra kanten, inåt = vänster
  walk(w, h, 0, h, 0, -1, edges[2]);  // nedre kanten, inåt = uppåt
  walk(0, h, 0, 0, 1, 0, edges[3]);   // vänstra kanten, inåt = höger
  return pts.join(" ");
}
