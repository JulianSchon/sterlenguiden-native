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
  isMember: boolean;
  cardColor: string | null;
  memberSince: string | null;
  friendshipId: string | null;
  friendStatus: FriendStatus;
}

export type ActivityKind = "visit" | "favorite" | "sticker";

export interface FriendActivity {
  kind: ActivityKind;
  label: string;
  imagePath: string | null;
  happenedAt: string;
}

export interface FriendTrophy {
  achievementType: string;
  level: "bronze" | "silver" | "gold";
}

export interface FriendStats {
  appDays: string[];
  visitsTotal: number;
  stickersTotal: number;
  favoritesTotal: number;
  visitedPlaceIds: number[];
  trophies: FriendTrophy[];
  activity: FriendActivity[];
}

function toStatus(status: string | null, direction: string | null): FriendStatus {
  if (!status) return "none";
  if (status === "accepted") return "accepted";
  return direction === "outgoing" ? "outgoing" : "incoming";
}

function toFriendResult(r: {
  user_id: string; username: string | null; display_name: string | null; city: string | null;
  circle_color: string | null; avatar_ring: string | null; is_member: boolean; card_color: string | null;
  member_since: string; friendship_id: string | null; status: string | null; direction: string | null;
}): FriendResult {
  return {
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    city: r.city,
    circleColor: r.circle_color,
    avatarRing: r.avatar_ring,
    isMember: r.is_member,
    cardColor: r.card_color,
    memberSince: r.member_since,
    friendshipId: r.friendship_id,
    friendStatus: toStatus(r.status, r.direction),
  };
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
      return (data ?? []).map(toFriendResult);
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
      return (data ?? []).map((r) => toFriendResult({ ...r, member_since: "" }));
    },
  });
}

/** Antal väntande inkommande förfrågningar — räknaren på Mitt Österlen tills push finns. */
export function useFriendRequestCount() {
  const { data = [] } = useFriendships();
  return data.filter((f) => f.friendStatus === "incoming").length;
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
      return r ? toFriendResult(r) : null;
    },
  });
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

/** En väns statistik och aktivitetslogg — servern nekar (kastar) om ni inte är vänner. */
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
        favoritesTotal: j?.favorites_total ?? 0,
        visitedPlaceIds: j?.visited_place_ids ?? [],
        trophies: (j?.trophies ?? []).map((t: any) => ({ achievementType: t.achievement_type, level: t.level })),
        activity: (j?.activity ?? []).map((a: any) => ({
          kind: a.kind,
          label: a.label,
          imagePath: a.image_path,
          happenedAt: a.happened_at,
        })),
      };
    },
  });
}
