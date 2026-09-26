/**
 * Rivkanten: en hackig linje som används både på bandet som rivs loss (OfferDrawer) och på
 * kanten som blir kvar på biljetten i listan, så de två ser ut att passa ihop.
 */
import { Skia, type SkPath } from "@shopify/react-native-skia";

export const TEAR_TEETH = 16;
export const TEAR_DEPTH = 5;      // hur djupa tänderna är
export const TEAR_FRINGE = 0.9;   // bredden på den vita papperskanten på bandet
export const EDGE_STROKE = 1;     // linjetjockleken på kanten som blir kvar på biljetten

// Olika djup på tänderna så det ser riktigt riv ut och inte som en sågkant
const JAGS = [0.9, 0.4, 1, 0.55, 0.8, 0.3, 1, 0.65];

/**
 * Bandets form. Högerkanten är motstycket till den kant som blir kvar på biljetten (samma tänder,
 * samma kurvor), så bandet passar i den när det sätts tillbaka: där biljetten saknar bild sticker
 * bandet ut. `amp` 0 ger en rak kant, `edgeOut` är hur långt utanför den raka kanten linjen ligger,
 * `inset` flyttar kanten inåt (den vita kantens bredd). `progress` (0–1) är hur långt rivningen
 * kommit: den går underifrån och uppåt, så tänderna dyker upp från botten och vidare upp.
 */
export function tornBandPath(w: number, h: number, amp: number, inset: number, progress: number, edgeOut: number): SkPath {
  "worklet";
  const path = Skia.Path.Make();
  path.moveTo(0, 0);
  path.lineTo(w + edgeOut - inset, 0);
  let prevX = w + edgeOut - inset;
  for (let i = 1; i <= TEAR_TEETH; i++) {
    const y = (h * i) / TEAR_TEETH;
    const torn = Math.min(1, Math.max(0, progress * TEAR_TEETH - (TEAR_TEETH - i) + 1));
    const x = w + edgeOut - inset + (i % 2 === 1 ? amp * JAGS[i % JAGS.length] * torn : 0);
    // Kurva i stället för rak linje: kanten blir böljande som rivet papper, inte en sågkant
    path.quadTo(prevX, y - h / TEAR_TEETH / 2, x, y);
    prevX = x;
  }
  path.lineTo(0, h);
  path.close();
  return path;
}

/**
 * Papperskanten som blir kvar på biljettens vänstra sida när bandet rivits bort: en tunn, böljande
 * linje (ritas som streck, inte som fylld yta, annars blir det en vit klump). `amt` (0–1) är hur
 * mycket rivkant som syns och `progress` hur långt rivningen kommit; båda styrs av bandets
 * animation (OfferDrawer), så kanten på biljetten och på bandet alltid följer varandra, även när
 * bandet sätts tillbaka och kanten rätas ut.
 */
export function tornEdgeLine(h: number, amt: number, progress: number): SkPath {
  "worklet";
  const path = Skia.Path.Make();
  const base = EDGE_STROKE * amt;
  path.moveTo(base, 0);
  let prevX = base;
  for (let i = 1; i <= TEAR_TEETH; i++) {
    const y = (h * i) / TEAR_TEETH;
    const torn = Math.min(1, Math.max(0, progress * TEAR_TEETH - (TEAR_TEETH - i) + 1));
    const x = base + (i % 2 === 1 ? TEAR_DEPTH * amt * JAGS[i % JAGS.length] * torn : 0);
    path.quadTo(prevX, y - h / TEAR_TEETH / 2, x, y);
    prevX = x;
  }
  return path;
}

/** Ytan till vänster om rivkanten: den del av bilden som satt på "fel" sida och ska bort (fylls med sidans bakgrund) */
export function tornCutRegion(h: number, amt: number, progress: number): SkPath {
  "worklet";
  const path = tornEdgeLine(h, amt, progress);
  path.lineTo(0, h);
  path.lineTo(0, 0);
  path.close();
  return path;
}
