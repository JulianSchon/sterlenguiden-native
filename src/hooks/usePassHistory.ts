/** Egen köphistorik och pass man gett bort (pass_purchases / pass_gifts). */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PassPurchase {
  id: string;
  /** "self" = eget köp, "gift" = köpt som present */
  kind: string;
  period: string;
  priceSek: number;
  createdAt: string;
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

async function requireUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function usePassPurchases() {
  return useQuery({
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
      }));
    },
  });
}

export function usePassGifts() {
  return useQuery({
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
  });
}
