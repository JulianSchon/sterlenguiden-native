/**
 * Samlarobjekt: de publicerade stickers (collectibles) och vilka användaren
 * låst upp (user_collectibles). Att låsa upp går bara via databasfunktionen
 * collect_sticker, som själv kontrollerar avståndet.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "Stickers";

export interface Collectible {
  id: string;
  name: string;
  town: string | null;
  /** Kuriosa som visas när stickern är upplåst */
  description: string | null;
  lat: number;
  lng: number;
  /** Filen i lagringsmappen Stickers; saknas den visas en platshållare */
  imagePath: string | null;
  placeId: number | null;
}

/** Alla publicerade samlarobjekt. */
export function useCollectibles() {
  return useQuery({
    queryKey: ["collectibles"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Collectible[]> => {
      const { data, error } = await supabase
        .from("collectibles")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        town: c.town,
        description: c.description,
        lat: c.lat,
        lng: c.lng,
        imagePath: c.image_path,
        placeId: c.place_id,
      }));
    },
  });
}

/** Vilka stickers användaren har: samlarobjektets id → när den låstes upp (ISO). */
export function useCollected() {
  return useQuery({
    queryKey: ["collected"],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Map();
      const { data, error } = await supabase
        .from("user_collectibles")
        .select("collectible_id, collected_at")
        .eq("user_id", user.id);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.collectible_id, r.collected_at]));
    },
  });
}

/** Låser upp en sticker. Kastar Error("too_far") om användaren är för långt bort. */
export function useCollectSticker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectibleId, lat, lng }: { collectibleId: string; lat: number; lng: number }) => {
      const { data, error } = await supabase.rpc("collect_sticker", {
        p_collectible_id: collectibleId,
        p_lat: lat,
        p_lng: lng,
      });
      if (error) throw new Error(error.message.includes("too_far") ? "too_far" : error.message);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collected"] }),
  });
}

/** Öppen adress till stickerns bild. */
export function stickerImageUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
