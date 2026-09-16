import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Matchar de riktiga kolumnerna i achievements-tabellen (delad med webben) —
 * INTE det gamla lokala challenge_id-systemet som app/challenges.tsx
 * använde tidigare och som aldrig var kopplat till databasen.
 */
export interface Achievement {
  id: string;
  user_id: string;
  achievement_type: string; // gruppens id, t.ex. "utforskaren" (se src/lib/achievements.ts)
  category: string | null;  // alltid null — fanns bara för det gamla kategori-baserade systemet
  level: string;             // "bronze" | "silver" | "gold"
  unlocked_at: string;
}

export function useAchievements() {
  return useQuery({
    queryKey: ["achievements"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as Achievement[];
      const { data, error } = await supabase
        .from("achievements")
        .select("*")
        .eq("user_id", user.id)
        .order("unlocked_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Achievement[];
    },
  });
}

export function useGrantAchievement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { achievement_type: string; category: string | null; level: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("achievements").insert({
        user_id: user.id,
        achievement_type: vars.achievement_type,
        category: vars.category,
        level: vars.level,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["achievements"] }),
  });
}
