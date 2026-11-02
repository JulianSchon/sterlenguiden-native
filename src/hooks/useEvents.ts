import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Event = Tables<"events"> & {
  /** Arrangören (platsen eventet hör till) — allt eventpanelen behöver, så den inte hämtar något själv */
  place?: { id: number; name: string; logo_url: string | null; lat: number | null; lng: number | null } | null;
};

/** Hur många månader bakåt evenemang hämtas — kalendern bläddrar lika långt bakåt. Ett helt år, så
 * man alltid kan se vad som hände samma tid förra året ("när var julmarknaden?") */
export const EVENT_MONTHS_BACK = 12;

/** Event från ett år bakåt och framåt, tidigast först. Hem hämtar dem när appen startar, så
 * de finns redan överallt. Äldre hämtas inte — annars växte det här för varje år. */
export async function fetchEvents(): Promise<Event[]> {
  const from = new Date();
  from.setDate(1);
  from.setMonth(from.getMonth() - EVENT_MONTHS_BACK);
  const since = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;
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
