import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedInUser } from "@/lib/session";
import { sendOrQueue } from "@/lib/outbox";

interface Favorite {
  id: string;
  user_id: string;
  place_id: number | null;
  event_id: number | null;
  created_at: string;
}

export function useFavorites() {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const user = await signedInUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("favorites")
        .select("id, user_id, place_id, event_id, created_at")
        .eq("user_id", user.id);

      if (error) throw error;
      return data as Favorite[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Spara eller ta bort en plats på servern — utan att röra favoritlistan i appen (samma skäl som
 * saveEventFavorite nedan: sidan visar hjärtat direkt och uppdaterar resten av appen senare).
 */
export async function savePlaceFavorite(placeId: number, save: boolean) {
  // Utan nät sparas det när nätet är tillbaka (lib/outbox) — kastar bara om servern säger nej
  await sendOrQueue({ kind: "favorite-place", id: placeId, save });
}

/**
 * Spara eller ta bort ett event på servern — utan att röra favoritlistan i appen. För sidor som
 * själva visar hjärtat direkt och uppdaterar resten av appen senare (Kalender): att uppdatera
 * favoritlistan ritar om Hem, Profil, troféräkningen m.fl., och mitt i hjärtanimationen gav det ett hack.
 */
export async function saveEventFavorite(eventId: number, save: boolean) {
  await sendOrQueue({ kind: "favorite-event", id: eventId, save });
}
