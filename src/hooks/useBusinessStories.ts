import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BusinessStory {
  id: string;
  user_id: string;
  place_id: number;
  image_url: string;
  caption: string | null;
  filter: string | null;
  is_premium: boolean;
  deal_text: string | null;
  expires_at: string | null;
  created_at: string;
  place?: { name: string; logo_url: string | null };
}

export function useBusinessStories() {
  return useQuery({
    queryKey: ["business-stories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("business_stories")
        .select("*, place:places(name, logo_url)")
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
