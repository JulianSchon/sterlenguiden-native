import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { effectiveHours, isOpenNow, type HoursException } from "@/lib/openingHours";

export type Place = Tables<"places"> & {
  category: string | null;
  /** När platsens fasta info (öppettider, länkar, beskrivning …) senast ändrades — migration 042 */
  info_updated_at?: string | null;
  // Från företagsportalen (migration 046)
  /** Stängt idag, semester, sommartider … (redan inräknade i opening_hours, se normalizePlace) */
  hours_exceptions?: HoursException[] | null;
  /** Det stället själv sagt att de serverar (fish, pizza …, se TASTES i lib/search) */
  tastes?: string[] | null;
  /** Någon sköter platsen och har dolt "Är det här ditt företag?" */
  claim_link_hidden?: boolean | null;
  /** Ett företag (restaurang, butik …) — inte en strand eller kyrka. Bara företag kan tas över (migration 048) */
  is_business?: boolean | null;
};

/**
 * En plats image_url kan innehålla flera adresser skilda med komma. Returnerar den första. Delar
 * bara vid komman som följs av en ny adress — Wix-adresser har komman i sig och gick annars sönder.
 */
export function firstImageUrl(imageUrl: string | null | undefined): string | null {
  return imageUrl?.split(/,(?=\s*https?:\/\/)/)[0].trim() || null;
}

/** Alla bilderna ur image_url, i ordning */
export function placeImages(imageUrl: string | null | undefined): string[] {
  return (imageUrl ?? "").split(/,(?=\s*https?:\/\/)/).map((u) => u.trim()).filter(Boolean);
}

/**
 * En rad ur databasen som appen vill ha den: `category` som förr, och öppettiderna med företagets
 * undantag inräknade (stängt idag, semester …), så allt som läser opening_hours visar rätt.
 */
export function normalizePlace(place: Tables<"places">, now = new Date()): Place {
  const row = place as Place;
  return {
    ...row,
    category: row.categories,
    opening_hours: effectiveHours(row.opening_hours as Record<string, string> | null, row.hours_exceptions, now) ?? null,
  };
}

function normalizePlaces(places: Tables<"places">[]): Place[] {
  const now = new Date();
  return places.map((place) => normalizePlace(place, now));
}

/**
 * Kolumnerna från företagsportalen (migration 046). Har migrationen inte körts än saknas de, och då
 * hämtas platserna utan dem i stället för att appen slutar visa platser.
 */
const PORTAL_COLUMNS = ", hours_exceptions, tastes, claim_link_hidden, is_business";
let portalColumns = true;

export async function selectPlaces<T>(
  run: (extra: string) => PromiseLike<{ data: T | null; error: { code?: string } | null }>,
): Promise<{ data: T | null; error: { code?: string } | null }> {
  if (portalColumns) {
    const res = await run(PORTAL_COLUMNS);
    if (res.error?.code !== "42703") return res;
    portalColumns = false;
  }
  return run("");
}

const LIST_COLUMNS =
  "id, name, categories, sub_category, lat, lng, image_url, logo_url, opening_hours, nearest_town, short_description, description, phone, email, website_url, facebook_url, instagram_url, book_url, price_level, checkin_enabled, qr_token, site_group, amenities, transit_stop_name";
const SEARCH_COLUMNS =
  "id, name, categories, sub_category, lat, lng, image_url, opening_hours, nearest_town, short_description, price_level";

export function usePlaces() {
  return useQuery({
    queryKey: ["places"],
    queryFn: async () => {
      const { data, error } = await selectPlaces((extra) =>
        supabase.from("places").select(LIST_COLUMNS + extra).order("name"));
      if (error) throw error;
      return normalizePlaces(data as unknown as Tables<"places">[]);
    },
    staleTime: 60 * 1000,
  });
}

export function useSearchPlaces(searchQuery: string) {
  return useQuery({
    queryKey: ["places", "search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) {
        const { data, error } = await selectPlaces((extra) =>
          supabase.from("places").select(SEARCH_COLUMNS + extra).order("name"));
        if (error) throw error;
        return normalizePlaces(data as unknown as Tables<"places">[]);
      }

      const sanitized = searchQuery.replace(/[%_\\(),.]/g, (c) => `\\${c}`);
      const { data, error } = await selectPlaces((extra) =>
        supabase
          .from("places")
          .select(SEARCH_COLUMNS + extra)
          .or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%,short_description.ilike.%${sanitized}%,categories.ilike.%${sanitized}%`));
      if (error) throw error;

      const places = normalizePlaces(data as unknown as Tables<"places">[]);
      const q = searchQuery.toLowerCase();
      return places.sort((a, b) => {
        const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
        const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
        return aName - bName || a.name.localeCompare(b.name, "sv");
      });
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** Har platsen öppet just nu (lunchstängt och tider över midnatt räknas, se lib/openingHours) */
export function isPlaceOpen(openingHours: Record<string, string> | null): boolean {
  return isOpenNow(openingHours);
}
