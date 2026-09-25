/** Födelsedatum: kontroll av dag/månad/år och ålder. Datum hanteras som "ÅÅÅÅ-MM-DD" (UTC). */

/** Delar → "2005-03-09", eller null om det inte är ett riktigt datum. */
export function toIsoDate(day: string, month: string, year: string): string | null {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || year.length !== 4) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function ageOn(isoDate: string, now = new Date()): number {
  const birth = new Date(isoDate);
  const age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}
