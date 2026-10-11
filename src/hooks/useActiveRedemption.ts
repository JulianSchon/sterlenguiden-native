/**
 * Erbjudandet som är aktivt just nu (aktiverat för mindre än 60 sekunder sedan), om något.
 *
 * Personalskärmen visas från det här, inte från lokalt tillstånd i panelen: då finns skärmen kvar
 * om appen stängs och startas om medan tiden ännu räknas, och sanningen är alltid serverns tid.
 * Sätts direkt av aktiveringen (useActivateOffer) och läses från servern vid appstart.
 *
 * "Yngre än 60 sekunder" avgörs av SERVERNS klocka (rpc_active_redemption, migration 025), och
 * svaret ställer också appens serverklocka — en tillbakaställd telefonklocka kan alltså inte ta
 * fram en gammal aktivering igen.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_SECS } from "@/lib/offers";
import { serverNow, syncServerClock } from "@/lib/serverClock";

export interface ActiveRedemption {
  offerId: string;
  title: string;
  placeName: string;
  placeLogoUrl: string | null;
  category: string | null;
  savingsLabel: string | null;
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

      const select = "offer_id, activated_at, offer:offers(title, category, savings_label, place:places(name, logo_url))";
      let query = (supabase as any).from("offer_redemptions").select(select).eq("user_id", user.id);

      const { data: active, error: rpcError } = await (supabase as any).rpc("rpc_active_redemption");
      if (!rpcError) {
        const row = active?.[0];
        if (row?.server_now) syncServerClock(new Date(row.server_now).getTime());
        if (!row?.offer_id) return null;
        query = query.eq("offer_id", row.offer_id).gte("activated_at", row.activated_at);
      } else {
        // Migration 025 inte körd än: samma fråga som förut, med telefonens klocka
        query = query.gte("activated_at", new Date(serverNow() - ACTIVE_SECS * 1000).toISOString())
          .order("activated_at", { ascending: false });
      }
      const { data, error } = await query.limit(1);
      if (error) throw error;

      const row = data?.[0];
      if (!row?.offer) return null;
      return {
        offerId: row.offer_id,
        title: row.offer.title,
        placeName: row.offer.place?.name ?? "",
        placeLogoUrl: row.offer.place?.logo_url ?? null,
        category: row.offer.category ?? null,
        savingsLabel: row.offer.savings_label ?? null,
        activatedAt: new Date(row.activated_at).getTime(),
      };
    },
  });
}
