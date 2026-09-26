/**
 * Platskategorierna med färg och ikon, och hur mycket av varje kategori användaren besökt.
 * Delas av Statistik och Profil så att de aldrig visar olika siffror. Samma dbValues som
 * app/category/[categoryId].tsx.
 */
import type { ComponentType } from "react";
import { UtensilsCrossed, Coffee, Hotel, ShoppingBag, TreePine, Target, Landmark, Palette } from "lucide-react-native";
import type { Place } from "@/hooks/usePlaces";

export interface StatCategory {
  id: string;
  label: string;
  color: string;
  Icon: ComponentType<any>;
  dbValues: string[];
}

export const STAT_CATEGORIES: StatCategory[] = [
  { id: "mat-dryck",          label: "Mat & Dryck",          color: "#8B5F46", Icon: UtensilsCrossed, dbValues: ["Mat", "Mat & Dryck"] },
  { id: "cafe-bageri",        label: "Café & Bageri",        color: "#A3814C", Icon: Coffee,          dbValues: ["Café & Bageri", "Cafe & Bageri"] },
  { id: "hotell-bb",          label: "Hotell & B&B",         color: "#5A6580", Icon: Hotel,           dbValues: ["Hotell & B&B", "Boende"] },
  { id: "butiker",            label: "Butiker",              color: "#9C5860", Icon: ShoppingBag,     dbValues: ["Butiker", "Gårdsbutik"] },
  { id: "natur-upplevelser",  label: "Natur & Upplevelser",  color: "#4C7659", Icon: TreePine,        dbValues: ["Natur", "Natur & Upplevelser"] },
  { id: "aktiviteter",        label: "Aktiviteter",          color: "#568495", Icon: Target,          dbValues: ["Aktiviteter"] },
  { id: "sevardheter",        label: "Sevärdheter",          color: "#6C5C95", Icon: Landmark,        dbValues: ["Sevärdheter", "Konst"] },
  { id: "hantverk-service",   label: "Design & Hantverk",    color: "#4F7D79", Icon: Palette,         dbValues: ["Hantverk & Service", "Hantverk"] },
];

export interface CategoryStat extends StatCategory {
  /** Antal platser i kategorin */
  total: number;
  /** Antal olika platser i kategorin som användaren besökt */
  visited: number;
  /** visited / total i procent (0–100) */
  percentage: number;
}

export function placeMatchesCategory(place: Place, dbValues: string[]): boolean {
  if (!place.categories) return false;
  const parts = place.categories.split(",").map((s) => s.trim().toLowerCase());
  return dbValues.some((v) => {
    const t = v.toLowerCase();
    return parts.some((p) => p === t || p.includes(t) || t.includes(p));
  });
}

/** Alla kategorier med hur mycket användaren besökt, mest besökta först. */
export function computeCategoryStats(places: Place[], visitedPlaceIds: number[]): CategoryStat[] {
  return STAT_CATEGORIES.map((cat) => {
    const total = places.filter((p) => placeMatchesCategory(p, cat.dbValues)).length;
    const visited = visitedPlaceIds.filter((pid) => {
      const p = places.find((pp) => pp.id === pid);
      return !!p && placeMatchesCategory(p, cat.dbValues);
    }).length;
    const percentage = total > 0 ? Math.round((visited / total) * 100) : 0;
    return { ...cat, total, visited, percentage };
  }).sort((a, b) => b.visited - a.visited);
}
