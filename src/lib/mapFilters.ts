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
import i18n from "i18next";

/** Kategorierna i kartans filter — id:na är de svenska namnen som matchas mot platsens categories */
// Namnet är samma som appens kategori (categories.*), på appens språk
const mapCat = (id: string, cat: string, Icon: LucideIcon) => ({ id, Icon, get label() { return i18n.t(`categories.${cat}` as "categories.place"); } });
export const MAP_CATEGORIES: { id: string; readonly label: string; Icon: LucideIcon }[] = [
  mapCat("Mat & Dryck", "mat-dryck", UtensilsCrossed),
  mapCat("Café & Bageri", "cafe-bageri", Coffee),
  mapCat("Natur", "natur-upplevelser", Trees),
  mapCat("Sevärdhet", "sevardheter", Landmark),
  mapCat("Hotell", "hotell-bb", BedDouble),
  mapCat("Aktiviteter", "aktiviteter", Zap),
  mapCat("Butiker", "butiker", ShoppingBag),
  mapCat("Design", "hantverk-service", Palette),
];
export const ALL_CATEGORIES_ICON = Layers;

/** Underkategorier för de kategorier som har sådana (visas när exakt den kategorin är vald) */
const sub = (id: string) => ({ id, get label() { return i18n.t(`map.sub.${id}` as "map.sub.barn-familj"); } });
export const SUBCATEGORIES: Record<string, { id: string; readonly label: string }[]> = {
  Aktiviteter: [sub("barn-familj"), sub("aventyr-sport"), sub("kultur-workshop"), sub("relax-wellness")],
  Butiker: [sub("livsmedel-dagligvaror"), sub("klader-mode"), sub("hem-inredning"), sub("sport-fritid")],
  Design: [sub("ateljeer"), sub("gallerier"), sub("verkstader"), sub("inredning-livsstil")],
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
// Samma namn som Söks egenskaper (search.practical.*); "öppet nu" och "bokning" är kartans egna
const practical = (id: string, Icon: LucideIcon, key: string) => ({ id, Icon, get label() { return i18n.t(key as "map.practical.openNow"); } });
export const PRACTICAL: { id: string; readonly label: string; Icon: LucideIcon }[] = [
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

export type TreasureMode = "all" | "unfound" | "only" | "none";
const mode = (id: TreasureMode) => ({ id, get label() { return i18n.t(`map.treasureModes.${id}`); } });
export const TREASURE_MODES: { id: TreasureMode; readonly label: string }[] = [mode("all"), mode("unfound"), mode("only"), mode("none")];

export interface MapFilters {
  cats: Set<string>;
  sub: string | null;
  practical: Set<string>;
  mine: Set<"favorites" | "visited">;
  listIds: Set<string>;
  /** Serviceläget: den typ som visas (då visas inget annat), eller null */
  service: string | null;
  treasures: TreasureMode;
}

export const EMPTY_FILTERS: MapFilters = {
  cats: new Set(), sub: null, practical: new Set(), mine: new Set(), listIds: new Set(), service: null, treasures: "all",
};

/** Siffran på filterknappen */
export function countFilters(f: MapFilters): number {
  if (f.service) return 1;
  return f.cats.size + (f.sub ? 1 : 0) + f.practical.size + f.mine.size + f.listIds.size
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
