/**
 * Erbjudanden — läser ur tabellen offers.
 *
 * Utgångna och avstängda erbjudanden filtreras bort redan i queryn,
 * så inget som inte får visas kommer ens hem till klienten.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Offer } from "@/lib/offers";

export function useOffers(placeId?: number) {
  return useQuery<Offer[]>({
    queryKey: ["offers", placeId ?? "all"],
    queryFn: async () => {
      let query = (supabase as any)
        .from("offers")
        .select("*, place:places(name, logo_url, categories, nearest_town)")
        .eq("is_active", true)
        .or(`expires_at.gte.${new Date().toISOString()},expires_at.is.null`)
        .order("created_at", { ascending: false });

      if (placeId != null) query = query.eq("place_id", placeId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Offer[];
    },
  });
}
