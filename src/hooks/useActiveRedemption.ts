/**
 * Erbjudandet som är aktivt just nu (aktiverat för mindre än 60 sekunder sedan), om något.
 *
 * Personalskärmen visas från det här, inte från lokalt tillstånd i panelen: då finns skärmen kvar
 * om appen stängs och startas om medan tiden ännu räknas, och sanningen är alltid serverns tid.
 * Sätts direkt av aktiveringen (useActivateOffer) och läses från servern vid appstart.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_SECS } from "@/lib/offers";

export interface ActiveRedemption {
  offerId: string;
  title: string;
  placeName: string;
  placeLogoUrl: string | null;
  /** Serverns tid för aktiveringen, i millisekunder */
  activatedAt: number;
}

export const ACTIVE_REDEMPTION_KEY = ["active-redemption"];

export function useActiveRedemption() {
  return useQuery<ActiveRedemption | null>({
    queryKey: ACTIVE_REDEMPTION_KEY,
    // Läses en gång vid start; därefter sätts och rensas den av aktiveringen och skärmen själv
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const since = new Date(Date.now() - ACTIVE_SECS * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("offer_redemptions")
        .select("offer_id, activated_at, offer:offers(title, place:places(name, logo_url))")
        .eq("user_id", user.id)
        .gte("activated_at", since)
        .order("activated_at", { ascending: false })
        .limit(1);
      if (error) throw error;

      const row = data?.[0];
      if (!row?.offer) return null;
      return {
        offerId: row.offer_id,
        title: row.offer.title,
        placeName: row.offer.place?.name ?? "",
        placeLogoUrl: row.offer.place?.logo_url ?? null,
        activatedAt: new Date(row.activated_at).getTime(),
      };
    },
  });
}
