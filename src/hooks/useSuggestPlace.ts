/**
 * Tips om en plats som saknas i appen. Tipsen sparas i tabellen place_suggestions,
 * som läses i Supabase; databasen begränsar hur många en användare kan skicka per
 * dygn (Error("suggestion_limit")).
 */
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentLanguage } from "@/i18n";

export type SuggestionCategory = "food" | "stay" | "cafe" | "shops" | "nature" | "activities" | "sights" | "crafts";

export interface PlaceSuggestion {
  name: string;
  category: SuggestionCategory | null;
  location: string;
  description: string;
  link: string;
  isOwner: boolean;
}

export function useSuggestPlace() {
  return useMutation({
    mutationFn: async (suggestion: PlaceSuggestion) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");
      // Tabellen finns inte i de genererade typerna än
      const { error } = await (supabase as any).from("place_suggestions").insert({
        user_id: user.id,
        name: suggestion.name.trim(),
        category: suggestion.category,
        location: suggestion.location.trim() || null,
        description: suggestion.description.trim() || null,
        link: suggestion.link.trim() || null,
        is_owner: suggestion.isOwner,
        language: currentLanguage(),
      });
      if (error) {
        if (error.message?.includes("suggestion_limit")) throw new Error("suggestion_limit");
        throw error;
      }
    },
  });
}
