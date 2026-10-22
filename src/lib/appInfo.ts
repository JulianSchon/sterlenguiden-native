/** Uppgifter om appen som visas under Inställningar › Om. */
import Constants from "expo-constants";

/** Versionen utan bygg-nummer, t.ex. "1.0.0" */
export const APP_VERSION = Constants.expoConfig?.version ?? "";

/**
 * Adress dit användare kan höra av sig. Fyll i när den finns; först då visas
 * raden "Kontakta oss" på Om-sidan.
 */
export const SUPPORT_EMAIL: string | null = null;

/**
 * Dit företagen mejlar: hjälp, och beviset när de tar över en plats utan e-post (Mitt företag).
 * Adressen behöver finnas på riktigt innan appen släpps – byt här om den ändras.
 */
export const BUSINESS_EMAIL = "hej@osterlenappen.se";

/**
 * Adresser till de juridiska texterna på webbplatsen. Fyll i när sidorna finns; en rad
 * visas på Om-sidan först när dess adress är satt. Apple kräver dessutom en publik
 * adress till integritetspolicyn när appen skickas in.
 */
export const LEGAL_URLS: Record<"privacy" | "terms" | "passTerms", string | null> = {
  privacy: null,
  terms: null,
  passTerms: null,
};
