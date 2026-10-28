import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedInUser } from "@/lib/session";

/** En klarad trofé (tabellen trophies). Databasen kontrollerar att den verkligen är klar. */
export interface Achievement {
  id: string;
  user_id: string;
  achievement_type: string; // gruppens id, t.ex. "utforskaren" (se src/lib/achievements.ts)
  level: string;             // "bronze" | "silver" | "gold"
  unlocked_at: string;
}

export function useAchievements() {
  return useQuery({
    queryKey: ["achievements"],
    queryFn: async () => {
      const user = await signedInUser();
      if (!user) return [] as Achievement[];
      const { data, error } = await supabase
        .from("trophies")
        .select("*")
        .eq("user_id", user.id)
        .order("unlocked_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGrantAchievement() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { background: true },
    mutationFn: async (vars: { achievement_type: string; level: string }) => {
      const user = await signedInUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("trophies").insert({
        user_id: user.id,
        achievement_type: vars.achievement_type,
        level: vars.level,
      });
      // 23505: troféen fanns redan (databasen tillåter bara en per konto) — det är ok
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["achievements"] }),
  });
}
