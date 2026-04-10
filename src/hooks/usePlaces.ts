import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Place = Tables<"places"> & {
  category: string | null;
  business_tier?: string;
};

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
          "id, name, categories, sub_category, lat, lng, image_url, logo_url, opening_hours, is_premium, nearest_town, short_description, description, business_tier, phone, email, website_url, facebook_url, instagram_url, price_level"
        )
        .order("name");
      if (error) throw error;
      return normalizePlaces(data as Tables<"places">[]);
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
            "id, name, categories, sub_category, lat, lng, image_url, opening_hours, is_premium, nearest_town, short_description, business_tier, price_level"
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

export function isPlaceOpen(
  openingHours: Record<string, string> | null
): boolean {
  if (!openingHours) return false;
  const now = new Date();
  const days = [
    "Söndag",
    "Måndag",
    "Tisdag",
    "Onsdag",
    "Torsdag",
    "Fredag",
    "Lördag",
  ];
  const currentDay = days[now.getDay()];
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const todayHours = openingHours[currentDay];
  if (!todayHours || todayHours.toLowerCase() === "stängt") return false;
  const match = todayHours.match(
    /(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/
  );
  if (!match) return false;
  const openTime = parseInt(match[1]) * 60 + (match[2] ? parseInt(match[2]) : 0);
  const closeTime =
    parseInt(match[3]) * 60 + (match[4] ? parseInt(match[4]) : 0);
  return currentTime >= openTime && currentTime <= closeTime;
}
