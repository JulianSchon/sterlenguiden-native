/**
 * Gemensamma listor: en lista har en ägare och flera medlemmar, och alla
 * medlemmar kan lägga till och ta bort platser. Man går med via en kod.
 * Åtkomsten styrs av RLS i databasen (lists, list_members, list_places).
 *
 * Alla frågor ligger under nyckeln ["lists"], så en enda invalidering
 * uppdaterar både översikten och detaljsidorna.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { firstImageUrl } from "@/hooks/usePlaces";

export interface ListSummary {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  placeIds: number[];
  memberCount: number;
  /** Upp till fyra bilder från listans platser, äldst först — till kollaget */
  images: string[];
}

export interface ListPlace {
  /** Radens id i list_places (inte platsens id) */
  rowId: string;
  addedAt: string;
  place: {
    id: number;
    name: string;
    image_url: string | null;
    nearest_town: string | null;
    categories: string | null;
  };
}

export interface ListMember {
  userId: string;
  role: "owner" | "member";
  name: string;
}

export interface ListDetail {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  places: ListPlace[];
  members: ListMember[];
}

async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  return user.id;
}

/** Listorna där den inloggade är medlem (RLS filtrerar bort resten) — en lista man bara är
 * PENDING-inbjuden till räknas inte med här förrän man accepterat, se usePendingListInvites(). */
export function useLists() {
  return useQuery({
    queryKey: ["lists", "mine"],
    queryFn: async (): Promise<ListSummary[]> => {
      const userId = await requireUserId();
      const { data, error } = await supabase
        .from("lists")
        .select("*, list_places(place_id, created_at, places(image_url)), list_members(user_id, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .filter((l) => l.owner_id === userId || l.list_members.some((m) => m.user_id === userId && m.status === "accepted"))
        .map((l) => {
          const byAge = [...l.list_places].sort((a, b) => a.created_at.localeCompare(b.created_at));
          const acceptedMembers = l.list_members.filter((m) => m.status === "accepted");
          return {
            id: l.id,
            name: l.name,
            description: l.description,
            ownerId: l.owner_id,
            inviteCode: l.invite_code,
            placeIds: l.list_places.map((p) => p.place_id),
            memberCount: acceptedMembers.length,
            images: byAge.map((p) => firstImageUrl(p.places?.image_url)).filter((u): u is string => !!u).slice(0, 4),
          };
        });
    },
  });
}

export function useList(id: string | undefined) {
  return useQuery({
    queryKey: ["lists", "detail", id],
    enabled: !!id,
    queryFn: async (): Promise<ListDetail | null> => {
      const { data, error } = await supabase
        .from("lists")
        .select(
          "*, list_members(user_id, role), list_places(id, created_at, places(id, name, image_url, nearest_town, categories))"
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // Namn till medlemmarna. Om profiles inte får läsas av andra faller vi
      // tillbaka på "Medlem".
      const ids = data.list_members.map((m) => m.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        ownerId: data.owner_id,
        inviteCode: data.invite_code,
        places: data.list_places
          .filter((lp) => lp.places)
          .map((lp) => ({
            rowId: lp.id,
            addedAt: lp.created_at,
            place: { ...lp.places!, image_url: firstImageUrl(lp.places!.image_url) },
          }))
          .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
        members: data.list_members.map((m) => ({
          userId: m.user_id,
          role: m.role as "owner" | "member",
          name: names.get(m.user_id) || "Medlem",
        })),
      };
    },
  });
}

/** Skapar en lista och returnerar dess id. Skaparen blir ägare (görs av en trigger i databasen).
 * friendIds läggs till som medlemmar direkt (rpc_add_list_members), inget krävs av dem. */
export function useCreateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      { name, description, friendIds = [] }: { name: string; description: string; friendIds?: string[] }
    ) => {
      const userId = await requireUserId();
      const { data, error } = await supabase
        .from("lists")
        .insert({ name: name.trim(), description: description.trim() || null, owner_id: userId })
        .select("id")
        .single();
      if (error) throw error;
      if (friendIds.length > 0) {
        const { error: memberError } = await supabase.rpc("add_list_members", {
          target_list_id: data.id, target_user_ids: friendIds,
        });
        if (memberError) throw memberError;
      }
      return data.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** Lägger till vänner som medlemmar i en redan existerande lista. */
export function useAddListMembers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, friendIds }: { listId: string; friendIds: string[] }) => {
      const { error } = await supabase.rpc("add_list_members", {
        target_list_id: listId, target_user_ids: friendIds,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

export interface PendingListInvite {
  listId: string;
  listName: string;
  ownerName: string;
}

/** Listinbjudningar TILL mig som väntar på svar — visas som en stor kort-popup på Mitt Österlen. */
export function usePendingListInvites() {
  return useQuery({
    queryKey: ["lists", "pending-invites"],
    queryFn: async (): Promise<PendingListInvite[]> => {
      const { data, error } = await supabase.rpc("rpc_pending_list_invites");
      if (error) throw error;
      return (data ?? []).map((r) => ({ listId: r.list_id, listName: r.list_name, ownerName: r.owner_name }));
    },
  });
}

export function useAcceptListInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listId: string) => {
      const { error } = await supabase.rpc("accept_list_invite", { target_list_id: listId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** Avböjer en inbjudan — samma som att lämna listan, fast innan man någonsin gick med. */
export function useDeclineListInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listId: string) => {
      const userId = await requireUserId();
      const { error } = await supabase.from("list_members").delete().eq("list_id", listId).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** Går med i en lista via kod. Kastar Error("list_not_found") om koden inte finns. */
export function useJoinList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("join_list", { code });
      if (error) throw new Error(error.message.includes("list_not_found") ? "list_not_found" : error.message);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

export function useAddPlaceToList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, placeId }: { listId: string; placeId: number }) => {
      const userId = await requireUserId();
      const { error } = await supabase
        .from("list_places")
        .insert({ list_id: listId, place_id: placeId, added_by: userId });
      // 23505 = platsen ligger redan i listan, det är inte ett fel
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

export function useRemovePlaceFromList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("list_places").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** Medlem lämnar listan (userId = jag), eller ägaren tar bort en medlem. */
export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, userId }: { listId: string; userId: string }) => {
      const { error } = await supabase.from("list_members").delete().eq("list_id", listId).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

export function useDeleteList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listId: string) => {
      const { error } = await supabase.from("lists").delete().eq("id", listId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}
