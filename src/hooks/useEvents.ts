import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Event = Tables<"events"> & {
  /** Arrangören (platsen eventet hör till) — allt eventpanelen behöver, så den inte hämtar något själv */
  place?: { id: number; name: string; logo_url: string | null; lat: number | null; lng: number | null } | null;
};

/** Alla event, tidigast först. Hem hämtar dem när appen startar, så de finns redan överallt */
export async function fetchEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*, place:places!events_place_id_fkey(id, name, logo_url, lat, lng)")
    .order("date", { ascending: true });
  if (error) throw error;
  return data as unknown as Event[];
}

export function useEvents() {
  return useQuery({ queryKey: ["events"], queryFn: fetchEvents });
}
