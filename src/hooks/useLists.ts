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
  /** Senast JAG öppnade listan (list_opens) — null om jag aldrig öppnat den. Styr ordningen i Mitt Österlens listrad. */
  lastOpenedAt: string | null;
}

export interface ListPlace {
  /** Radens id i list_places (inte platsens id) */
  rowId: string;
  addedAt: string;
  /** Dra-och-släpp-ordning */
  position: number;
  addedBy: { userId: string; name: string; isMe: boolean; circleColor: string | null; avatarRing: string | null; avatarPath: string | null };
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
  /** Inbjuden men har inte tackat ja än */
  pending: boolean;
  name: string;
  circleColor: string | null;
  avatarRing: string | null;
  /** Profilbilden — bara för en själv och vänner (rpc_list_profiles_public), annars null */
  avatarPath: string | null;
}

export interface ListDetail {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  coverImageUrl: string | null;
  /** Syns på ägarens profilsida för hens vänner (bara titta) — se useSetListVisibleToFriends */
  visibleToFriends: boolean;
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
 * PENDING-inbjuden till räknas inte med här förrän man accepterat, se usePendingListInvites().
 * Ordning: senast ÖPPNAD (av mig) först, inte senast skapad — listor jag aldrig öppnat (nya,
 * eller öppnade innan list_opens fanns) hamnar sist, i den redan hämtade created_at-ordningen
 * (sorteringen nedan är stabil, så den ordningen består som tiebreak). */
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

      const { data: opens, error: opensError } = await supabase
        .from("list_opens")
        .select("list_id, opened_at")
        .eq("user_id", userId);
      if (opensError) console.error("list_opens misslyckades:", opensError);
      const openedAt = new Map((opens ?? []).map((o) => [o.list_id, o.opened_at as string]));

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
            lastOpenedAt: openedAt.get(l.id) ?? null,
          };
        })
        .sort((a, b) => {
          if (a.lastOpenedAt && b.lastOpenedAt) return b.lastOpenedAt.localeCompare(a.lastOpenedAt);
          if (a.lastOpenedAt) return -1;
          if (b.lastOpenedAt) return 1;
          return 0;
        });
    },
  });
}

/** Registrerar att JAG öppnade en lista just nu — anropas när listans detaljsida öppnas, styr
 * bara sorteringen i Mitt Österlens listrad (se useLists() ovan). */
export function useMarkListOpened() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listId: string) => {
      const userId = await requireUserId();
      const { error } = await supabase
        .from("list_opens")
        .upsert({ user_id: userId, list_id: listId, opened_at: new Date().toISOString() }, { onConflict: "user_id,list_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists", "mine"] }),
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
          "*, list_members(user_id, role, status), list_places(id, created_at, added_by, position, places(id, name, image_url, nearest_town, categories, opening_hours))"
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
      if (profilesError) console.error("rpc_list_profiles_public misslyckades:", profilesError);
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const nameOf = (uid: string) => byId.get(uid)?.display_name || byId.get(uid)?.username || "Medlem";

      const places = data.list_places
        .filter((lp) => lp.places)
        .map((lp) => ({
          rowId: lp.id,
          addedAt: lp.created_at,
          position: lp.position,
          addedBy: {
            userId: lp.added_by,
            name: nameOf(lp.added_by),
            isMe: lp.added_by === userId,
            circleColor: byId.get(lp.added_by)?.circle_color ?? null,
            avatarRing: byId.get(lp.added_by)?.avatar_ring ?? null,
            avatarPath: byId.get(lp.added_by)?.avatar_path ?? null,
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
        visibleToFriends: data.visible_to_friends,
        lastUpdatedAt,
        places,
        members: data.list_members.map((m) => ({
          userId: m.user_id,
          role: m.role as "owner" | "member",
          pending: m.status === "pending",
          name: nameOf(m.user_id),
          circleColor: byId.get(m.user_id)?.circle_color ?? null,
          avatarRing: byId.get(m.user_id)?.avatar_ring ?? null,
          avatarPath: byId.get(m.user_id)?.avatar_path ?? null,
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

/**
 * Visa listan för vänner eller inte (bara ägaren). Det är något annat än att bjuda in dem: vänner
 * som ser listan kan bara titta, de blir inte medlemmar och kan inte ändra något (migration 033).
 */
export function useSetListVisibleToFriends() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, visible }: { listId: string; visible: boolean }) => {
      const { error } = await supabase.from("lists").update({ visible_to_friends: visible }).eq("id", listId);
      if (error) throw error;
    },
    // Reglaget slår om direkt; går sparandet fel hämtas det riktiga läget igen
    onMutate: ({ listId, visible }) => {
      queryClient.setQueryData<ListDetail | null>(["lists", "detail", listId], (old) => (old ? { ...old, visibleToFriends: visible } : old));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** En listas som en vän valt att visa för sina vänner (bara titta). */
export interface FriendList {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  /** I listans egen ordning */
  placeIds: number[];
}

/** En väns synliga listor, nyast först — tom om ni inte är vänner (rpc_friend_lists, migration 033). */
export function useFriendLists(friendUserId: string | null) {
  return useQuery({
    queryKey: ["lists", "friend", friendUserId],
    enabled: !!friendUserId,
    queryFn: async (): Promise<FriendList[]> => {
      const { data, error } = await supabase.rpc("rpc_friend_lists", { target_user_id: friendUserId! });
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        coverImageUrl: l.cover_image_url,
        placeIds: (l.place_ids ?? []).map(Number),
      }));
    },
  });
}

/**
 * En väns lista i samma form som de egna (ListDetail), så att den visas på den vanliga listsidan —
 * bara titta (se app/lists/[id].tsx, view=friend). Bara listor ägaren visar för vänner; null annars.
 * Inga medlemmar: vem som är med i listan syns inte för vänner.
 */
export function useFriendListDetail(listId: string | undefined, ownerId: string | undefined) {
  return useQuery({
    queryKey: ["lists", "friend-detail", listId],
    enabled: !!listId && !!ownerId,
    queryFn: async (): Promise<ListDetail | null> => {
      const userId = await requireUserId();
      const { data: lists, error } = await supabase.rpc("rpc_friend_lists", { target_user_id: ownerId! });
      if (error) throw error;
      const meta = (lists ?? []).find((l) => l.id === listId);
      if (!meta) return null;

      const { data: rows, error: rowsError } = await supabase.rpc("rpc_friend_list_places", { target_list_id: listId! });
      if (rowsError) throw rowsError;
      const placeIds = [...new Set((rows ?? []).map((r) => Number(r.place_id)))];
      const addedByIds = [...new Set((rows ?? []).map((r) => r.added_by))];
      const [{ data: placeRows }, { data: profiles }] = await Promise.all([
        placeIds.length > 0
          ? supabase.from("places").select("id, name, image_url, nearest_town, categories, opening_hours").in("id", placeIds)
          : Promise.resolve({ data: [] as never[] }),
        addedByIds.length > 0
          ? supabase.rpc("rpc_list_profiles_public", { target_user_ids: addedByIds })
          : Promise.resolve({ data: [] as never[] }),
      ]);
      const placeById = new Map((placeRows ?? []).map((p) => [p.id, p]));
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      const places: ListPlace[] = (rows ?? [])
        .filter((r) => placeById.has(Number(r.place_id)))
        .map((r) => {
          const p = placeById.get(Number(r.place_id))!;
          const who = byId.get(r.added_by);
          return {
            rowId: r.row_id,
            addedAt: r.created_at,
            position: r.position,
            addedBy: {
              userId: r.added_by,
              name: who?.display_name || who?.username || "Medlem",
              isMe: r.added_by === userId,
              circleColor: who?.circle_color ?? null,
              avatarRing: who?.avatar_ring ?? null,
              avatarPath: who?.avatar_path ?? null,
            },
            place: { ...p, image_url: firstImageUrl(p.image_url), opening_hours: p.opening_hours as Record<string, string> | null },
          };
        });

      const lastUpdatedAt = places.reduce((latest, p) => (p.addedAt > latest ? p.addedAt : latest), meta.created_at);
      return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        ownerId: ownerId!,
        inviteCode: "",
        coverImageUrl: meta.cover_image_url,
        visibleToFriends: true,
        lastUpdatedAt,
        places,
        members: [],
      };
    },
  });
}

/** Rensar den gamla omslagsbilden ur bucketen om det fanns en (samma bucket-egna sökväg, inte en
 * adress utanför den, annars skulle vi kunna radera någon annans fil av misstag). Delad av både
 * byte och återställning — båda ersätter en ev. tidigare uppladdad bild. */
async function deletePreviousCoverIfOwned(previousUrl: string | null | undefined) {
  const path = previousUrl?.includes(`/${COVER_BUCKET}/`) ? previousUrl.split(`/${COVER_BUCKET}/`)[1] : null;
  if (path) await supabase.storage.from(COVER_BUCKET).remove([path]);
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

      await deletePreviousCoverIfOwned(previous?.cover_image_url);
      return true;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** "Återställ" — tar bort en vald omslagsbild och går tillbaka till det automatiska collaget av
 * listans platsbilder (cover_image_url = null). */
export function useResetListCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (listId: string) => {
      const { data: previous } = await supabase.from("lists").select("cover_image_url").eq("id", listId).maybeSingle();
      const { error } = await supabase.from("lists").update({ cover_image_url: null }).eq("id", listId);
      if (error) throw error;
      await deletePreviousCoverIfOwned(previous?.cover_image_url);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/** Skapar en ny lista med samma namn (+ "(kopia)"), beskrivning och platser. Inte medlemmarna —
 * en kopia är ett nytt eget rum, inte samma delade grupp. */
/** En ny lista som jag äger, med samma platser i samma ordning. Returnerar dess id. */
async function insertListCopy(list: ListDetail, name: string, coverImageUrl: string | null): Promise<string> {
  const userId = await requireUserId();
  const { data: created, error } = await supabase
    .from("lists")
    .insert({ name, description: list.description, owner_id: userId, cover_image_url: coverImageUrl })
    .select("id")
    .single();
  if (error) throw error;

  if (list.places.length > 0) {
    const { error: placesError } = await supabase.from("list_places").insert(
      list.places.map((p, i) => ({ list_id: created.id, place_id: p.place.id, added_by: userId, position: i }))
    );
    if (placesError) throw placesError;
  }
  return created.id;
}

export function useDuplicateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (list: ListDetail) => insertListCopy(list, `${list.name} (kopia)`, list.coverImageUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });
}

/**
 * "Spara en kopia" av en väns lista: en egen lista med samma namn, beskrivning och platser som
 * man sen själv äger och kan ändra i. Vännens omslagsbild följer inte med (den är vännens fil) —
 * kopian får ett collage av platsernas bilder i stället.
 */
export function useCopyFriendList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (list: ListDetail) => insertListCopy(list, list.name, null),
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

/** Tar bort en plats ur listan via (listId, placeId) i stället för radens eget id — Lägg till
 * plats-arket känner bara till placeId, inte list_places-radens id, eftersom useAddPlaceToList
 * inte returnerar den. Gör det möjligt att trycka en andra gång på en nyss tillagd plats för att
 * ångra tillägget, inte bara ta bort den från listsidans egen platsrad. */
export function useRemovePlaceFromListByPlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, placeId }: { listId: string; placeId: number }) => {
      const { error } = await supabase.from("list_places").delete().eq("list_id", listId).eq("place_id", placeId);
      if (error) throw error;
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
