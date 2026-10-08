/**
 * Topplistor — Besök, Streak och Samlarobjekt, rangordnade i tre omfång (hela appen, samma ort,
 * vänner). All rangordning sker på servern (rpc_leaderboard, migration 020): klienten får bara
 * se de som själva valt att delta, plus sin egen rad (placement null om man inte deltar).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LeaderboardMetric = "visits" | "streak" | "stickers";
export type LeaderboardScope = "all" | "area" | "friends";
export type LeaderboardPeriod = "month" | "year" | "all";

export interface LeaderboardEntry {
  userId: string;
  name: string;
  circleColor: string | null;
  value: number;
  /** Plats i listan — null om man inte deltar (eller saknar ort i "mitt område") */
  placement: number | null;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export function useLeaderboard(metric: LeaderboardMetric, scope: LeaderboardScope, period: LeaderboardPeriod = "all") {
  // Perioden betyder bara något för besök — streak och samlarobjekt delar cache oavsett vad den står på
  const p = metric === "visits" ? period : "all";
  return useQuery({
    queryKey: ["leaderboard", metric, scope, p],
    // Kortare än appens standard (5 min) — ens egen siffra ska hänga med efter en incheckning
    staleTime: 60_000,
    queryFn: async (): Promise<Leaderboard> => {
      const { data, error } = await supabase.rpc("rpc_leaderboard", {
        p_metric: metric, p_scope: scope, p_period: p, p_limit: 100,
      });
      if (error) throw error;
      const toEntry = (r: NonNullable<typeof data>[number]): LeaderboardEntry => ({
        userId: r.user_id,
        name: r.display_name,
        circleColor: r.circle_color,
        value: r.metric_value,
        placement: r.placement,
      });
      const rows = data ?? [];
      const self = rows.find((r) => r.self_row);
      return { entries: rows.filter((r) => !r.self_row).map(toEntry), me: self ? toEntry(self) : null };
    },
  });
}

/** Sätter samtycket. false sparas också (inte bara true) så appen vet att den redan frågat. */
export function useSetLeaderboardVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (visible: boolean) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");
      const { error } = await supabase.from("profiles").update({ show_in_leaderboard: visible }).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

/** "4 besök", "12 dagar", "7 objekt" — samma enhet överallt där ett värde visas. */
export function formatLeaderboardValue(metric: LeaderboardMetric, value: number): string {
  if (metric === "visits") return `${value} besök`;
  if (metric === "streak") return `${value} ${value === 1 ? "dag" : "dagar"}`;
  return `${value} objekt`;
}
