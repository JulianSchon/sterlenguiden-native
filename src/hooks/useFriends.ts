/**
 * Vänner — sökning, förfrågningar och en väns statistik.
 *
 * Ingen pushnotis finns ännu, så en ny förfrågan syns bara som en räknare
 * (useFriendRequestCount) tills mottagaren själv öppnar appen.
 *
 * Att neka, avbryta och ta bort en vän är samma operation: radera raden i
 * friendships. Det finns ingen "nekad"-status att spara.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FriendStatus = "none" | "outgoing" | "incoming" | "accepted";

export interface FriendResult {
  userId: string;
  username: string | null;
  displayName: string | null;
  city: string | null;
  circleColor: string | null;
  avatarRing: string | null;
  memberSince: string | null;
  friendshipId: string | null;
  friendStatus: FriendStatus;
}

export interface FriendStats {
  appDays: string[];
  visitsTotal: number;
  stickersTotal: number;
  recentVisits: { placeName: string; visitedAt: string }[];
}

function toStatus(status: string | null, direction: string | null): FriendStatus {
  if (!status) return "none";
  if (status === "accepted") return "accepted";
  return direction === "outgoing" ? "outgoing" : "incoming";
}

/** Sök användare på användarnamn (minst 2 tecken, matchar från början). */
export function useSearchUsers(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["friends", "search", q.toLowerCase()],
    enabled: q.length >= 2,
    queryFn: async (): Promise<FriendResult[]> => {
      const { data, error } = await supabase.rpc("rpc_search_users", { q });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        city: r.city,
        circleColor: r.circle_color,
        avatarRing: r.avatar_ring,
        memberSince: r.member_since,
        friendshipId: r.friendship_id,
        friendStatus: toStatus(r.status, r.direction),
      }));
    },
  });
}

/** Alla egna vänrelationer: väntande (in/ut) och accepterade. */
export function useFriendships() {
  return useQuery({
    queryKey: ["friends", "list"],
    queryFn: async (): Promise<FriendResult[]> => {
      const { data, error } = await supabase.rpc("rpc_list_friendships");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        city: r.city,
        circleColor: r.circle_color,
        avatarRing: r.avatar_ring,
        memberSince: null,
        friendshipId: r.friendship_id,
        friendStatus: toStatus(r.status, r.direction),
      }));
    },
  });
}

/** Antal väntande inkommande förfrågningar — räknaren på Mitt Österlen tills push finns. */
export function useFriendRequestCount() {
  const { data = [] } = useFriendships();
  return data.filter((f) => f.friendStatus === "incoming").length;
}

/** Skicka en vänförfrågan. */
export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Inte inloggad");
      const { error } = await supabase
        .from("friendships")
        .insert({ requester_id: user.id, addressee_id: targetUserId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });
}

/** Acceptera en inkommen förfrågan. */
export function useAcceptFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["friends"] }),
  });
}

/** Neka en förfrågan, avbryt en egen skickad förfrågan, eller ta bort en vän — allt är samma radering. */
export function useRemoveFriendship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["friends"] }),
  });
}

/** En enskild persons profil, oavsett om ni är vänner än. */
export function useFriendProfile(targetUserId: string | null) {
  return useQuery({
    queryKey: ["friends", "profile", targetUserId],
    enabled: !!targetUserId,
    queryFn: async (): Promise<FriendResult | null> => {
      const { data, error } = await supabase.rpc("rpc_get_profile", { target_user_id: targetUserId! });
      if (error) throw error;
      const r = data?.[0];
      if (!r) return null;
      return {
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        city: r.city,
        circleColor: r.circle_color,
        avatarRing: r.avatar_ring,
        memberSince: r.member_since,
        friendshipId: r.friendship_id,
        friendStatus: toStatus(r.status, r.direction),
      };
    },
  });
}

/** En väns statistik — servern nekar (kastar) om ni inte är vänner. */
export function useFriendStats(targetUserId: string | null) {
  return useQuery({
    queryKey: ["friends", "stats", targetUserId],
    enabled: !!targetUserId,
    queryFn: async (): Promise<FriendStats> => {
      const { data, error } = await supabase.rpc("rpc_friend_stats", { target_user_id: targetUserId! });
      if (error) throw error;
      const j = data as any;
      return {
        appDays: j?.app_days ?? [],
        visitsTotal: j?.visits_total ?? 0,
        stickersTotal: j?.stickers_total ?? 0,
        recentVisits: (j?.recent_visits ?? []).map((v: any) => ({ placeName: v.place_name, visitedAt: v.visited_at })),
      };
    },
  });
}
