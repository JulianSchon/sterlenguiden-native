/**
 * Vänner som varit på eller sparat en plats (rpc_friends_at_place, migration 038) — samma saker som
 * syns på deras profil, bara samlade per plats. Senast där först. Finns inte funktionen än (migrationen
 * inte körd) blir listan tom och platssidan visar ingenting.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import i18n from "i18next";

export interface FriendAtPlace {
  userId: string;
  name: string;
  avatarPath: string | null;
  circleColor: string | null;
  avatarRing: string | null;
  /** Senaste besöket, eller null om vännen bara sparat platsen */
  lastVisit: string | null;
  visits: number;
  saved: boolean;
}

interface Row {
  user_id: string; display_name: string | null; username: string | null; circle_color: string | null;
  avatar_ring: string | null; avatar_path: string | null; last_visit: string | null; visits: number; saved: boolean;
}

export function useFriendsAtPlace(placeId: number | null) {
  return useQuery({
    queryKey: ["friends-at-place", placeId],
    enabled: placeId != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FriendAtPlace[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.rpc("rpc_friends_at_place", { p_place_id: placeId! });
      if (error) return [];
      return ((data ?? []) as Row[]).map((r) => ({
        userId: r.user_id,
        name: r.display_name || r.username || i18n.t("problems.friend"),
        avatarPath: r.avatar_path,
        circleColor: r.circle_color,
        avatarRing: r.avatar_ring,
        lastVisit: r.last_visit,
        visits: r.visits,
        saved: r.saved,
      }));
    },
  });
}
