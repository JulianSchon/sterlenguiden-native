/**
 * "Stämmer något inte?" på platssidan: ett tips om fel (öppettider, kontaktuppgifter, bilder …)
 * sparas i tabellen place_reports (migration 038) och läses i Supabase. Databasen tar högst 10
 * per dygn och person (Error("report_limit")).
 */
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedInUser } from "@/lib/session";

export type ReportKind = "hours" | "contact" | "photos" | "description" | "closed" | "other";

export function useReportPlace() {
  return useMutation({
    meta: { ownError: true },
    mutationFn: async ({ placeId, kind, message }: { placeId: number; kind: ReportKind; message: string }) => {
      const user = await signedInUser();
      if (!user) throw new Error("not_authenticated");
      const { error } = await supabase.from("place_reports").insert({
        place_id: placeId,
        user_id: user.id,
        kind,
        message: message.trim() || null,
      });
      if (error) {
        if (error.message?.includes("report_limit")) throw new Error("report_limit");
        throw error;
      }
    },
  });
}
