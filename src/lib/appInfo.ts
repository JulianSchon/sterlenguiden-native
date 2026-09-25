/** Uppgifter om appen som visas under Inställningar › Om. */
import Constants from "expo-constants";

/** Versionen utan bygg-nummer, t.ex. "1.0.0" */
export const APP_VERSION = Constants.expoConfig?.version ?? "";

/**
 * Adress dit användare kan höra av sig. Fyll i när den finns; först då visas
 * raden "Kontakta oss" på Om-sidan.
 */
export const SUPPORT_EMAIL: string | null = null;
