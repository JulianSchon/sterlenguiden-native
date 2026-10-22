/**
 * Vilka berättelser man sett (i 24 timmar, som i Instagram). Sparas på två ställen: i telefonen
 * (så den grå ringen alltid stämmer, direkt och även utan nät) och på servern (story_views, så det
 * följer med kontot). Listan är de båda ihop.
 */
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/integrations/supabase/client";

interface StoryView {
  story_id: string;
  viewed_at?: string | null;
}

// Stories räknas som "sedda" i 24h – precis som Instagram
const SEEN_WINDOW_MS = 24 * 60 * 60 * 1000;
const localKey = (userId: string) => `story-seen:v1:${userId}`;

/** Det telefonen minns: berättelse → när den sågs (bara de senaste 24 timmarna) */
async function readLocal(userId: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(localKey(userId));
    const all = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const cutoff = Date.now() - SEEN_WINDOW_MS;
    return Object.fromEntries(Object.entries(all).filter(([, at]) => new Date(at).getTime() > cutoff));
  } catch {
    return {};
  }
}

export function useStoryViews() {
  return useQuery({
    queryKey: ["story-views"],
    queryFn: async (): Promise<StoryView[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const seen = await readLocal(user.id);
      const cutoff = Date.now() - SEEN_WINDOW_MS;
      const { data, error } = await (supabase as any)
        .from("story_views")
        .select("story_id, viewed_at")
        .eq("user_id", user.id);
      if (!error) {
        for (const v of (data ?? []) as StoryView[]) {
          // Gammal rad utan tidsstämpel räknas som sedd
          const at = v.viewed_at ?? new Date().toISOString();
          if (new Date(at).getTime() > cutoff && !(seen[v.story_id] > at)) seen[v.story_id] = at;
        }
      }
      return Object.entries(seen).map(([story_id, viewed_at]) => ({ story_id, viewed_at }));
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Sparar att berättelsen setts: först i telefonen, sen på servern. Uppdaterar inte listan i appen —
 * visaren gör det när den stängs, så cirklarna på Hem inte byter plats medan man tittar.
 */
export async function markStoryViewed(storyId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const at = new Date().toISOString();
    const seen = await readLocal(user.id);
    seen[storyId] = at;
    await AsyncStorage.setItem(localKey(user.id), JSON.stringify(seen)).catch(() => {});
    const row = { user_id: user.id, story_id: storyId, viewed_at: at };
    const { error } = await (supabase as any).from("story_views").upsert(row, { onConflict: "user_id,story_id" });
    // Nekas upsert (saknad regel i databasen) sparas en vanlig rad i stället — telefonen minns ändå
    if (error) await (supabase as any).from("story_views").insert(row);
  } catch {
    // Telefonen minns i alla fall (om det hann sparas där)
  }
}
