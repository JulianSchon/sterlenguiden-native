import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedInUser } from "@/lib/session";

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
      const user = await signedInUser();
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

/** Databasen räknade avståndet själv och tyckte att man stod för långt bort */
export class CheckInTooFarError extends Error {
  constructor() {
    super("too_far");
  }
}

/**
 * Registrerar ett besök. Databasen (check_in, migration 052) räknar själv avståndet till platsen och
 * sätter tiden, så ett besök inte går att spara utan att vara där. Historik, Statistik och
 * Utmaningar läser alla ur visits, så det räcker att invalidera den frågan.
 */
export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { ownError: true },
    mutationFn: async ({ placeId, lat, lng }: { placeId: number; lat: number; lng: number }) => {
      const { data, error } = await supabase.rpc("check_in", { p_place_id: placeId, p_lat: lat, p_lng: lng });
      if (error) {
        if (error.message?.includes("checkin_cooldown")) throw new CheckInCooldownError();
        if (error.message?.includes("too_far")) throw new CheckInTooFarError();
        throw error;
      }
      return data as Visit;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["visits"] }),
  });
}
