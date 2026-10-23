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
import i18n from "i18next";
import {
  UtensilsCrossed, Hotel, Coffee, ShoppingBag, TreePine, Target, Landmark, Palette, type LucideIcon,
} from "lucide-react-native";

export type CategoryId =
  | "mat-dryck" | "hotell-bb" | "cafe-bageri" | "butiker"
  | "natur-upplevelser" | "aktiviteter" | "sevardheter" | "hantverk-service";

interface CategoryDef {
  id: CategoryId;
  /** Värden i databasen som hör hit (jämförs utan hänsyn till versaler) */
  dbValues: string[];
  /** Det officiella visningsnamnet på användarens språk, samma text överallt i appen */
  readonly label: string;
  screen: string;
  stats: string;
  icon: LucideIcon;
}

/** Ordningen här ÄR appens officiella kategoriordning — allt som listar kategorier (Lägg till
 * plats-arkets sidor m.fl.) använder den här ordningen rakt av, inte en egen. */
export const CATEGORIES: CategoryDef[] = [
  { id: "mat-dryck",         dbValues: ["Mat", "Mat & Dryck"],                  get label() { return i18n.t("categories.mat-dryck"); }, screen: "#881337", stats: "#9D585E", icon: UtensilsCrossed },
  { id: "hotell-bb",         dbValues: ["Hotell & B&B", "Boende"],              get label() { return i18n.t("categories.hotell-bb"); }, screen: "#312E81", stats: "#5A6A8C", icon: Hotel },
  { id: "cafe-bageri",       dbValues: ["Café & Bageri", "Cafe & Bageri"],      get label() { return i18n.t("categories.cafe-bageri"); }, screen: "#C4B280", stats: "#A3855C", icon: Coffee },
  { id: "butiker",           dbValues: ["Butiker", "Gårdsbutik", "Shopping"],   get label() { return i18n.t("categories.butiker"); },screen: "#C2410C", stats: "#8B634B", icon: ShoppingBag },
  { id: "natur-upplevelser", dbValues: ["Natur", "Natur & Upplevelser", "Upplevelser"], get label() { return i18n.t("categories.natur-upplevelser"); },screen: "#064E3B", stats: "#4C765A", icon: TreePine },
  { id: "aktiviteter",       dbValues: ["Aktiviteter"],                         get label() { return i18n.t("categories.aktiviteter"); },screen: "#0C4A6E", stats: "#56818F", icon: Target },
  { id: "sevardheter",       dbValues: ["Sevärdheter", "Konst"],                get label() { return i18n.t("categories.sevardheter"); },screen: "#581C87", stats: "#765F95", icon: Landmark },
  { id: "hantverk-service",  dbValues: ["Hantverk & Service", "Hantverk"],      get label() { return i18n.t("categories.hantverk-service"); },screen: "#6B7280", stats: "#8A8F98", icon: Palette },
];

/** Hur kategorin skrivs i databasen (places.categories) när ett företag själv väljer den */
export const CATEGORY_DB_VALUE: Record<CategoryId, string> = {
  "mat-dryck": "Mat & Dryck",
  "hotell-bb": "Hotell & B&B",
  "cafe-bageri": "Café & Bageri",
  "butiker": "Butiker",
  "natur-upplevelser": "Natur & Upplevelser",
  "aktiviteter": "Aktiviteter",
  "sevardheter": "Sevärdheter",
  "hantverk-service": "Hantverk & Service",
};

/**
 * Underkategorierna, som de skrivs i databasen (places.sub_category, flera med komma). Det är
 * dem företagen väljer bland i Mitt företag.
 */
export const SUBCATEGORIES: Record<CategoryId, string[]> = {
  "mat-dryck": ["Fine Dining", "Casual", "Pizza", "Streetfood", "Pub & Bar"],
  "hotell-bb": ["Hotell", "B&B", "Spa"],
  "cafe-bageri": ["Café", "Bageri", "Glass", "Trädgård", "Snabbt"],
  "butiker": ["Livsmedel & Dagligvaror", "Kläder & Mode", "Hem & Inredning", "Sport & Fritid"],
  "natur-upplevelser": ["Stränder", "Vandring", "Utsikt", "Djur", "Spa"],
  "aktiviteter": ["Sport", "Barn", "Hälsa", "Spa"],
  "sevardheter": ["Historia", "Museum", "Konst", "Kyrkor"],
  "hantverk-service": ["Ateljéer", "Gallerier", "Verkstäder", "Inredning & Livsstil"],
};

/** Kategorin som en databasrad hör till, eller undefined */
export function findCategory(category: string | null): CategoryDef | undefined {
  if (!category) return undefined;
  const match = (c: string) => CATEGORIES.find((def) => def.dbValues.some((v) => v.toLowerCase() === c));
  const whole = match(category.trim().toLowerCase());
  if (whole) return whole;
  // Flera kategorier ("Mat & Dryck, Café & Bageri"): den första som finns gäller
  for (const part of category.split(",")) {
    const hit = match(part.trim().toLowerCase());
    if (hit) return hit;
  }
  return undefined;
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
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 - amount;
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
