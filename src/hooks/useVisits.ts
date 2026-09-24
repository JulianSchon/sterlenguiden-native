import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Visit {
  id: string;
  user_id: string;
  place_id: number;
  visited_at: string;
  method: string; // "gps" | "qr"
}

export function useVisits() {
  return useQuery({
    queryKey: ["visits"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as Visit[];
      const { data, error } = await supabase
        .from("visits")
        .select("*")
        .eq("user_id", user.id)
        .order("visited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Visit[];
    },
  });
}

/** Databasen (triggern visits_cooldown) nekade — samma plats för nyss. */
export class CheckInCooldownError extends Error {
  constructor() {
    super("checkin_cooldown");
  }
}

/**
 * Registrerar ett besök. Historik, Statistik och Utmaningar läser alla ur
 * visits, så det räcker att invalidera den frågan — inget annat behöver
 * räknas om för hand.
 */
export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId, method = "gps" }: { placeId: number; method?: "gps" | "qr" }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("visits")
        .insert({
          user_id: user.id,
          place_id: placeId,
          visited_at: new Date().toISOString(), // tryckögonblicket, inte när det eventuellt synkas senare
          method,
        })
        .select()
        .single();

      if (error) {
        if (error.message?.includes("checkin_cooldown")) throw new CheckInCooldownError();
        throw error;
      }
      return data as Visit;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["visits"] }),
  });
}
