import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Favorite {
  id: string;
  user_id: string;
  place_id: number | null;
  event_id: number | null;
  service_point_id: string | null;
  created_at: string;
}

export function useFavorites() {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("favorites")
        .select("id, user_id, place_id, event_id, service_point_id, created_at")
        .eq("user_id", user.id);

      if (error) throw error;
      return data as Favorite[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId }: { placeId: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing, error: findError } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("place_id", placeId)
        .maybeSingle();
      if (findError) throw findError;

      // Felet lästes tidigare aldrig av — misslyckades sparandet (t.ex. RLS) såg det ändå ut
      // att fungera i stunden, tills listan uppdaterades och hjärtat hoppade tillbaka igen.
      if (existing) {
        const { error } = await supabase.from("favorites").delete().eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("favorites").insert({
          user_id: user.id,
          place_id: placeId,
          event_id: null,
          service_point_id: null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (error) => {
      console.error("Kunde inte spara favorit:", error);
    },
  });
}

/**
 * Spara eller ta bort en plats på servern — utan att röra favoritlistan i appen (samma skäl som
 * saveEventFavorite nedan: sidan visar hjärtat direkt och uppdaterar resten av appen senare).
 */
export async function savePlaceFavorite(placeId: number, save: boolean) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (save) {
    const { error } = await supabase.from("favorites").insert({
      user_id: user.id, place_id: placeId, event_id: null, service_point_id: null,
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("place_id", placeId);
    if (error) throw error;
  }
}

/**
 * Spara eller ta bort ett event på servern — utan att röra favoritlistan i appen. För sidor som
 * själva visar hjärtat direkt och uppdaterar resten av appen senare (Kalender): att uppdatera
 * favoritlistan ritar om Hem, Profil, troféräkningen m.fl., och mitt i hjärtanimationen gav det ett hack.
 */
export async function saveEventFavorite(eventId: number, save: boolean) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (save) {
    const { error } = await supabase.from("favorites").insert({
      user_id: user.id, event_id: eventId, place_id: null, service_point_id: null,
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("event_id", eventId);
    if (error) throw error;
  }
}

/**
 * Spara eller ta bort ett event. Hjärtat ändras direkt (listan uppdateras innan servern svarat)
 * och hoppar tillbaka om sparandet misslyckas.
 */
export function useToggleEventFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, save }: { eventId: number; save: boolean }) => saveEventFavorite(eventId, save),
    onMutate: async ({ eventId, save }) => {
      await queryClient.cancelQueries({ queryKey: ["favorites"], exact: true });
      const prev = queryClient.getQueryData<Favorite[]>(["favorites"]);
      queryClient.setQueryData<Favorite[]>(["favorites"], (old = []) =>
        save
          ? [...old, {
            id: `pending-${eventId}`, user_id: "", place_id: null, event_id: eventId,
            service_point_id: null, created_at: new Date().toISOString(),
          }]
          : old.filter((f) => f.event_id !== eventId),
      );
      return { prev };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["favorites"], ctx.prev);
      console.error("Kunde inte spara eventet:", error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}

export function useIsFavorite(placeId?: number, eventId?: number) {
  const { data: favorites = [] } = useFavorites();
  if (placeId) return favorites.some((f) => f.place_id === placeId);
  if (eventId) return favorites.some((f) => f.event_id === eventId);
  return false;
}
