/** Egen köphistorik och pass man gett bort (pass_purchases / pass_gifts). */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PassPurchase {
  id: string;
  /** "self" = eget köp, "gift" = köpt som present */
  kind: string;
  period: string;
  priceSek: number;
  createdAt: string;
  /** Kortet betalningen gjordes med (fylls i av betalningsleverantören), annars null */
  cardBrand: string | null;
  cardLast4: string | null;
}

export interface PassGift {
  id: string;
  recipientName: string;
  period: string;
  claimed: boolean;
  /** "email" | "print" */
  deliveryMethod: string;
  claimCode: string;
  createdAt: string;
}

/** En kod du själv löst in: tiden du fick i present. */
export interface RedeemedGift {
  id: string;
  period: string;
  /** Vad presenten var värd */
  priceSek: number;
  claimedAt: string;
}

async function requireUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const purchasesQuery = {
  queryKey: ["pass-purchases"],
  queryFn: async (): Promise<PassPurchase[]> => {
    const userId = await requireUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from("pass_purchases")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id, kind: r.kind, period: r.period, priceSek: r.price, createdAt: r.created_at,
      cardBrand: r.card_brand ?? null, cardLast4: r.card_last4 ?? null,
    }));
  },
};

export const usePassPurchases = () => useQuery(purchasesQuery);

const redeemedQuery = {
  queryKey: ["pass-redeemed"],
  queryFn: async (): Promise<RedeemedGift[]> => {
    const userId = await requireUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from("pass_gifts")
      .select("*")
      .eq("claimed_by", userId)
      .order("claimed_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id, period: r.period, priceSek: r.price, claimedAt: r.claimed_at ?? r.created_at,
    }));
  },
};

export const useRedeemedGifts = () => useQuery(redeemedQuery);

const giftsQuery = {
  queryKey: ["pass-gifts"],
  queryFn: async (): Promise<PassGift[]> => {
    const userId = await requireUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from("pass_gifts")
      .select("*")
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      recipientName: r.recipient_name,
      period: r.period,
      claimed: r.claimed_by != null,
      deliveryMethod: r.delivery_method,
      claimCode: r.claim_code,
      createdAt: r.created_at,
    }));
  },
};

export const usePassGifts = () => useQuery(giftsQuery);

/**
 * Hämtar passets listor i förväg (köp, inlösta koder, gåvor) när appen öppnas, så
 * Österlenpasset visar dem direkt första gången i stället för att fylla på efteråt.
 */
export function usePrefetchPass() {
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.prefetchQuery(purchasesQuery);
    queryClient.prefetchQuery(redeemedQuery);
    queryClient.prefetchQuery(giftsQuery);
  }, [queryClient]);
}
