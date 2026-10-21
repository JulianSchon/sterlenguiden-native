import { useQuery } from "@tanstack/react-query";
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

/**
 * Sparar att berättelsen setts. Uppdaterar inte listan i appen — visaren gör det när den stängs, så
 * cirklarna på Hem inte byter plats medan man tittar.
 */
export async function markStoryViewed(storyId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const row = { user_id: user.id, story_id: storyId, viewed_at: new Date().toISOString() };
    const { error } = await (supabase as any).from("story_views").upsert(row, { onConflict: "user_id,story_id" });
    // Saknar tabellen regeln om en rad per person och berättelse (migration 041) nekas upsert —
    // då sparas en vanlig rad i stället (en dubblett gör inget, den räknas ändå som sedd)
    if (error) await (supabase as any).from("story_views").insert(row);
  } catch {
    // Inget att göra — den räknas som osedd nästa gång
  }
}
