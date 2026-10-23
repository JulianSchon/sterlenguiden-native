/**
 * Vänners senaste besök (rpc_friends_recent_visits, migration 040) — till flödet på Hem: "Anna var
 * på Kiviks Musteri". Samma saker som syns på deras profiler. Finns inte funktionen än (migrationen
 * inte körd) blir listan tom och flödet visar inga sådana kort.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import i18n from "i18next";

export interface FriendVisit {
  userId: string;
  name: string;
  avatarPath: string | null;
  circleColor: string | null;
  avatarRing: string | null;
  placeId: number;
  visitedAt: string;
}

interface Row {
  user_id: string; display_name: string | null; username: string | null; circle_color: string | null;
  avatar_ring: string | null; avatar_path: string | null; place_id: number; visited_at: string;
}

export function useFriendVisits(limit = 20) {
  return useQuery({
    queryKey: ["friend-visits", limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FriendVisit[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.rpc("rpc_friends_recent_visits", { p_limit: limit });
      if (error) return [];
      return ((data ?? []) as Row[]).map((r) => ({
        userId: r.user_id,
        name: r.display_name || r.username || i18n.t("problems.friend"),
        avatarPath: r.avatar_path,
        circleColor: r.circle_color,
        avatarRing: r.avatar_ring,
        placeId: Number(r.place_id),
        visitedAt: r.visited_at,
      }));
    },
  });
}
