/**
 * Texterna i Mitt företag. Den svenska texten är själva nyckeln: tb("Öppettider") ger "Öppettider"
 * på svenska och översättningen ur listorna i ./business/ på engelska och tyska. Saknas en
 * översättning visas svenskan, så inget går sönder. Variabler skrivs {{0}}, {{1}} …:
 *
 *   tb("{{0}} aktiva erbjudanden", { 0: count })
 *
 * Konstanter på modulnivå (t.ex. listor med etiketter) räknas en gång när appen startar, så de
 * översätts där de visas: tb(item.label).
 *
 * Kassans skärm, mejlen till företagen och villkoren för företag är alltid svenska och använder
 * inte tb.
 */
import { currentLanguage } from "@/i18n";
import { BUSINESS_EN } from "@/i18n/business/en";
import { BUSINESS_DE } from "@/i18n/business/de";

const DICTS: Record<string, Record<string, string>> = { en: BUSINESS_EN, de: BUSINESS_DE };

export function tb(sv: string, vars?: Record<string | number, string | number | null | undefined>): string {
  const text = DICTS[currentLanguage()]?.[sv] ?? sv;
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(vars[k] ?? ""));
}
