import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { swedishDay } from "@/lib/streak";

export interface PassProduct {
  /** "week" | "month" | "year" | … */
  id: string;
  name: string;
  description: string | null;
  priceSek: number;
  days: number;
  /** Förnyas passet automatiskt, eller är det ett engångsköp? */
  autoRenew: boolean;
}

/**
 * De pass som går att köpa just nu. Priser och vilka pass som finns styrs i
 * tabellen pass_products; ett pass med available_from/available_until (t.ex.
 * sommarpasset) visas bara inom sitt datumfönster.
 */
export function usePassProducts() {
  return useQuery({
    queryKey: ["pass-products"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PassProduct[]> => {
      const { data, error } = await supabase.from("pass_products").select("*").order("sort_order");
      if (error) throw error;
      const today = swedishDay();
      return (data ?? [])
        .filter((p) => (!p.available_from || p.available_from <= today) && (!p.available_until || p.available_until >= today))
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceSek: Number(p.price_sek),
          days: p.days,
          autoRenew: p.auto_renew,
        }));
    },
  });
}
