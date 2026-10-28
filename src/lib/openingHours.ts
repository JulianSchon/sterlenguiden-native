/**
 * Öppettider. En plats har en text per veckodag ("10-17", "11:30-14, 17-22", "Stängt", "Dygnet
 * runt" …). Här tolkas texterna till tider, och här finns det sidorna säger om dem:
 * "Öppet · stänger 17", "Stänger snart · 17", "Stängt · öppnar tis 10" och veckans rader.
 *
 * Klarar lunchstängt (flera tider samma dag) och tider över midnatt ("18-02" på fredagen gör att
 * platsen är öppen natten till lördag). En text som inte är tider ("Enligt överenskommelse") visas
 * som den är, och då påstår appen inget om öppet eller stängt.
 */
import i18n from "i18next";
import { addDays } from "date-fns";
import { formatDate } from "@/i18n/dates";
import type { LanguageCode } from "@/i18n";

/** Veckodagarna som de heter i databasen, söndag först (som Date.getDay()) */
export const DAY_NAMES = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
const DAY = 24 * 60;

/** En öppen tid i minuter från dagens början. `to` är alltid större än `from` (över midnatt: mer än 24 h) */
interface Range { from: number; to: number }

/** En dag: tiderna, "closed", eller null om dagen saknas eller texten inte är tider */
type DayHours = Range[] | "closed" | null;

export type Hours = Record<string, string> | null | undefined;

export function parseDay(text: string | null | undefined): DayHours {
  if (!text?.trim()) return null;
  if (/st[aä]ngt/i.test(text)) return "closed";
  if (/dygnet/i.test(text)) return [{ from: 0, to: DAY }];
  const ranges: Range[] = [];
  for (const m of text.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?/g)) {
    const from = Number(m[1]) * 60 + Number(m[2] ?? 0);
    let to = Number(m[3]) * 60 + Number(m[4] ?? 0);
    if (to <= from) to += DAY;
    if (from < DAY) ranges.push({ from, to });
  }
  return ranges.length > 0 ? ranges : null;
}

/** "06", "17", "08:30" — timmen alltid med två siffror, midnatt som "24" */
export function clock(min: number): string {
  if (min === DAY) return "24";
  const m = ((min % DAY) + DAY) % DAY;
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  return m % 60 ? `${h}:${String(m % 60).padStart(2, "0")}` : h;
}

const dayOf = (hours: Hours, day: number): DayHours => parseDay(hours?.[DAY_NAMES[((day % 7) + 7) % 7]]);
const minutesOf = (now: Date) => now.getHours() * 60 + now.getMinutes();
const ranges = (d: DayHours): Range[] => (Array.isArray(d) ? d : []);

/** Tiden platsen har öppet just nu (gårdagens tid om den går över midnatt), med stängningen räknad från i dag */
function openRange(hours: Hours, now: Date): Range | null {
  const t = minutesOf(now);
  const today = ranges(dayOf(hours, now.getDay())).find((r) => t >= r.from && t < r.to);
  if (today) return today;
  const late = ranges(dayOf(hours, now.getDay() - 1)).find((r) => r.to > DAY && t < r.to - DAY);
  return late ? { from: 0, to: late.to - DAY } : null;
}

/** Har platsen öppet just nu */
export function isOpenNow(hours: Hours, now = new Date()): boolean {
  return openRange(hours, now) != null;
}

interface TodayHours {
  /** Öppet just nu */
  open: boolean;
  /** Stängningen (öppet) eller nästa öppning i dag (stängt), i minuter */
  closes: number | null;
  opens: number | null;
  /** Öppet hela dygnet */
  allDay: boolean;
  /** Stängt resten av dagen (eller hela) */
  doneToday: boolean;
}

/** Dagens läge, eller null om dagens öppettider inte är kända */
export function todayHours(hours: Hours, now = new Date()): TodayHours | null {
  const open = openRange(hours, now);
  if (open) {
    return { open: true, closes: open.to, opens: null, allDay: open.from === 0 && open.to >= DAY, doneToday: false };
  }
  const today = dayOf(hours, now.getDay());
  if (today === null) return null;
  const t = minutesOf(now);
  const next = ranges(today).find((r) => r.from > t);
  return { open: false, closes: null, opens: next?.from ?? null, allDay: false, doneToday: !next };
}

export type HoursState = "open" | "closingSoon" | "closed";

interface HoursStatus { state: HoursState; label: string }

/** Så länge innan stängning det heter "Stänger snart" */
const SOON_MIN = 60;

/**
 * Det platssidan säger om läget: "Öppet · stänger 17", "Öppet dygnet runt", "Stänger snart · 17",
 * "Stängt · öppnar 10", "Stängt · öppnar i morgon 10", "Stängt · öppnar tis 10" eller "Stängt".
 * null om dagens öppettider inte är kända. lng: ett bestämt språk (Mitt företag är alltid svenska)
 */
export function hoursStatus(hours: Hours, now = new Date(), lng?: LanguageCode): HoursStatus | null {
  const today = todayHours(hours, now);
  if (!today) return null;
  if (today.open) {
    if (today.allDay) return { state: "open", label: i18n.t("hours.allDay", { lng }) };
    const left = today.closes! - minutesOf(now);
    const time = String(clock(today.closes!));
    return left <= SOON_MIN
      ? { state: "closingSoon", label: i18n.t("hours.closingSoon", { time, lng }) }
      : { state: "open", label: i18n.t("hours.openCloses", { time, lng }) };
  }
  if (today.opens != null) return { state: "closed", label: i18n.t("hours.closedOpens", { time: String(clock(today.opens)), lng }) };
  for (let i = 1; i <= 7; i++) {
    const first = ranges(dayOf(hours, now.getDay() + i))[0];
    if (!first) continue;
    const day = i === 1 ? i18n.t("time.tomorrow", { lng }) : formatDate(addDays(now, i), "EEE", lng).replace(".", "");
    return { state: "closed", label: i18n.t("hours.closedOpensDay", { day, time: String(clock(first.from)), lng }) };
  }
  return { state: "closed", label: i18n.t("hours.closed", { lng }) };
}

// ── Undantag: stängt idag, semester, helgdagar, sommartider ──────────────────

/**
 * En tillfällig ändring som företaget lagt in (places.hours_exceptions). Från och med `from` till
 * och med `to` gäller i stället: stängt (`closed`), samma tider varje dag (`hours`), eller en egen
 * vecka (`week`, dagar som saknas är stängda). `yearly` = samma datum varje år (sommartider,
 * säsongsstängt). Datumen är "2026-07-01".
 */
export interface HoursException {
  id: string;
  from: string;
  to: string;
  label?: string | null;
  closed?: boolean;
  hours?: string | null;
  week?: Record<string, string> | null;
  yearly?: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** "2026-07-01" för datumet, i telefonens tid */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function covers(ex: HoursException, day: string): boolean {
  if (!ex.yearly) return ex.from <= day && day <= ex.to;
  // Varje år: bara månad och dag räknas (och perioden kan gå över nyår, t.ex. nov–mars)
  const md = day.slice(5);
  const from = ex.from.slice(5);
  const to = ex.to.slice(5);
  return from <= to ? from <= md && md <= to : md >= from || md <= to;
}

/** Hur många dagar undantaget gäller (det kortaste vinner när flera gäller samma dag) */
function span(ex: HoursException): number {
  return (new Date(ex.to).getTime() - new Date(ex.from).getTime()) / 86_400_000;
}

/** Undantaget som gäller datumet, eller null. Ett enstaka datum går före en hel period. */
export function exceptionFor(list: HoursException[] | null | undefined, date: Date): HoursException | null {
  if (!list?.length) return null;
  const day = isoDay(date);
  let best: HoursException | null = null;
  for (const ex of list) {
    if (covers(ex, day) && (!best || span(ex) <= span(best))) best = ex;
  }
  return best;
}

/** Dagens text med undantaget (som i databasen: "10-17", "Stängt" …) */
function exceptionText(ex: HoursException, date: Date): string {
  if (ex.closed) return "Stängt";
  if (ex.hours) return ex.hours;
  return ex.week?.[DAY_NAMES[date.getDay()]]?.trim() || "Stängt";
}

/**
 * Öppettiderna med undantagen inräknade, för dagarna runt i dag: i går till om fem dagar har var
 * sin veckodag, så "öppet nu", "stänger 17", "öppnar i morgon" och veckans rader stämmer. Allt som
 * läser öppettider (karta, sök, platssidan) får de här tiderna.
 */
export function effectiveHours(hours: Hours, exceptions: HoursException[] | null | undefined, now = new Date()): Hours {
  if (!exceptions?.length) return hours;
  const out: Record<string, string> = { ...(hours ?? {}) };
  let changed = false;
  for (let i = -1; i <= 5; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const ex = exceptionFor(exceptions, date);
    if (ex) {
      out[DAY_NAMES[date.getDay()]] = exceptionText(ex, date);
      changed = true;
    }
  }
  return changed ? out : hours;
}

/** Undantagen från i dag och `days` dagar framåt (för "Stängt 1–14 juli · Semester" på platssidan) */
export function upcomingExceptions(list: HoursException[] | null | undefined, days = 21, now = new Date()): HoursException[] {
  if (!list?.length) return [];
  const today = isoDay(now);
  const until = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  return list
    .filter((ex) => {
      if (!ex.yearly) return ex.to >= today && ex.from <= until;
      // Återkommande: gäller den någon av dagarna?
      for (let i = 0; i <= days; i++) {
        if (covers(ex, isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)))) return true;
      }
      return false;
    })
    .sort((a, b) => a.from.localeCompare(b.from));
}

const dayOfIso = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** "i dag", "i morgon", "24 juni", "1–14 juli", "28 juni–3 juli" */
function exceptionDates(ex: HoursException, now = new Date(), lng?: LanguageCode): string {
  const from = dayOfIso(ex.from);
  const to = dayOfIso(ex.to);
  if (ex.from === ex.to && !ex.yearly) {
    const diff = Math.round((from.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
    if (diff === 0) return i18n.t("time.today", { lng });
    if (diff === 1) return i18n.t("time.tomorrow", { lng });
    return formatDate(from, "d MMMM", lng);
  }
  return from.getMonth() === to.getMonth()
    ? `${from.getDate()}${(lng ?? i18n.language) === "de" ? "." : ""}–${formatDate(to, "d MMMM", lng)}`
    : `${formatDate(from, "d MMMM", lng)}–${formatDate(to, "d MMMM", lng)}`;
}

/** Raden för platssidan: "Stängt i dag · Sjukdom", "Öppet 10–15 i morgon", "Sommartider 15 juni–15 augusti" */
export function exceptionLine(ex: HoursException, now = new Date(), lng?: LanguageCode): string {
  const when = exceptionDates(ex, now, lng);
  const label = ex.label?.trim();
  const note = label ? ` · ${label}` : "";
  if (ex.closed) return i18n.t("hours.exClosed", { when, lng }) + note;
  if (ex.hours) {
    const d = parseDay(ex.hours);
    const text = Array.isArray(d) ? d.map((r) => `${clock(r.from)}–${clock(r.to)}`).join(", ") : ex.hours;
    return i18n.t("hours.exOpen", { hours: text, when, lng }) + note;
  }
  return `${label || i18n.t("hours.exOther", { lng })} ${when}`;
}

interface WeekRow {
  /** Dagens nummer som Date.getDay() */
  day: number;
  name: string;
  /** "10–17", "11:30–14, 17–22", "Stängt", "Dygnet runt", eller platsens egen text */
  text: string;
  today: boolean;
}

/** Veckodagens namn på appens språk (DAY_NAMES är nycklarna i databasen). 4 jan 2026 är en söndag */
// Veckodagarnas namn formateras en gång per språk (att formatera ett datum är långsamt i telefonen,
// och tabellen visas på varje platssida)
const dayNames = new Map<string, string>();
const dayName = (day: number) => {
  const key = `${i18n.language}|${day}`;
  let name = dayNames.get(key);
  if (name === undefined) {
    const formatted = formatDate(new Date(2026, 0, 4 + day), "EEEE");
    name = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    dayNames.set(key, name);
  }
  return name;
};

/** Har platsen angett öppettider för någon dag alls */
export function hasWeekHours(hours: Hours): boolean {
  return !!hours && DAY_NAMES.some((d) => hours[d]?.trim());
}

/** Veckans rader, måndag först. Tomt om platsen inte angett några öppettider alls */
export function weekRows(hours: Hours, now = new Date()): WeekRow[] {
  if (!hours || !hasWeekHours(hours)) return [];
  return [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const raw = hours[DAY_NAMES[day]]?.trim() ?? "";
    const parsed = parseDay(raw);
    const text = parsed === "closed"
      ? i18n.t("hours.closed")
      : parsed === null
        ? raw || "–"
        : parsed.length === 1 && parsed[0].from === 0 && parsed[0].to >= DAY
          ? i18n.t("hours.roundClock")
          : parsed.map((r) => `${clock(r.from)}–${clock(r.to)}`).join(", ");
    return { day, name: dayName(day), text, today: day === now.getDay() };
  });
}
