import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Event = Tables<"events"> & {
  time?: string | null;
  end_date?: string | null;
  place?: { name: string; logo_url: string | null } | null;
  // Kolumner som finns i databasen men inte i de genererade typerna än
  /** Kategorin företaget valde (se EVENT_CATEGORIES i lib/events) */
  main_category?: string | null;
  tickets_required?: boolean | null;
  ticket_url?: string | null;
  booking_required?: boolean | null;
  is_sold_out?: boolean | null;
  /** När biljetterna släpps (om de inte gått att köpa än) */
  tickets_release_at?: string | null;
  is_indoor?: boolean | null;
  has_food_drink?: boolean | null;
  has_parking?: boolean | null;
};

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, place:places!events_place_id_fkey(name, logo_url)")
        .order("date", { ascending: true });
      if (error) throw error;
      return data as Event[];
    },
  });
}
