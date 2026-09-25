/**
 * Juridiska texter (integritetspolicy, villkor) läses ur tabellen legal_documents så
 * att de kan skrivas och ändras i Supabase utan ny appversion. Finns texten inte på
 * användarens språk används svenska.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentLanguage } from "@/i18n";

export type LegalSlug = "privacy" | "terms" | "pass-terms";

export interface LegalDocument {
  title: string;
  body: string;
  updatedAt: string;
}

export function useLegalDocument(slug: LegalSlug) {
  const language = currentLanguage();
  return useQuery({
    queryKey: ["legal-document", slug, language],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<LegalDocument | null> => {
      // Tabellen finns inte i de genererade typerna än
      const { data, error } = await (supabase as any)
        .from("legal_documents")
        .select("language, title, body, updated_at")
        .eq("slug", slug)
        .in("language", language === "sv" ? ["sv"] : [language, "sv"]);
      if (error) throw error;
      const rows = (data ?? []) as { language: string; title: string; body: string; updated_at: string }[];
      const row = rows.find((r) => r.language === language) ?? rows.find((r) => r.language === "sv");
      return row ? { title: row.title, body: row.body, updatedAt: row.updated_at } : null;
    },
  });
}
