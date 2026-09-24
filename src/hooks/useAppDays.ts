import { useEffect } from "react";
import { AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { swedishDay } from "@/lib/streak";

/** Alla svenska kalenderdagar ("YYYY-MM-DD") då användaren öppnat appen. */
export function useAppDays() {
  return useQuery({
    queryKey: ["app-days"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as string[];
      const { data, error } = await supabase
        .from("app_days")
        .select("day")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.day as string);
    },
  });
}

// Dagen som redan är sparad under den här appsessionen, så vi inte frågar
// databasen varje gång appen kommer i förgrunden.
let recordedDay: string | null = null;

/**
 * Sparar att användaren öppnat appen idag. Körs när appen startar och varje
 * gång den kommer tillbaka i förgrunden (så en app som legat i bakgrunden över
 * midnatt räknar den nya dagen). Samma dag två gånger är ofarligt — databasen
 * har primärnyckel (user_id, day) och dubbletten ignoreras.
 */
export function useRecordAppDay() {
  const queryClient = useQueryClient();

  useEffect(() => {
    async function record() {
      const day = swedishDay();
      if (recordedDay === day) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("app_days")
        .upsert({ user_id: user.id, day }, { onConflict: "user_id,day", ignoreDuplicates: true });
      if (error) return; // försöker igen nästa gång appen öppnas
      recordedDay = day;
      queryClient.invalidateQueries({ queryKey: ["app-days"] });
    }

    record();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") record();
    });
    return () => sub.remove();
  }, [queryClient]);
}
