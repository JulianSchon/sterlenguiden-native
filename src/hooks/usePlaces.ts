import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { isOpenNow } from "@/lib/openingHours";

export type Place = Tables<"places"> & {
  category: string | null;
  business_tier?: string;
  /** När platsens fasta info (öppettider, länkar, beskrivning …) senast ändrades — migration 042 */
  info_updated_at?: string | null;
};

/**
 * En plats image_url kan innehålla flera adresser skilda med komma. Returnerar den första. Delar
 * bara vid komman som följs av en ny adress — Wix-adresser har komman i sig och gick annars sönder.
 */
export function firstImageUrl(imageUrl: string | null | undefined): string | null {
  return imageUrl?.split(/,(?=\s*https?:\/\/)/)[0].trim() || null;
}

export function getTierScore(tier?: string | null): number {
  if (tier === "premium") return 200;
  if (tier === "partner") return 100;
  return 0;
}

function normalizePlaces(places: Tables<"places">[]): Place[] {
  return places.map((place) => ({
    ...place,
    category: place.categories,
  }));
}

export function usePlaces() {
  return useQuery({
    queryKey: ["places"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("places")
        .select(
          "id, name, categories, sub_category, lat, lng, image_url, logo_url, opening_hours, nearest_town, short_description, description, business_tier, phone, email, website_url, facebook_url, instagram_url, book_url, price_level, checkin_enabled, qr_token, site_group, amenities, transit_stop_name"
        )
        .order("name");
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
        const { data, error } = await supabase
          .from("places")
          .select(
            "id, name, categories, sub_category, lat, lng, image_url, opening_hours, nearest_town, short_description, business_tier, price_level"
          )
          .order("name");
        if (error) throw error;
        return normalizePlaces(data as Tables<"places">[]);
      }

      const sanitized = searchQuery.replace(/[%_\\(),.]/g, (c) => `\\${c}`);
      const { data, error } = await supabase
        .from("places")
        .select(
          "id, name, categories, sub_category, lat, lng, image_url, opening_hours, is_premium, nearest_town, short_description, business_tier, price_level"
        )
        .or(
          `name.ilike.%${sanitized}%,description.ilike.%${sanitized}%,short_description.ilike.%${sanitized}%,categories.ilike.%${sanitized}%`
        );
      if (error) throw error;

      const places = normalizePlaces(data as Tables<"places">[]);
      const q = searchQuery.toLowerCase();
      return places.sort((a, b) => {
        const tierDiff =
          getTierScore(b.business_tier) - getTierScore(a.business_tier);
        if (tierDiff !== 0) return tierDiff;
        const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
        const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
        return aName - bName;
      });
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** Har platsen öppet just nu (lunchstängt och tider över midnatt räknas, se lib/openingHours) */
export function isPlaceOpen(openingHours: Record<string, string> | null): boolean {
  return isOpenNow(openingHours);
}
