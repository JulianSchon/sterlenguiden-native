/**
 * Erbjudanden — läser ur tabellen offers.
 *
 * Utgångna och avstängda erbjudanden filtreras bort redan i queryn,
 * så inget som inte får visas kommer ens hem till klienten.
 */
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Offer } from "@/lib/offers";
import { signedInUser } from "@/lib/session";

/**
 * Alla giltiga erbjudanden, eller en plats egna. En plats erbjudanden plockas ur samma lista (den är
 * liten och finns redan för Hem och Förmåner), så platssidan visar dem direkt utan en egen hämtning.
 */
export function useOffers(placeId?: number) {
  const select = useCallback((all: Offer[]) => all.filter((o) => o.place_id === placeId), [placeId]);
  return useQuery<Offer[]>({
    queryKey: ["offers", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*, place:places(name, logo_url, categories, nearest_town)")
        .eq("is_active", true)
        .or(`expires_at.gte.${new Date().toISOString()},expires_at.is.null`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Offer[];
    },
    select: placeId == null ? undefined : select,
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
      const user = await signedInUser();
      if (!user) return [];

      const { data, error } = await supabase
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
