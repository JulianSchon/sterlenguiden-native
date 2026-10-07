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
import {
  UtensilsCrossed, Hotel, Coffee, ShoppingBag, TreePine, Target, Landmark, Palette, type LucideIcon,
} from "lucide-react-native";

export type CategoryId =
  | "mat-dryck" | "hotell-bb" | "cafe-bageri" | "butiker"
  | "natur-upplevelser" | "aktiviteter" | "sevardheter" | "hantverk-service";

export interface CategoryDef {
  id: CategoryId;
  /** Värden i databasen som hör hit (jämförs utan hänsyn till versaler) */
  dbValues: string[];
  /** Det officiella visningsnamnet, samma text och ordning överallt i appen (kategorisidor, Lägg till plats-arket) */
  label: string;
  screen: string;
  stats: string;
  icon: LucideIcon;
}

/** Ordningen här ÄR appens officiella kategoriordning — allt som listar kategorier (Lägg till
 * plats-arkets sidor m.fl.) använder den här ordningen rakt av, inte en egen. */
export const CATEGORIES: CategoryDef[] = [
  { id: "mat-dryck",         dbValues: ["Mat", "Mat & Dryck"],                  label: "Mat & Dryck",         screen: "#881337", stats: "#9D585E", icon: UtensilsCrossed },
  { id: "hotell-bb",         dbValues: ["Hotell & B&B", "Boende"],              label: "Hotell & B&B",        screen: "#312E81", stats: "#5A6A8C", icon: Hotel },
  { id: "cafe-bageri",       dbValues: ["Café & Bageri", "Cafe & Bageri"],      label: "Café & Bageri",       screen: "#C4B280", stats: "#A3855C", icon: Coffee },
  { id: "butiker",           dbValues: ["Butiker", "Gårdsbutik", "Shopping"],   label: "Butiker",              screen: "#C2410C", stats: "#8B634B", icon: ShoppingBag },
  { id: "natur-upplevelser", dbValues: ["Natur", "Natur & Upplevelser", "Upplevelser"], label: "Natur & Upplevelser", screen: "#064E3B", stats: "#4C765A", icon: TreePine },
  { id: "aktiviteter",       dbValues: ["Aktiviteter"],                         label: "Aktiviteter",         screen: "#0C4A6E", stats: "#56818F", icon: Target },
  { id: "sevardheter",       dbValues: ["Sevärdheter", "Konst"],                label: "Sevärdheter",         screen: "#581C87", stats: "#765F95", icon: Landmark },
  { id: "hantverk-service",  dbValues: ["Hantverk & Service", "Hantverk"],      label: "Design & Hantverk",   screen: "#6B7280", stats: "#8A8F98", icon: Palette },
];

/** Kategorin som en databasrad hör till, eller undefined */
export function findCategory(category: string | null): CategoryDef | undefined {
  if (!category) return undefined;
  const c = category.trim().toLowerCase();
  return CATEGORIES.find((def) => def.dbValues.some((v) => v.toLowerCase() === c));
}

/** Biljettens sidoband: kategorins färg mot en mörkare ton, guld för okänd kategori */
export function ticketColors(category: string | null): [string, string] {
  const base = findCategory(category)?.screen ?? "#D4A84F";
  return [base, shade(base, 0.4)];
}

/** Färgen som rgba-sträng med genomskinlighet (Skia och React Native tar inte hex med alfa på samma sätt) */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Blandar färgen mot svart (0 = oförändrad, 1 = svart), för andra änden av en gradient */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 - amount;
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Blandar färgen mot vitt (0 = oförändrad, 1 = vitt) — shade()s motsats. En mörk, dov bottenfärg
 * (t.ex. Skog eller Hav bland Österlenpassets kortvarianter) ser knappt ut att glöda alls som en
 * halvgenomskinlig fläck av sin egen färg mot en nästan svart bakgrund, oavsett opacitet — en
 * bländning behöver lyftas MOT vitt för att faktiskt läsas som ljus.
 * Returnerar HEX (till skillnad från shade()) — måste kunna gå rakt in i withAlpha(), som bara
 * förstår "#rrggbb" (en "rgb(...)"-sträng parsar den tyst till NaN → osynligt svart). */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(c + (255 - c) * amount);
  };
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(ch(16))}${toHex(ch(8))}${toHex(ch(0))}`;
}
