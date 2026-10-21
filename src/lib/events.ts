/**
 * Event: datum, kategorier och rankningen på "För dig".
 *
 * "För dig" är EN lista rankad för just den här användaren, inte fasta sektioner ("I helgen",
 * "Nära dig" …) — företagen lägger själva ut eventen, så det kan vara tre i veckan eller trettio,
 * och fasta sektioner blir tomma och ser trasiga ut när det är glest. Varje event får ett skäl
 * ("En av dina favoritplatser", "Eftersom du gillar Mat & Dryck" …), det är det som gör att sidan känns
 * som att appen vet vem man är.
 */
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, getDay, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import type { Event } from "@/hooks/useEvents";
import type { Place } from "@/hooks/usePlaces";
import { findCategory, CATEGORIES, type CategoryId } from "@/theme/categories";
import { distanceMeters } from "@/lib/checkin";

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/** Alla dagar ett event pågår — ett flerdagarsevent syns på varje dag i kalendern */
export function eventDays(e: Pick<Event, "date" | "end_date">): string[] {
  if (!e.date) return [];
  if (!e.end_date || e.end_date <= e.date) return [e.date];
  return eachDayOfInterval({ start: parseISO(e.date), end: parseISO(e.end_date) }).map(dayKey);
}

/** Sista dagen eventet pågår */
export const lastDay = (e: Pick<Event, "date" | "end_date">) =>
  e.end_date && e.date && e.end_date > e.date ? e.end_date : e.date;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (d: Date, pattern: string) => format(d, pattern, { locale: sv }).replace(/\./g, "");

/** "Fre 30 okt · 15:00", eller "14–16 maj" för ett event som pågår flera dagar */
export function eventWhen(e: Pick<Event, "date" | "end_date" | "time">): string {
  if (!e.date) return "";
  const start = parseISO(e.date);
  if (e.end_date && e.end_date > e.date) {
    const end = parseISO(e.end_date);
    return start.getMonth() === end.getMonth()
      ? `${format(start, "d")}–${short(end, "d MMM")}`
      : `${short(start, "d MMM")} – ${short(end, "d MMM")}`;
  }
  const day = cap(short(start, "EEE d MMM"));
  return e.time ? `${day} · ${e.time}` : day;
}

/** Datumrutan på eventets bild: "30" över "OKT" (flera dagar: "14–16" över "MAJ") */
export function dateBadge(e: Pick<Event, "date" | "end_date">): { day: string; month: string } | null {
  if (!e.date) return null;
  const start = parseISO(e.date);
  const month = (d: Date) => short(d, "MMM").toUpperCase();
  if (!e.end_date || e.end_date <= e.date) return { day: format(start, "d"), month: month(start) };
  const end = parseISO(e.end_date);
  return {
    day: `${format(start, "d")}–${format(end, "d")}`,
    month: start.getMonth() === end.getMonth() ? month(start) : `${month(start)}–${month(end)}`,
  };
}

/** Eventkategorierna företagen väljer bland */
export const EVENT_CATEGORIES = [
  "Musik", "Matupplevelse", "Konst & Kultur", "Marknad", "Familj", "Natur", "Guidning", "Hälsa & Välmående", "Övrigt",
];

/** Vilka platskategorier ett event "hör ihop med" — så besök och favoriter säger vad man gillar */
const EVENT_TO_PLACE: Record<string, CategoryId[]> = {
  "Matupplevelse": ["mat-dryck", "cafe-bageri"],
  "Musik": ["aktiviteter"],
  "Konst & Kultur": ["sevardheter", "hantverk-service"],
  "Marknad": ["butiker", "hantverk-service"],
  "Familj": ["aktiviteter", "natur-upplevelser"],
  "Natur": ["natur-upplevelser"],
  "Guidning": ["sevardheter", "natur-upplevelser"],
  "Hälsa & Välmående": ["hotell-bb", "aktiviteter"],
};

export type ReasonKind =
  | "saved" | "favoritePlace" | "visitedPlace" | "category" | "nearby" | "discover"
  | "today" | "ongoing" | "tomorrow" | "weekend" | "soon" | "later";

export interface Reason { kind: ReasonKind; text: string }
export interface EventPick { event: Event; reason: Reason; score: number }

/** Skäl som handlar om personen (inte bara om när) — de visas hellre än "I morgon" */
const PERSONAL: ReasonKind[] = ["saved", "favoritePlace", "visitedPlace", "category", "nearby", "discover"];

export function recommendEvents({
  events, places, favoritePlaceIds, savedEventIds, visitedPlaceIds, categoryCounts, location, now = new Date(),
}: {
  events: Event[];
  places: Place[];
  favoritePlaceIds: Set<number>;
  savedEventIds: Set<number>;
  visitedPlaceIds: Set<number>;
  /** Hur mycket man gillar varje platskategori (besök + favoriter) */
  categoryCounts: Map<CategoryId, number>;
  location: { lat: number; lng: number } | null;
  now?: Date;
}): EventPick[] {
  const today = dayKey(now);
  const placeById = new Map(places.map((p) => [p.id, p]));
  const hasHistory = categoryCounts.size > 0;
  // Helgen: fredag–söndag den här veckan
  const dow = getDay(now); // 0 = söndag
  const friday = addDays(now, dow === 0 ? -2 : 5 - dow);
  const weekend = new Set([0, 1, 2].map((i) => dayKey(addDays(friday, i))));

  const picks: EventPick[] = [];
  for (const event of events) {
    if (!event.date || (lastDay(event) ?? "") < today) continue;
    const place = event.place_id != null ? placeById.get(event.place_id) : undefined;
    const reasons: { kind: ReasonKind; text: string; weight: number }[] = [];

    if (savedEventIds.has(event.id)) reasons.push({ kind: "saved", text: "Du har sparat det", weight: 60 });
    if (place && favoritePlaceIds.has(place.id)) {
      reasons.push({ kind: "favoritePlace", text: "Hos en av dina favoritplatser", weight: 50 });
    } else if (place && visitedPlaceIds.has(place.id)) {
      reasons.push({ kind: "visitedPlace", text: `Du har varit på ${place.name}`, weight: 30 });
    }

    // Kategorin: eventets egen, annars platsens
    const liked = (event.main_category ? EVENT_TO_PLACE[event.main_category] ?? [] : [])
      .concat(place ? [findCategory(place.category)?.id].filter((c): c is CategoryId => !!c) : []);
    const best = liked
      .map((id) => ({ id, count: categoryCounts.get(id) ?? 0 }))
      .sort((a, b) => b.count - a.count)[0];
    if (best && best.count > 0) {
      const label = CATEGORIES.find((c) => c.id === best.id)?.label ?? "";
      reasons.push({ kind: "category", text: `Eftersom du gillar ${label}`, weight: 12 + 13 * Math.min(1, best.count / 3) });
    } else if (best && hasHistory) {
      reasons.push({ kind: "discover", text: "Något nytt för dig", weight: 6 });
    }

    if (location && place?.lat != null && place?.lng != null) {
      const km = distanceMeters(location.lat, location.lng, place.lat, place.lng) / 1000;
      if (km < 15) reasons.push({ kind: "nearby", text: km < 1 ? "Precis i närheten" : `${Math.round(km)} km från dig`, weight: 20 - km });
    }

    const daysAway = Math.max(0, differenceInCalendarDays(parseISO(event.date), now));
    if (event.date < today) reasons.push({ kind: "ongoing", text: "Pågår nu", weight: 28 });
    else if (daysAway === 0) reasons.push({ kind: "today", text: "I dag", weight: 28 });
    else if (daysAway === 1) reasons.push({ kind: "tomorrow", text: "I morgon", weight: 18 });
    else if (weekend.has(event.date)) reasons.push({ kind: "weekend", text: "I helgen", weight: 14 });
    else if (daysAway <= 7) reasons.push({ kind: "soon", text: `Om ${daysAway} dagar`, weight: 8 });
    else reasons.push({ kind: "later", text: "Snart på Österlen", weight: 0 });

    const score = reasons.reduce((sum, r) => sum + r.weight, 0) + (event.is_featured ? 6 : 0) - daysAway * 0.4;
    const personal = reasons.filter((r) => PERSONAL.includes(r.kind)).sort((a, b) => b.weight - a.weight)[0];
    const top = personal ?? [...reasons].sort((a, b) => b.weight - a.weight)[0];
    picks.push({ event, score, reason: { kind: top.kind, text: top.text } });
  }
  return picks.sort((a, b) => b.score - a.score);
}

/** Hur mycket man gillar varje platskategori: ett besök räknas en gång, en favorit två */
export function likedCategories(
  places: Place[], visitedPlaceIds: Iterable<number>, favoritePlaceIds: Iterable<number>,
): Map<CategoryId, number> {
  const byId = new Map(places.map((p) => [p.id, p]));
  const counts = new Map<CategoryId, number>();
  const add = (id: number, n: number) => {
    const cat = findCategory(byId.get(id)?.category ?? null)?.id;
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + n);
  };
  for (const id of visitedPlaceIds) add(id, 1);
  for (const id of favoritePlaceIds) add(id, 2);
  return counts;
}
