import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDismissals() {
  return useQuery({
    queryKey: ["discovery_dismissals"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
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
    mutationFn: async (placeId: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("discovery_dismissals")
        .insert({ user_id: user.id, place_id: placeId });

      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discovery_dismissals"] });
    },
  });
}
