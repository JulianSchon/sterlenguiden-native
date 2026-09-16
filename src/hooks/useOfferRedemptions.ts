/**
 * Inlösen av erbjudanden — läser loggen och aktiverar nya.
 * Regelmotorn som avgör OM ett erbjudande får aktiveras ligger i @/lib/offers.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RedemptionRow } from "@/lib/offers";

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

export function useActivateOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (offerId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Inte inloggad");

      const activatedAt = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("offer_redemptions")
        .insert({ user_id: user.id, offer_id: offerId, activated_at: activatedAt });

      // 23505 = unik-konflikt. Ska inte kunna uppstå med nuvarande schema,
      // men en dubbeltryckning får aldrig visa ett fel för användaren.
      if (error && error.code !== "23505") throw error;

      return { offerId, activatedAt };
    },

    // Optimistiskt: regelmotorn ska räkna aktiveringen direkt, utan att
    // vänta på att servern svarar — annars hinner knappen se aktiverbar ut igen.
    onMutate: async (offerId: string) => {
      await queryClient.cancelQueries({ queryKey: ["offer-redemptions"] });
      const previous = queryClient.getQueryData<RedemptionRow[]>(["offer-redemptions"]);
      queryClient.setQueryData<RedemptionRow[]>(["offer-redemptions"], (old = []) => [
        ...old,
        { offer_id: offerId, activated_at: new Date().toISOString() },
      ]);
      return { previous };
    },

    onError: (_err, _offerId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["offer-redemptions"], context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["offer-redemptions"] });
    },
  });
}
