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
import i18n from "i18next";
import { dateLocale } from "@/i18n/dates";
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
const short = (d: Date, pattern: string) => format(d, pattern, { locale: dateLocale() }).replace(/\./g, "");

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
  | "own" | "saved" | "favoritePlace" | "visitedPlace" | "category" | "nearby" | "discover"
  | "today" | "ongoing" | "tomorrow" | "weekend" | "soon" | "later";

export interface Reason { kind: ReasonKind; text: string }
export interface EventPick {
  event: Event;
  reason: Reason;
  /** Näst bästa skälet, utan "Du har sparat det" — visas om man tar bort hjärtat (se liveReason) */
  alt: Reason;
  score: number;
}

const savedReason = (): Reason => ({ kind: "saved", text: i18n.t("events.reasons.saved") });

/**
 * Skälet som visas just nu, efter hjärtat: sparar man eventet står det "Du har sparat det", tar man
 * bort det byts texten direkt till nästa bästa skäl (inte först när sidan laddas om).
 */
export function liveReason(pick: EventPick, saved: boolean): Reason {
  if (saved) return pick.reason.kind === "saved" ? pick.reason : savedReason();
  return pick.reason.kind === "saved" ? pick.alt : pick.reason;
}

/** Skäl som handlar om personen (inte bara om när) — de visas hellre än "I morgon" */
const PERSONAL: ReasonKind[] = ["own", "saved", "favoritePlace", "visitedPlace", "category", "nearby", "discover"];

export function recommendEvents({
  events, places, favoritePlaceIds, savedEventIds, visitedPlaceIds, categoryCounts, location, ownPlaceIds, now = new Date(),
}: {
  events: Event[];
  /** Platser man själv sköter (Mitt företag): deras evenemang är "Ert evenemang" */
  ownPlaceIds?: Set<number>;
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

    if (savedEventIds.has(event.id)) reasons.push({ ...savedReason(), weight: 60 });
    if (place && ownPlaceIds?.has(place.id)) {
      reasons.push({ kind: "own", text: i18n.t("events.reasons.own"), weight: 70 });
    } else if (place && favoritePlaceIds.has(place.id)) {
      reasons.push({ kind: "favoritePlace", text: i18n.t("events.reasons.favoritePlace"), weight: 50 });
    } else if (place && visitedPlaceIds.has(place.id)) {
      reasons.push({ kind: "visitedPlace", text: i18n.t("events.reasons.visitedPlace", { place: place.name }), weight: 30 });
    }

    // Kategorin: eventets egen, annars platsens
    const liked = (event.main_category ? EVENT_TO_PLACE[event.main_category] ?? [] : [])
      .concat(place ? [findCategory(place.category)?.id].filter((c): c is CategoryId => !!c) : []);
    const best = liked
      .map((id) => ({ id, count: categoryCounts.get(id) ?? 0 }))
      .sort((a, b) => b.count - a.count)[0];
    if (best && best.count > 0) {
      const label = CATEGORIES.find((c) => c.id === best.id)?.label ?? "";
      reasons.push({ kind: "category", text: i18n.t("events.reasons.category", { category: label }), weight: 12 + 13 * Math.min(1, best.count / 3) });
    } else if (best && hasHistory) {
      reasons.push({ kind: "discover", text: i18n.t("events.reasons.discover"), weight: 6 });
    }

    if (location && place?.lat != null && place?.lng != null) {
      const km = distanceMeters(location.lat, location.lng, place.lat, place.lng) / 1000;
      if (km < 15) reasons.push({ kind: "nearby", text: km < 1 ? i18n.t("events.reasons.nearby") : i18n.t("events.reasons.km", { km: Math.round(km) }), weight: 20 - km });
    }

    const daysAway = Math.max(0, differenceInCalendarDays(parseISO(event.date), now));
    if (event.date < today) reasons.push({ kind: "ongoing", text: i18n.t("events.reasons.ongoing"), weight: 28 });
    else if (daysAway === 0) reasons.push({ kind: "today", text: i18n.t("events.reasons.today"), weight: 28 });
    else if (daysAway === 1) reasons.push({ kind: "tomorrow", text: i18n.t("events.reasons.tomorrow"), weight: 18 });
    else if (weekend.has(event.date)) reasons.push({ kind: "weekend", text: i18n.t("events.reasons.weekend"), weight: 14 });
    else if (daysAway <= 7) reasons.push({ kind: "soon", text: i18n.t(daysAway === 1 ? "events.reasons.soonOne" : "events.reasons.soonOther", { count: daysAway }), weight: 8 });
    else reasons.push({ kind: "later", text: i18n.t("events.reasons.later"), weight: 0 });

    const score = reasons.reduce((sum, r) => sum + r.weight, 0) + (event.is_featured ? 6 : 0) - daysAway * 0.4;
    const strongest = (list: typeof reasons) =>
      list.filter((r) => PERSONAL.includes(r.kind)).sort((a, b) => b.weight - a.weight)[0]
      ?? [...list].sort((a, b) => b.weight - a.weight)[0];
    const top = strongest(reasons);
    const alt = strongest(reasons.filter((r) => r.kind !== "saved"));
    picks.push({ event, score, reason: { kind: top.kind, text: top.text }, alt: { kind: alt.kind, text: alt.text } });
  }
  return picks.sort((a, b) => b.score - a.score);
}

/**
 * Hur mycket man gillar varje platskategori: ett besök räknas en gång, en favorit två, och en
 * kategori man själv valt (onboardingen, Inställningar › Intressen) tre — så tipsen stämmer redan
 * första dagen, och det man sedan faktiskt gör tar över mer och mer.
 */
export function likedCategories(
  places: Place[], visitedPlaceIds: Iterable<number>, favoritePlaceIds: Iterable<number>,
  interests: Iterable<string> = [],
): Map<CategoryId, number> {
  const byId = new Map(places.map((p) => [p.id, p]));
  const counts = new Map<CategoryId, number>();
  const bump = (cat: CategoryId, n: number) => counts.set(cat, (counts.get(cat) ?? 0) + n);
  const add = (id: number, n: number) => {
    const cat = findCategory(byId.get(id)?.category ?? null)?.id;
    if (cat) bump(cat, n);
  };
  for (const id of visitedPlaceIds) add(id, 1);
  for (const id of favoritePlaceIds) add(id, 2);
  for (const id of interests) {
    if (CATEGORIES.some((c) => c.id === id)) bump(id as CategoryId, 3);
  }
  return counts;
}
