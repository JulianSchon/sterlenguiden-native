import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedInUser } from "@/lib/session";
import { sendOrQueue } from "@/lib/outbox";

export function useDismissals() {
  return useQuery({
    queryKey: ["discovery_dismissals"],
    queryFn: async () => {
      const user = await signedInUser();
      if (!user) return [] as number[];

      const { data, error } = await supabase
        .from("discovery_dismissals")
        .select("place_id")
        .eq("user_id", user.id);

      if (error) throw error;
      return data.map((d) => d.place_id) as number[];
    },
  });
}

export function useDismissPlace() {
  const queryClient = useQueryClient();
  return useMutation({
    // Utan nät sparas svepet när nätet är tillbaka (lib/outbox)
    mutationFn: (placeId: number) => sendOrQueue({ kind: "discover-dismiss", id: placeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discovery_dismissals"] });
    },
  });
}

/** Högersvep i Upptäck (migration 026) — räknas till utmaningen Bläddraren tillsammans med
 * vänstersvepen. Favoriten sparas som vanligt för sig; den här loggen säger bara att platsen
 * svepts, eftersom favoriter också kan sparas på andra ställen. */
export function useDiscoveryLikes() {
  return useQuery({
    queryKey: ["discovery_likes"],
    queryFn: async () => {
      const user = await signedInUser();
      if (!user) return [] as number[];

      const { data, error } = await supabase
        .from("discovery_likes")
        .select("place_id")
        .eq("user_id", user.id);

      if (error) throw error;
      return (data ?? []).map((d: { place_id: number }) => d.place_id) as number[];
    },
  });
}

export function useLikePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (placeId: number) => sendOrQueue({ kind: "discover-like", id: placeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discovery_likes"] });
    },
  });
}
