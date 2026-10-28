import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StoryInteraction } from "@/lib/business";

export interface BusinessStory {
  id: string;
  user_id: string;
  place_id: number;
  image_url: string;
  caption: string | null;
  expires_at: string | null;
  created_at: string;
  /** Klistermärket som leder till ett erbjudande eller evenemang (rutan i andelar av bilden) */
  link?: { kind: "offer" | "event"; id: string; x: number; y: number; w: number; h: number } | null;
  /** Videostory: filmen, och det genomskinliga lagret med text och klistermärken ovanpå */
  video_url?: string | null;
  overlay_url?: string | null;
  /** Enkät eller fråga, som visas levande ovanpå storyn */
  interaction?: StoryInteraction | null;
  // Inbakad place-data från JOIN – används för att bygga story-grupper
  // utan att vänta på usePlaces()
  place?: {
    name: string;
    logo_url: string | null;
    categories: string | null;
    nearest_town: string | null;
  } | null;
}

export function useBusinessStories() {
  return useQuery({
    queryKey: ["business-stories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stories")
        .select("*, place:places(name, logo_url, categories, nearest_town)")
        .or(
          "expires_at.gte." +
            new Date().toISOString() +
            ",expires_at.is.null"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BusinessStory[];
    },
  });
}
