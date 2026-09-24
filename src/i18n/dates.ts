/** Datumformat på användarens språk. Använd i stället för date-fns format() direkt. */
import { format } from "date-fns";
import { sv, enGB, de } from "date-fns/locale";
import { currentLanguage } from "./index";

const LOCALES = { sv, en: enGB, de };

/** formatDate(new Date(), "d MMMM yyyy") → "24 september 2026" / "24 September 2026" / "24. September 2026" */
export function formatDate(date: Date | string | number, pattern: string): string {
  return format(new Date(date), pattern, { locale: LOCALES[currentLanguage()] });
}
