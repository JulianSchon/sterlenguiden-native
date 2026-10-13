/**
 * Platskategorierna med färg och ikon, och hur mycket av varje kategori användaren besökt.
 * Delas av Statistik, Profil och vänners profiler så att de aldrig visar olika siffror.
 *
 * Färg, ikon, namn och databasvärden kommer från appens enda kategorikälla
 * (src/theme/categories.ts) — kategorins egen färg (`screen`, t.ex. vinröd för Mat & Dryck),
 * som Viktor vill ha även i statistiken.
 */
import type { ComponentType } from "react";
import type { Place } from "@/hooks/usePlaces";
import { CATEGORIES } from "@/theme/categories";

export interface StatCategory {
  id: string;
  label: string;
  color: string;
  Icon: ComponentType<any>;
  dbValues: string[];
}

export const STAT_CATEGORIES: StatCategory[] = CATEGORIES.map((c) => ({
  id: c.id, label: c.label, color: c.screen, Icon: c.icon, dbValues: c.dbValues,
}));

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
  return place.categories.split(",").some((part) => partMatches(part, dbValues));
}

function partMatches(part: string, dbValues: string[]): boolean {
  const p = part.trim().toLowerCase();
  return dbValues.some((v) => {
    const t = v.toLowerCase();
    return p === t || p.includes(t) || t.includes(p);
  });
}

/** Platsens egen kategori — den som matchar dess FÖRSTA kategori (en plats kan ha flera). */
export function primaryStatCategory(place: Place): StatCategory | undefined {
  const first = place.categories?.split(",")[0];
  return (first ? STAT_CATEGORIES.find((c) => partMatches(first, c.dbValues)) : undefined)
    ?? STAT_CATEGORIES.find((c) => placeMatchesCategory(place, c.dbValues));
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
