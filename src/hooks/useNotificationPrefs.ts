/**
 * Om användaren vill ha notiser (tabellen notification_preferences, en rad per användare, en
 * brytare). Vad som skickas bestämmer appen, inte användaren: dagens event, nya erbjudanden hos
 * platser man gillat eller besökt och inbjudningar till listor, högst en notis om dagen. Själva
 * utskicket görs av servern som läser samma tabell. Saknas raden är notiserna på.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/session";

const KEY = ["notification-prefs"];
const table = () => supabase.from("notification_preferences");

export function useNotificationsEnabled() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<boolean> => {
      const userId = await requireUserId();
      const { data, error } = await table().select("enabled").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data?.enabled ?? true;
    },
  });
}

/** Sparar direkt i vyn och i bakgrunden; misslyckas det återställs det föregående värdet. */
export function useSetNotificationsEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: async (enabled: boolean) => {
      const userId = await requireUserId();
      const { error } = await table().upsert({ user_id: userId, enabled, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<boolean>(KEY);
      queryClient.setQueryData<boolean>(KEY, enabled);
      return { previous };
    },
    onError: (_error, _enabled, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(KEY, context.previous);
    },
    // Hämta om först när sista sparningen är klar, så en snabb följd av tryck inte ritas över av gamla svar
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: KEY }) <= 1) queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
