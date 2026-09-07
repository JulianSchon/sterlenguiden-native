import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface StoryView {
  story_id: string;
  viewed_at?: string | null;
}

// Stories räknas som "sedda" i 24h – precis som Instagram
const SEEN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function useStoryViews() {
  return useQuery({
    queryKey: ["story-views"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await (supabase as any)
        .from("story_views")
        .select("story_id, viewed_at")
        .eq("user_id", user.id);

      if (error) throw error;

      // Filtrera bort visningar äldre än 24h
      const cutoff = Date.now() - SEEN_WINDOW_MS;
      return (data as StoryView[]).filter((v) => {
        if (!v.viewed_at) return true; // gammal rad utan tidsstämpel = behåll
        return new Date(v.viewed_at).getTime() > cutoff;
      });
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useMarkStoryViewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (storyId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await (supabase as any)
        .from("story_views")
        .upsert(
          { user_id: user.id, story_id: storyId, viewed_at: new Date().toISOString() },
          { onConflict: "user_id,story_id" }
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-views"] });
    },
  });
}
