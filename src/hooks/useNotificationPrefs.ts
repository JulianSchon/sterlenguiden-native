/**
 * Vilka notiser användaren vill ha (tabellen notification_preferences, en rad per
 * användare) och vilka orter som finns att välja mellan. Själva utskicket görs av
 * servern som läser samma tabell. Saknas raden gäller standardvärdena: allt på, hela Österlen.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uniqueTowns } from "@/lib/towns";

export interface NotificationPrefs {
  events: boolean;
  offers: boolean;
  news: boolean;
  pass: boolean;
  /** "all" = hela Österlen, "towns" = bara orterna i `towns` (gäller event och erbjudanden) */
  scope: "all" | "towns";
  towns: string[];
}

export const DEFAULT_PREFS: NotificationPrefs = { events: true, offers: true, news: true, pass: true, scope: "all", towns: [] };

const KEY = ["notification-prefs"];
// Tabellen finns inte i de genererade typerna än
const table = () => (supabase as any).from("notification_preferences");

async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  return user.id;
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<NotificationPrefs> => {
      const userId = await requireUserId();
      const { data, error } = await table().select("events, offers, news, pass, scope, towns").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_PREFS, ...(data ?? {}) };
    },
  });
}

/** Sparar ändringar direkt i vyn och i bakgrunden; misslyckas det återställs föregående värden. */
export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: async (changes: Partial<NotificationPrefs>) => {
      const userId = await requireUserId();
      const { error } = await table().upsert({ user_id: userId, ...changes, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<NotificationPrefs>(KEY);
      queryClient.setQueryData<NotificationPrefs>(KEY, { ...(previous ?? DEFAULT_PREFS), ...changes });
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
    },
    // Hämta om först när sista sparningen är klar, så en snabb följd av tryck inte ritas över av gamla svar
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: KEY }) <= 1) queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Orterna som finns bland platserna, för valet av område. */
export function usePlaceTowns() {
  return useQuery({
    queryKey: ["place-towns"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("places").select("nearest_town").not("nearest_town", "is", null);
      if (error) throw error;
      return uniqueTowns((data ?? []).map((r) => r.nearest_town as string));
    },
  });
}
