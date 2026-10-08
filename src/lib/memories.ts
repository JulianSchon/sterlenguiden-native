/** Hjälpfunktioner för minnen: datum. */
import { format } from "date-fns";
import { sv } from "date-fns/locale";

/** "14 jul 2026" ur "2026-07-14". */
export function formatMemoryDate(day: string): string {
  return format(new Date(day), "d MMM yyyy", { locale: sv });
}

/** Är texten ett riktigt datum på formen ÅÅÅÅ-MM-DD? */
export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}
