/** Hjälpfunktioner för minnen: datum och gruppering i säsongskapitel. */
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

/** "Sommaren 2026". Dec–feb = vintern, mar–maj = våren, jun–aug = sommaren, sep–nov = hösten. */
export function seasonLabel(day: string): string {
  const month = Number(day.slice(5, 7));
  const year = day.slice(0, 4);
  const season =
    month === 12 || month <= 2 ? "Vintern" : month <= 5 ? "Våren" : month <= 8 ? "Sommaren" : "Hösten";
  return `${season} ${year}`;
}

/** Delar upp minnen (redan sorterade nyast först) i kapitel med bevarad ordning. */
export function groupBySeason<T extends { memoryDate: string }>(memories: T[]): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const m of memories) {
    const label = seasonLabel(m.memoryDate);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }
  return groups;
}
