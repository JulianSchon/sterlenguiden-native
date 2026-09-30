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
import { preparePhoto } from "@/lib/photos";
import { pickSquarePhoto, type PhotoSource } from "@/hooks/useAccount";

const COVER_BUCKET = "list-covers";

export interface ListSummary {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  coverImageUrl: string | null;
  placeIds: number[];
  memberCount: number;
  /** Upp till fyra bilder från listans platser, äldst först — till kollaget (fallback när ingen egen omslagsbild är vald) */
  images: string[];
}

export interface ListPlace {
  /** Radens id i list_places (inte platsens id) */
  rowId: string;
  addedAt: string;
  /** Dra-och-släpp-ordning */
  position: number;
  addedBy: { userId: string; name: string; isMe: boolean; circleColor: string | null; avatarRing: string | null };
  place: {
    id: number;
    name: string;
    image_url: string | null;
    nearest_town: string | null;
    categories: string | null;
    opening_hours: Record<string, string> | null;
  };
}

export interface ListMember {
  userId: string;
  role: "owner" | "member";
  name: string;
  circleColor: string | null;
  avatarRing: string | null;
}

export interface ListDetail {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  coverImageUrl: string | null;
  /** Senaste av att listan skapades eller att en plats lades till — "Senast uppdaterad" */
  lastUpdatedAt: string;
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
            coverImageUrl: l.cover_image_url,
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
      const userId = await requireUserId();
      const { data, error } = await supabase
        .from("lists")
        .select(
          "*, list_members(user_id, role), list_places(id, created_at, added_by, position, places(id, name, image_url, nearest_town, categories, opening_hours))"
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // Namn (+ avatarfärg/ring) till medlemmarna OCH till alla som lagt till en plats — samma
      // fråga täcker båda, ett unikt set av user_id. En rå profiles-fråga visade bara den egna
      // raden (RLS), precis som i Vänner-grunden — rpc_list_profiles_public löser samma sak här.
      const ids = [...new Set([...data.list_members.map((m) => m.user_id), ...data.list_places.map((p) => p.added_by)])];
      const { data: profiles, error: profilesError } = await supabase.rpc("rpc_list_profiles_public", { target_user_ids: ids });
      // Om detta felar (t.ex. migration 015 inte körd i Supabase än) faller alla namn tillbaka
      // till "Medlem" nedan — inte fel i sig, men annars ett osynligt fel att felsöka.
      if (profilesError) console.error("rpc_list_profiles_public misslyckades:", profilesError);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

      const places = data.list_places
        .filter((lp) => lp.places)
        .map((lp) => ({
          rowId: lp.id,
          addedAt: lp.created_at,
          position: lp.position,
          addedBy: {
            userId: lp.added_by,
            name: byId.get(lp.added_by)?.display_name || "Medlem",
            isMe: lp.added_by === userId,
            circleColor: byId.get(lp.added_by)?.circle_color ?? null,
            avatarRing: byId.get(lp.added_by)?.avatar_ring ?? null,
          },
          place: { ...lp.places!, image_url: firstImageUrl(lp.places!.image_url), opening_hours: lp.places!.opening_hours as Record<string, string> | null },
        }))
        // Dra-och-släpp-ordning, inte senast tillagd först — om två har samma position
        // (borde bara hända för äldre rader innan migrationen) faller vi tillbaka på nyast först.
        .sort((a, b) => a.position - b.position || b.addedAt.localeCompare(a.addedAt));

      const lastUpdatedAt = places.length > 0
        ? places.reduce((latest, p) => (p.addedAt > latest ? p.addedAt : latest), data.created_at)
        : data.created_at;

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        ownerId: data.owner_id,
        inviteCode: data.invite_code,
        coverImageUrl: data.cover_image_url,
        lastUpdatedAt,
        places,
        members: data.list_members.map((m) => ({
          userId: m.user_id,
          role: m.role as "owner" | "member",
          name: byId.get(m.user_id)?.display_name || "Medlem",
          circleColor: byId.get(m.user_id)?.circle_color ?? null,
          avatarRing: byId.get(m.user_id)?.avatar_ring ?? null,
        })),
      };
    },
  });
}

/** Ändrar namn/beskrivning på en redan skapad lista ("Redigera lista" i alternativ-menyn). */
export function useUpdateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, name, description }: { listId: string; name: string; description: string }) => {
      const { error } = await supabase
        .from("lists")
        .update({ name: name.trim(), description: description.trim() || null })
        .eq("id", listId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** Väljer en bild, laddar upp den och sätter den som listans omslag. Returnerar false om man avbröt. */
export function useChangeListCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, source }: { listId: string; source: PhotoSource }): Promise<boolean> => {
      const photo = await pickSquarePhoto(source);
      if (!photo) return false;

      const uri = await preparePhoto(photo, 1024);
      const bytes = await (await fetch(uri)).arrayBuffer();
      const path = `${listId}/cover-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from(COVER_BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
      const { data: previous } = await supabase.from("lists").select("cover_image_url").eq("id", listId).maybeSingle();
      const { error } = await supabase.from("lists").update({ cover_image_url: pub.publicUrl }).eq("id", listId);
      if (error) throw error;

      // Rensa den gamla bilden ur bucketen om det fanns en (samma bucket-egna sökväg, inte en
      // adress utanför den, annars skulle vi kunna radera någon annans fil av misstag)
      const previousPath = previous?.cover_image_url?.includes(`/${COVER_BUCKET}/`)
        ? previous.cover_image_url.split(`/${COVER_BUCKET}/`)[1]
        : null;
      if (previousPath) await supabase.storage.from(COVER_BUCKET).remove([previousPath]);

      return true;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** Skapar en ny lista med samma namn (+ "(kopia)"), beskrivning och platser. Inte medlemmarna —
 * en kopia är ett nytt eget rum, inte samma delade grupp. */
export function useDuplicateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (list: ListDetail): Promise<string> => {
      const userId = await requireUserId();
      const { data: created, error } = await supabase
        .from("lists")
        .insert({ name: `${list.name} (kopia)`, description: list.description, owner_id: userId, cover_image_url: list.coverImageUrl })
        .select("id")
        .single();
      if (error) throw error;

      if (list.places.length > 0) {
        const { error: placesError } = await supabase.from("list_places").insert(
          list.places.map((p) => ({ list_id: created.id, place_id: p.place.id, added_by: userId }))
        );
        if (placesError) throw placesError;
      }
      return created.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
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
      // Ny plats ska hamna sist i dra-och-släpp-ordningen, inte längst fram (position 0 är förvalt)
      const { count } = await supabase.from("list_places").select("id", { count: "exact", head: true }).eq("list_id", listId);
      const { error } = await supabase
        .from("list_places")
        .insert({ list_id: listId, place_id: placeId, added_by: userId, position: count ?? 0 });
      // 23505 = platsen ligger redan i listan, det är inte ett fel
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** Sparar den nya ordningen efter drag & drop — ett RPC-anrop med hela listan av rad-id i
 * önskad ordning, i stället för en uppdatering per rad. */
export function useReorderListPlaces() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, orderedRowIds }: { listId: string; orderedRowIds: string[] }) => {
      const { error } = await supabase.rpc("reorder_list_places", { target_list_id: listId, ordered_row_ids: orderedRowIds });
      if (error) throw error;
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
