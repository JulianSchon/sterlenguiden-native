/** Datumformat på användarens språk. Använd i stället för date-fns format() direkt. */
import { format } from "date-fns";
import { sv, enGB, de } from "date-fns/locale";
import { currentLanguage, type LanguageCode } from "./index";

const LOCALES = { sv, en: enGB, de };

/** date-fns-språket som gäller just nu (för egna format). lng: ett bestämt språk (Mitt företag är alltid svenska) */
export const dateLocale = (lng: LanguageCode = currentLanguage()) => LOCALES[lng];

/** Veckodagens korta namn, måndag först (0 = måndag): "mån" / "Mon" / "Mo". 5 jan 2026 är en måndag */
export function weekdayShort(mondayIndex: number): string {
  return formatDate(new Date(2026, 0, 5 + mondayIndex), "EEE").replace(/\./g, "").slice(0, 3);
}

/** formatDate(new Date(), "d MMMM yyyy") → "24 september 2026" / "24 September 2026" / "24. September 2026" */
export function formatDate(date: Date | string | number, pattern: string, lang: LanguageCode = currentLanguage()): string {
  // På tyska har dagen en punkt före månaden
  const p = lang === "de" ? pattern.replace(/\bd (?=M)/g, "d. ") : pattern;
  return format(new Date(date), p, { locale: LOCALES[lang] });
}
