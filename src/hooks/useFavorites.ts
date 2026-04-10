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

      const { data: existing } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("place_id", placeId)
        .maybeSingle();

      if (existing) {
        await supabase.from("favorites").delete().eq("id", existing.id);
      } else {
        await supabase.from("favorites").insert({
          user_id: user.id,
          place_id: placeId,
          event_id: null,
          service_point_id: null,
        });
      }
    },
    onSuccess: () => {
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
