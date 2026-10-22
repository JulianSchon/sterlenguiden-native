/**
 * Öppettiderna som Mitt företag redigerar dem: en dag är stängd, har en eller två tider (lunchstängt),
 * eller har en egen text som appen inte förstår ("Enligt överenskommelse") och lämnar som den är.
 * Sparas i samma form som resten av appen läser (lib/openingHours): "10:00-17:00, 18:00-22:00".
 */
import { DAY_NAMES, clock, exceptionFor, isoDay, parseDay, type Hours, type HoursException } from "@/lib/openingHours";

export interface TimeRange { from: string; to: string }

export type DayEdit =
  | { kind: "closed" }
  | { kind: "open"; ranges: TimeRange[] }
  | { kind: "text"; text: string }
  | { kind: "unset" };

/** Veckodagarna måndag först, som Date.getDay() */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const SHORT_DAYS = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];

const pad = (n: number) => String(n).padStart(2, "0");
/** Minuter → "HH:MM" (midnatt efter dagen blir "00:00") */
export const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const toMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function readDay(text: string | null | undefined): DayEdit {
  if (!text?.trim()) return { kind: "unset" };
  const parsed = parseDay(text);
  if (parsed === "closed") return { kind: "closed" };
  if (parsed === null) return { kind: "text", text: text.trim() };
  return { kind: "open", ranges: parsed.map((r) => ({ from: hhmm(r.from), to: hhmm(r.to) })) };
}

export function writeDay(day: DayEdit): string | null {
  if (day.kind === "unset") return null;
  if (day.kind === "closed") return "Stängt";
  if (day.kind === "text") return day.text;
  return day.ranges.map((r) => `${r.from}-${r.to}`).join(", ");
}

/** "10–17", "11:30–14, 17–22", "Stängt", "–" */
export function dayLabel(day: DayEdit): string {
  if (day.kind === "unset") return "Inte ifyllt";
  if (day.kind === "closed") return "Stängt";
  if (day.kind === "text") return day.text;
  return day.ranges.map((r) => {
    const from = toMin(r.from);
    let to = toMin(r.to);
    if (to <= from) to += 24 * 60;
    return `${clock(from)}–${clock(to)}`;
  }).join(", ");
}

/** Stänger före öppning är tillåtet (det betyder efter midnatt) — men inte samma tid */
export function rangeProblem(r: TimeRange): string | null {
  if (r.from === r.to) return "Öppning och stängning kan inte vara samma tid.";
  return null;
}

/** Stänger efter midnatt ("till 02 natten efter") */
export const pastMidnight = (r: TimeRange) => toMin(r.to) < toMin(r.from) && r.to !== "00:00";

/** Hela veckan ur databasens form */
export function readWeek(hours: Hours): Record<number, DayEdit> {
  const out: Record<number, DayEdit> = {};
  for (const d of WEEK_ORDER) out[d] = readDay(hours?.[DAY_NAMES[d]]);
  return out;
}

/** Tillbaka till databasens form (null om inget är ifyllt) */
export function writeWeek(week: Record<number, DayEdit>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const d of WEEK_ORDER) {
    const v = writeDay(week[d]);
    if (v) out[DAY_NAMES[d]] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const hasAnyHours = (hours: Hours) => !!hours && DAY_NAMES.some((d) => !!hours[d]?.trim());

// ── I dag ───────────────────────────────────────────────────────────────────

/** Dagens egen ändring (bara den dagen), om det finns en */
export function todayOnly(exceptions: HoursException[] | null | undefined, now = new Date()): HoursException | null {
  const day = isoDay(now);
  return (exceptions ?? []).find((e) => e.from === day && e.to === day && !e.yearly) ?? null;
}

/** Undantaget som gäller i dag (en dag, semester eller säsong) */
export const todayException = (exceptions: HoursException[] | null | undefined, now = new Date()) => exceptionFor(exceptions, now);

/** Byter dagens egen ändring (null = ta bort den) och lämnar resten som det var */
export function setToday(exceptions: HoursException[] | null | undefined, change: Omit<HoursException, "id" | "from" | "to"> | null, now = new Date()): HoursException[] {
  const day = isoDay(now);
  const rest = (exceptions ?? []).filter((e) => !(e.from === day && e.to === day && !e.yearly));
  return change ? [...rest, { id: `day-${day}`, from: day, to: day, ...change }] : rest;
}

/** Dagens vanliga tider (från veckan), som en DayEdit */
export function regularToday(hours: Hours, now = new Date()): DayEdit {
  return readDay(hours?.[DAY_NAMES[now.getDay()]]);
}

/** "Vi har inga fasta öppettider" (sparas i telefonen; gör att Kom igång räknar öppettiderna som klara) */
export const noFixedHoursKey = (placeId: number) => `business-no-hours:v1:${placeId}`;

/** Hotell har oftast incheckning, inte öppettider — öppettiderna är frivilliga för dem */
export const isHotel = (categories: string | null | undefined) => /hotell|b&b|boende/i.test(categories ?? "");

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
