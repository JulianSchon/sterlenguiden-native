import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NewsItem = {
  id: string;
  slug: string;
  title: string;
  ingress: string | null;
  body: string | null;
  cover_image_url: string | null;
  gallery_urls: string[] | null;
  source: string | null;
  category: string | null;
  priority: number;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  place_id: number | null;
  link_url: string | null;
  link_label: string | null;
  place?: { id: number; name: string; nearest_town: string | null } | null;
};

export function useNews(limit = 5) {
  return useQuery({
    queryKey: ["news", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news")
        .select("*, place:places(id, name, nearest_town)")
        .order("is_pinned", { ascending: false })
        .order("priority", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as NewsItem[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useNewsItem(id: string | null) {
  return useQuery({
    queryKey: ["news", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("news")
        .select("*, place:places(id, name, nearest_town)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as NewsItem;
    },
    enabled: !!id,
  });
}
