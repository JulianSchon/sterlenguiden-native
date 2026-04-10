import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface StoryView {
  story_id: string;
}

export function useStoryViews() {
  return useQuery({
    queryKey: ["story-views"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await (supabase as any)
        .from("story_views")
        .select("story_id")
        .eq("user_id", user.id);

      if (error) throw error;
      return data as StoryView[];
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
          { user_id: user.id, story_id: storyId },
          { onConflict: "user_id,story_id" }
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-views"] });
    },
  });
}
