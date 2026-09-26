/**
 * Inlösen av erbjudanden — läser loggen och aktiverar nya.
 * Regelmotorn som avgör OM ett erbjudande får aktiveras ligger i @/lib/offers.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Offer, RedemptionRow } from "@/lib/offers";
import { ACTIVE_REDEMPTION_KEY, type ActiveRedemption } from "@/hooks/useActiveRedemption";

export function useOfferRedemptions() {
  return useQuery<RedemptionRow[]>({
    queryKey: ["offer-redemptions"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await (supabase as any)
        .from("offer_redemptions")
        .select("offer_id, activated_at")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []) as RedemptionRow[];
    },
  });
}

/**
 * Aktiverar ett erbjudande. Väntar på serverns svar innan den lyckas: personalskärmen får inte
 * visas för något som inte registrerats, och tiden sätts av databasen, inte av telefonens klocka.
 */
export function useActivateOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (offer: Offer): Promise<ActiveRedemption> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Inte inloggad");

      // Ingen tid skickas med: databasen skriver now()
      const { data, error } = await (supabase as any)
        .from("offer_redemptions")
        .insert({ user_id: user.id, offer_id: offer.id })
        .select("activated_at")
        .single();
      if (error) throw error;

      return {
        offerId: offer.id,
        title: offer.title,
        placeName: offer.place?.name ?? "",
        placeLogoUrl: offer.place?.logo_url ?? null,
        activatedAt: new Date(data.activated_at).getTime(),
      };
    },

    onSuccess: (active) => {
      // Personalskärmen visas av ActiveOfferHost från det här
      queryClient.setQueryData(ACTIVE_REDEMPTION_KEY, active);
      queryClient.invalidateQueries({ queryKey: ["offer-redemptions"] });
    },
  });
}
