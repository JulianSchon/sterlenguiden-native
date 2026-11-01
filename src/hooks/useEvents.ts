import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Event = Tables<"events"> & {
  /** Arrangören (platsen eventet hör till) — allt eventpanelen behöver, så den inte hämtar något själv */
  place?: { id: number; name: string; logo_url: string | null; lat: number | null; lng: number | null } | null;
};

/** Hur långt bakåt evenemang hämtas (kalendern kan bläddra några månader bakåt) */
const HISTORY_DAYS = 90;

/** Event från de senaste månaderna och framåt, tidigast först. Hem hämtar dem när appen startar, så
 * de finns redan överallt. Äldre hämtas inte — annars växte det här för varje år. */
export async function fetchEvents(): Promise<Event[]> {
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("events")
    .select("*, place:places!events_place_id_fkey(id, name, logo_url, lat, lng)")
    .or(`date.gte.${since},end_date.gte.${since}`)
    .order("date", { ascending: true });
  if (error) throw error;
  return data as unknown as Event[];
}

export function useEvents() {
  return useQuery({ queryKey: ["events"], queryFn: fetchEvents });
}
