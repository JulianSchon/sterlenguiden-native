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

/**
 * Erbjudanden användaren löst in, även de som gått ut eller stängts av (useOffers visar bara giltiga).
 * Ger historiken under "Inlösta": man ska alltid kunna se vad man utnyttjat.
 */
export function useRedeemedOffers() {
  return useQuery<Offer[]>({
    queryKey: ["offers", "redeemed"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await (supabase as any)
        .from("offer_redemptions")
        .select("offer:offers(*, place:places(name, logo_url, categories, nearest_town))")
        .eq("user_id", user.id);
      if (error) throw error;

      // Ett erbjudande kan vara inlöst flera gånger: en rad per erbjudande räcker
      const byId = new Map<string, Offer>();
      for (const row of data ?? []) {
        if (row.offer) byId.set(row.offer.id, row.offer as Offer);
      }
      return [...byId.values()];
    },
  });
}
