/**
 * Språkstöd (svenska, engelska, tyska) med i18next.
 *
 * Vid start används enhetens språk (svenska/tyska, annars engelska — en dansk
 * telefon får alltså engelska). Ett val användaren gjort sparas lokalt och
 * gäller före allt annat. Texter hämtas med useTranslation():
 *
 *   const { t } = useTranslation();
 *   <Text>{t("settings.title")}</Text>
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as SecureStore from "expo-secure-store";
import { sv } from "./locales/sv";
import { en } from "./locales/en";
import { de } from "./locales/de";

export type LanguageCode = "sv" | "en" | "de";

export const LANGUAGES: { code: LanguageCode; name: string }[] = [
  { code: "sv", name: "Svenska" },
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
];

const STORAGE_KEY = "app-language";

const isLanguage = (value: unknown): value is LanguageCode =>
  value === "sv" || value === "en" || value === "de";

function deviceLanguage(): LanguageCode {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  if (locale.startsWith("sv")) return "sv";
  if (locale.startsWith("de")) return "de";
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    sv: { translation: sv },
    en: { translation: en },
    de: { translation: de },
  },
  lng: deviceLanguage(),
  fallbackLng: "sv",
  interpolation: { escapeValue: false },
});

/** Läser in ett tidigare val av språk. Anropas en gång när appen startar. */
export async function loadSavedLanguage(): Promise<void> {
  try {
    const saved = await SecureStore.getItemAsync(STORAGE_KEY);
    if (isLanguage(saved)) await i18n.changeLanguage(saved);
  } catch {
    // Ingen sparad inställning: enhetens språk gäller
  }
}

/** Byter språk direkt och kommer ihåg valet. */
export function setLanguage(code: LanguageCode): void {
  i18n.changeLanguage(code);
  SecureStore.setItemAsync(STORAGE_KEY, code).catch(() => {});
}

export function currentLanguage(): LanguageCode {
  return isLanguage(i18n.language) ? i18n.language : "sv";
}

export default i18n;
