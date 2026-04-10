import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Event } from "@/hooks/useEvents";
import { addDays, isBefore, startOfDay } from "date-fns";

const POPULAR_LIMIT = 10;

export type PopularEvent = Event & { favorite_count: number };

export function usePopularEvents() {
  return useQuery({
    queryKey: ["events", "popular"],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from("events")
        .select("*, place:places!events_place_id_fkey(name, logo_url)")
        .order("date", { ascending: true });

      if (error) throw error;

      const { data: favCounts, error: favError } = await supabase
        .from("favorites")
        .select("event_id");

      if (favError) throw favError;

      const countMap = new Map<number, number>();
      for (const f of favCounts ?? []) {
        if (f.event_id != null) {
          countMap.set(f.event_id, (countMap.get(f.event_id) ?? 0) + 1);
        }
      }

      const now = startOfDay(new Date());
      const weekFromNow = addDays(now, 7);

      const scored = (events as Event[]).map((event) => {
        const favCount = countMap.get(event.id) ?? 0;
        const eventDate = event.date ? startOfDay(new Date(event.date)) : null;
        const eventEndDate = event.end_date ? startOfDay(new Date(event.end_date)) : eventDate;

        const isPast = eventEndDate ? isBefore(eventEndDate, now) : false;
        const isUpcoming =
          eventDate && !isPast
            ? isBefore(eventDate, weekFromNow) || eventDate.getTime() === weekFromNow.getTime()
            : false;

        let score = 0;
        if (event.is_featured) score += 10000;
        if (isUpcoming) score += 1000;
        if (!isPast) score += 500;
        score += favCount * 10;

        if (eventDate && !isPast) {
          const daysAway = Math.max(0, (eventDate.getTime() - now.getTime()) / 86400000);
          score += Math.max(0, 100 - daysAway);
        }

        return { ...event, favorite_count: favCount, _score: score };
      });

      scored.sort((a, b) => b._score - a._score);

      return scored.slice(0, POPULAR_LIMIT).map(({ _score, ...rest }) => rest) as PopularEvent[];
    },
    staleTime: 2 * 60 * 1000,
  });
}
