import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Visit {
  id: number;
  user_id: string;
  place_id: number;
  visited_at: string;
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
