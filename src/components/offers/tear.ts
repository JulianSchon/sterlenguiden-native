/**
 * Rivkanten: en hackig linje som används både på bandet som rivs loss (OfferDrawer) och på
 * kanten som blir kvar på biljetten i listan, så de två ser ut att passa ihop.
 */
import { Skia, type SkPath } from "@shopify/react-native-skia";

export const TEAR_TEETH = 16;
export const TEAR_DEPTH = 5;      // hur djupa tänderna är
export const TEAR_FRINGE = 1.5;   // bredden på den vita papperskanten

// Olika djup på tänderna så det ser riktigt riv ut och inte som en sågkant
const JAGS = [0.9, 0.4, 1, 0.55, 0.8, 0.3, 1, 0.65];

/**
 * Bandets form med hackig högerkant. `amp` 0 ger en rak kant. `inset` flyttar kanten inåt (den vita
 * kantens bredd). `progress` (0–1) är hur långt rivningen kommit: den går underifrån och uppåt,
 * så tänderna dyker upp från botten och vidare upp.
 */
export function tornBandPath(w: number, h: number, amp: number, inset: number, progress: number): SkPath {
  "worklet";
  const path = Skia.Path.Make();
  path.moveTo(0, 0);
  path.lineTo(w - inset, 0);
  let prevX = w - inset;
  for (let i = 1; i <= TEAR_TEETH; i++) {
    const y = (h * i) / TEAR_TEETH;
    const torn = Math.min(1, Math.max(0, progress * TEAR_TEETH - (TEAR_TEETH - i) + 1));
    const x = w - inset - (i % 2 === 1 ? amp * JAGS[i % JAGS.length] * torn : 0);
    // Kurva i stället för rak linje: kanten blir böljande som rivet papper, inte en sågkant
    path.quadTo(prevX, y - h / TEAR_TEETH / 2, x, y);
    prevX = x;
  }
  path.lineTo(0, h);
  path.close();
  return path;
}

/** Den vita, hackiga papperskanten som blir kvar på biljettens vänstra sida när bandet rivits bort */
export function tornEdgePath(h: number): SkPath {
  const path = Skia.Path.Make();
  path.moveTo(0, 0);
  path.lineTo(TEAR_FRINGE, 0);
  let prevX = TEAR_FRINGE;
  for (let i = 1; i <= TEAR_TEETH; i++) {
    const y = (h * i) / TEAR_TEETH;
    const x = TEAR_FRINGE + (i % 2 === 1 ? TEAR_DEPTH * JAGS[i % JAGS.length] : 0);
    path.quadTo(prevX, y - h / TEAR_TEETH / 2, x, y);
    prevX = x;
  }
  path.lineTo(0, h);
  path.close();
  return path;
}
