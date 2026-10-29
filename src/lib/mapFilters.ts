/**
 * Kartans filter och filterlogik — samma regler som webbappens karta (native-map-full-spec.md §5),
 * plus två egna grupper: service (toaletter, laddning …) och skatter.
 *
 * Alla grupper gäller samtidigt (OCH). Inom kategorier, "Mina" och listor räcker det att en träffar
 * (ELLER); praktiskt kräver allt man valt.
 *
 * Service är ett eget läge: väljer man en typ (en i taget) visar kartan bara den — inga platser
 * eller skatter. De andra filtren ligger kvar och gäller igen när man lämnar serviceläget.
 */
import type { LucideIcon } from "lucide-react-native";
import { decimal } from "@/i18n/numbers";
import {
  Accessibility, Baby, BedDouble, CalendarCheck, CheckCircle2, Clock, Coffee, Dog, Heart, Landmark, Layers,
  Leaf, Palette, ParkingSquare, ShoppingBag, Sun, Trees, UtensilsCrossed, Wifi, Zap,
} from "lucide-react-native";
import { isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { findCategory, type CategoryId } from "@/theme/categories";
import i18n from "i18next";

/** Kategorierna i kartans filter (appens kategorier, i kartans ordning), namnen på appens språk */
const mapCat = (id: CategoryId, Icon: LucideIcon) => ({ id, Icon, get label() { return i18n.t(`categories.${id}`); } });
export const MAP_CATEGORIES: { id: CategoryId; readonly label: string; Icon: LucideIcon }[] = [
  mapCat("mat-dryck", UtensilsCrossed),
  mapCat("cafe-bageri", Coffee),
  mapCat("natur-upplevelser", Trees),
  mapCat("sevardheter", Landmark),
  mapCat("hotell-bb", BedDouble),
  mapCat("aktiviteter", Zap),
  mapCat("butiker", ShoppingBag),
  mapCat("hantverk-service", Palette),
];
export const ALL_CATEGORIES_ICON = Layers;


/** Vad underkategorin matchas mot i platsens categories (gemener, delsträng) */
/** Praktiskt: "öppet nu" räknas ur öppettiderna, resten är platsens egenskaper (kolumnen amenities) */
// Samma namn som Söks egenskaper (search.practical.*); "öppet nu" och "bokning" är kartans egna
const practical = (id: string, Icon: LucideIcon, labelKey: string) => ({ id, Icon, labelKey, get label() { return i18n.t(labelKey as "map.practical.openNow"); } });
export const PRACTICAL: { id: string; readonly label: string; labelKey: string; Icon: LucideIcon }[] = [
  practical("openNow", Clock, "map.practical.openNow"),
  practical("parking", ParkingSquare, "search.practical.parking"),
  practical("wifi", Wifi, "search.practical.wifi"),
  practical("pets", Dog, "search.practical.pets"),
  practical("outdoor", Sun, "search.practical.outdoor"),
  practical("accessible", Accessibility, "search.practical.accessible"),
  practical("family", Baby, "search.practical.family"),
  practical("vegetarian", Leaf, "search.practical.vegetarian"),
  practical("ev", Zap, "search.practical.ev"),
  practical("booking", CalendarCheck, "map.practical.booking"),
];

export const MINE: { id: "favorites" | "visited"; readonly label: string; Icon: LucideIcon }[] = [
  { id: "favorites", Icon: Heart, get label() { return i18n.t("map.mine.favorites"); } },
  { id: "visited", Icon: CheckCircle2, get label() { return i18n.t("map.mine.visited"); } },
];


export interface MapFilters {
  cats: Set<CategoryId>;
  /** Underkategorin (värdet i databasen, t.ex. "Barn") — bara när exakt en kategori är vald */
  sub: string | null;
  practical: Set<string>;
  mine: Set<"favorites" | "visited">;
  listIds: Set<string>;
  /** Serviceläget: den typ som visas (då visas inget annat), eller null */
  service: string | null;
  /** Skatterna syns på kartan (på eller av) */
  treasures: boolean;
}

export const EMPTY_FILTERS: MapFilters = {
  cats: new Set(), sub: null, practical: new Set(), mine: new Set(), listIds: new Set(), service: null, treasures: true,
};

/** Siffran på filterknappen */
export function countFilters(f: MapFilters): number {
  if (f.service) return 1;
  return f.cats.size + (f.sub ? 1 : 0) + f.practical.size + f.mine.size + f.listIds.size
    + (f.treasures ? 0 : 1);
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
    // Kategorier: räcker att en av platsens kategorier är vald
    if (f.cats.size > 0) {
      const parts = (p.category ?? "").split(",");
      if (!parts.some((part) => { const id = findCategory(part)?.id; return !!id && f.cats.has(id); })) return false;
    }
    // Underkategori: samma värden som Mitt företag sparar (places.sub_category)
    if (f.sub) {
      const subs = (p.sub_category ?? "").split(",").map((x) => x.trim().toLowerCase());
      if (!subs.includes(f.sub.toLowerCase())) return false;
    }
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
 * Klumpar: nålar som skulle hamna nästan ovanpå varandra slås ihop (redan två räcker), så kartan
 * aldrig blir högar av nålar. Radien är i skärmpunkter — en nål är 24 bred, loggorna 40. Från
 * zoom 17 visas allt som enskilda nålar.
 */
export const CLUSTER = { radius: 28, logoRadius: 46, minPoints: 2, maxZoom: 16 };

/** Avstånd som det visas i appen: fågelvägen × 1,3 + 1 km ("3,4 km", eller heltal från 10 km) */
export function distanceLabel(birdKm: number): string {
  const km = birdKm * 1.3 + 1;
  return km < 10 ? `${decimal(km)} km` : `${Math.round(km)} km`;
}
