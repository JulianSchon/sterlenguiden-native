/**
 * Kategorierna och deras färger, en enda källa.
 *
 * Varje kategori har en `screen`-färg: djup och mättad, den färg kategorin
 * "har" (sidoband på biljetter, kategorisidor). `stats` är samma nyans
 * starkt dämpad, bara för staplar och prickar i statistiken. Blanda inte
 * ihop dem. Färgerna är samma i ljust och mörkt läge, de ligger alltid över
 * bild eller i grafik.
 *
 * Mat & Dryck är vinröd och Butiker orange (Viktors val); Design & Hantverk
 * är silver.
 */
export type CategoryId =
  | "mat-dryck" | "hotell-bb" | "cafe-bageri" | "butiker"
  | "natur-upplevelser" | "aktiviteter" | "sevardheter" | "hantverk-service";

export interface CategoryDef {
  id: CategoryId;
  /** Värden i databasen som hör hit (jämförs utan hänsyn till versaler) */
  dbValues: string[];
  screen: string;
  stats: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "mat-dryck",         dbValues: ["Mat", "Mat & Dryck"],                  screen: "#881337", stats: "#9D585E" },
  { id: "hotell-bb",         dbValues: ["Hotell & B&B", "Boende"],              screen: "#312E81", stats: "#5A6A8C" },
  { id: "cafe-bageri",       dbValues: ["Café & Bageri", "Cafe & Bageri"],      screen: "#C4B280", stats: "#A3855C" },
  { id: "butiker",           dbValues: ["Butiker", "Gårdsbutik", "Shopping"],   screen: "#C2410C", stats: "#8B634B" },
  { id: "natur-upplevelser", dbValues: ["Natur", "Natur & Upplevelser", "Upplevelser"], screen: "#064E3B", stats: "#4C765A" },
  { id: "aktiviteter",       dbValues: ["Aktiviteter"],                         screen: "#0C4A6E", stats: "#56818F" },
  { id: "sevardheter",       dbValues: ["Sevärdheter", "Konst"],                screen: "#581C87", stats: "#765F95" },
  { id: "hantverk-service",  dbValues: ["Hantverk & Service", "Hantverk"],      screen: "#6B7280", stats: "#8A8F98" },
];

/** Kategorin som en databasrad hör till, eller undefined */
export function findCategory(category: string | null): CategoryDef | undefined {
  if (!category) return undefined;
  const c = category.trim().toLowerCase();
  return CATEGORIES.find((def) => def.dbValues.some((v) => v.toLowerCase() === c));
}

/** Blandar färgen mot svart (0 = oförändrad, 1 = svart), för andra änden av en gradient */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 - amount;
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
