/**
 * Kartans filter och filterlogik — samma regler som webbappens karta (native-map-full-spec.md §5),
 * plus två egna grupper: service (toaletter, laddning …) och skatter.
 *
 * Alla grupper gäller samtidigt (OCH). Inom kategorier, "Mina" och listor räcker det att en träffar
 * (ELLER); praktiskt kräver allt man valt.
 */
import type { LucideIcon } from "lucide-react-native";
import {
  Accessibility, Baby, BedDouble, CalendarCheck, CheckCircle2, Clock, Coffee, Dog, Heart, Landmark, Layers,
  Leaf, Palette, ParkingSquare, ShoppingBag, Sun, Trees, UtensilsCrossed, Wifi, Zap,
} from "lucide-react-native";
import { isPlaceOpen, type Place } from "@/hooks/usePlaces";

/** Kategorierna i kartans filter — id:na är de svenska namnen som matchas mot platsens categories */
export const MAP_CATEGORIES: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "Mat & Dryck", label: "Mat & Dryck", Icon: UtensilsCrossed },
  { id: "Café & Bageri", label: "Café & Bageri", Icon: Coffee },
  { id: "Natur", label: "Natur & Upplevelser", Icon: Trees },
  { id: "Sevärdhet", label: "Sevärdheter", Icon: Landmark },
  { id: "Hotell", label: "Hotell & B&B", Icon: BedDouble },
  { id: "Aktiviteter", label: "Aktiviteter", Icon: Zap },
  { id: "Butiker", label: "Butiker", Icon: ShoppingBag },
  { id: "Design", label: "Design & Hantverk", Icon: Palette },
];
export const ALL_CATEGORIES_ICON = Layers;

/** Underkategorier för de kategorier som har sådana (visas när exakt den kategorin är vald) */
export const SUBCATEGORIES: Record<string, { id: string; label: string }[]> = {
  Aktiviteter: [
    { id: "barn-familj", label: "Barn & Familj" },
    { id: "aventyr-sport", label: "Äventyr & Sport" },
    { id: "kultur-workshop", label: "Kultur & Workshop" },
    { id: "relax-wellness", label: "Relax & Wellness" },
  ],
  Butiker: [
    { id: "livsmedel-dagligvaror", label: "Livsmedel & Dagligvaror" },
    { id: "klader-mode", label: "Kläder & Mode" },
    { id: "hem-inredning", label: "Hem & Inredning" },
    { id: "sport-fritid", label: "Sport & Fritid" },
  ],
  Design: [
    { id: "ateljeer", label: "Ateljéer" },
    { id: "gallerier", label: "Gallerier" },
    { id: "verkstader", label: "Verkstäder" },
    { id: "inredning-livsstil", label: "Inredning & Livsstil" },
  ],
};

/** Vad underkategorin matchas mot i platsens categories (gemener, delsträng) */
const SUB_LABELS: Record<string, string> = {
  "barn-familj": "barn & familj",
  "aventyr-sport": "äventyr & sport",
  "kultur-workshop": "kultur & workshop",
  "relax-wellness": "relax & wellness",
  "livsmedel-dagligvaror": "livsmedel & dagligvaror",
  "klader-mode": "kläder & mode",
  "hem-inredning": "hem & inredning",
  "sport-fritid": "sport & fritid",
  "ateljeer": "ateljé",
  "gallerier": "galleri",
  "verkstader": "verkst",
  "inredning-livsstil": "inredning & livsstil",
};

/** Praktiskt: "öppet nu" räknas ur öppettiderna, resten är platsens egenskaper (kolumnen amenities) */
export const PRACTICAL: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "openNow", label: "Öppet nu", Icon: Clock },
  { id: "parking", label: "Parkering", Icon: ParkingSquare },
  { id: "wifi", label: "Wifi", Icon: Wifi },
  { id: "pets", label: "Hundvänligt", Icon: Dog },
  { id: "outdoor", label: "Uteservering", Icon: Sun },
  { id: "accessible", label: "Tillgänglighet", Icon: Accessibility },
  { id: "family", label: "Barnvänligt", Icon: Baby },
  { id: "vegetarian", label: "Vegetariskt", Icon: Leaf },
  { id: "ev", label: "Laddstolpe", Icon: Zap },
  { id: "booking", label: "Bokning krävs", Icon: CalendarCheck },
];

export const MINE: { id: "favorites" | "visited"; label: string; Icon: LucideIcon }[] = [
  { id: "favorites", label: "Favoriter", Icon: Heart },
  { id: "visited", label: "Besökta platser", Icon: CheckCircle2 },
];

export type TreasureMode = "all" | "unfound" | "only" | "none";
export const TREASURE_MODES: { id: TreasureMode; label: string }[] = [
  { id: "all", label: "Alla skatter" },
  { id: "unfound", label: "Ej hittade" },
  { id: "only", label: "Bara skatter" },
  { id: "none", label: "Inga skatter" },
];

export interface MapFilters {
  cats: Set<string>;
  sub: string | null;
  practical: Set<string>;
  mine: Set<"favorites" | "visited">;
  listIds: Set<string>;
  services: Set<string>;
  treasures: TreasureMode;
}

export const EMPTY_FILTERS: MapFilters = {
  cats: new Set(), sub: null, practical: new Set(), mine: new Set(), listIds: new Set(), services: new Set(), treasures: "all",
};

/** Siffran på filterknappen */
export function countFilters(f: MapFilters): number {
  return f.cats.size + (f.sub ? 1 : 0) + f.practical.size + f.mine.size + f.listIds.size + f.services.size
    + (f.treasures !== "all" ? 1 : 0);
}

export function parseAmenities(raw: unknown): Record<string, boolean> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, boolean>;
  try { return JSON.parse(raw as string); } catch { return {}; }
}

/** Platserna som syns med de valda filtren (exakt som webbens karta) */
export function filterPlaces(
  places: Place[],
  f: MapFilters,
  ctx: { favoriteIds: Set<number>; visitedIds: Set<number>; listPlaceIds: Set<number> },
): Place[] {
  const practicalKeys = [...f.practical].filter((k) => k !== "openNow");
  return places.filter((p) => {
    if (p.lat == null || p.lng == null) return false;
    const pc = (p.category ?? "").toLowerCase();
    // Kategorier: räcker att en träffar
    if (f.cats.size > 0) {
      const ok = [...f.cats].some((c) => {
        const fl = c.toLowerCase();
        const alt = fl.replace("é", "e");
        return pc.includes(fl) || pc.includes(alt) || fl.includes(pc.split(",")[0].trim());
      });
      if (!ok) return false;
    }
    // Underkategori: delsträng i categories
    if (f.sub && SUB_LABELS[f.sub] && !pc.includes(SUB_LABELS[f.sub])) return false;
    if (f.practical.has("openNow") && !isPlaceOpen(p.opening_hours as Record<string, string> | null)) return false;
    // Praktiskt: allt valt måste stämma
    if (practicalKeys.length > 0) {
      const a = parseAmenities((p as Place & { amenities?: unknown }).amenities);
      if (!practicalKeys.every((k) => a[k] === true)) return false;
    }
    // Mina: favorit ELLER besökt
    if (f.mine.size > 0) {
      const hits = [
        f.mine.has("favorites") && ctx.favoriteIds.has(p.id),
        f.mine.has("visited") && ctx.visitedIds.has(p.id),
      ];
      if (!hits.some(Boolean)) return false;
    }
    // Listor: platsen ligger i någon av de valda listorna
    if (f.listIds.size > 0 && !ctx.listPlaceIds.has(p.id)) return false;
    return true;
  });
}

/**
 * Klumpar (webbens regler): av när bara favoriter visas, av när en kategori är vald och träffarna
 * är färre än 20. Annars radie 40 px, minst 8 platser per klump, inga klumpar från zoom 14.
 */
export function clusteringOn(f: MapFilters, matches: number): boolean {
  const onlyFavorites = f.mine.size === 1 && f.mine.has("favorites") && f.cats.size === 0;
  if (onlyFavorites) return false;
  if (f.cats.size > 0 && matches < 20) return false;
  return true;
}
export const CLUSTER = { radius: 40, minPoints: 8, maxZoom: 13 };

/** Avstånd som det visas i appen: fågelvägen × 1,3 + 1 km ("3.4 km", eller heltal från 10 km) */
export function distanceLabel(birdKm: number): string {
  const km = birdKm * 1.3 + 1;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
