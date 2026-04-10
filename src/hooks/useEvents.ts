import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Event = Tables<"events"> & {
  time?: string | null;
  end_date?: string | null;
  place?: { name: string; logo_url: string | null } | null;
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
