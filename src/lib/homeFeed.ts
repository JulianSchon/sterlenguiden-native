/**
 * Flödet på Hem: ett enda långt flöde i stället för många små delar. Evenemang, nya erbjudanden,
 * platser att inspireras av, nyheter, vänners besök och en skatt i närheten, blandat efter fasta
 * regler så att det känns genomtänkt och inte slumpat:
 *
 * - Det viktigaste just nu först: ett evenemang i dag eller som pågår.
 * - Aldrig två kort av samma sort i rad (utom platser, när inget annat finns kvar).
 * - Det nya först: erbjudanden och nyheter nyast först, evenemangen rankade för just den här
 *   personen (samma rankning som "För dig" på Kalender).
 * - Platserna väljs efter vad man gillar (besök och favoriter), vad som ligger nära och lite
 *   omväxling: ordningen blandas om varje dag (och när man drar ner för att uppdatera), men står
 *   still medan man tittar.
 * - Allt kommer från riktig data, och ingenting visas två gånger.
 * - Två rader att svepa i sidled läggs in en bit ner: "Öppet nu nära dig" och "I helgen".
 * - Verktygen ligger i flödet, inte i toppen: Upptäck (svepet) som tredje kort och genvägarna in i
 *   Sök ("Vad vill du göra?") en bit längre ner. Så blir toppen lugn, och man möter dem när man
 *   scrollar.
 *
 * Flödet byggs en gång när datan kommit, och sen visas en sida i taget ("Visa mer" längst ner).
 */
import { addDays, getDay } from "date-fns";
import type { Place } from "@/hooks/usePlaces";
import type { Event } from "@/hooks/useEvents";
import type { NewsItem } from "@/hooks/useNews";
import type { Collectible } from "@/hooks/useCollectibles";
import type { FriendVisit } from "@/hooks/useFriendVisits";
import { CATEGORIES, findCategory, type CategoryId } from "@/theme/categories";
import { distanceMeters } from "@/lib/checkin";
import { dayKey, eventDays, lastDay, likedCategories, recommendEvents, type EventPick } from "@/lib/events";
import { distanceLabel } from "@/lib/mapFilters";
import { offerEligibility, type Offer, type RedemptionRow } from "@/lib/offers";
import { openInfo, type OpenInfo } from "@/lib/search";

export interface NearbyPlace { place: Place; km: number; open: OpenInfo | null }

export type FeedItem =
  | { kind: "event"; key: string; pick: EventPick; hero: boolean }
  | { kind: "offer"; key: string; offer: Offer; isNew: boolean }
  | { kind: "place"; key: string; place: Place; reason: string; km: number | null }
  | { kind: "news"; key: string; news: NewsItem }
  | { kind: "friend"; key: string; visit: FriendVisit; place: Place }
  | { kind: "treasure"; key: string; collectible: Collectible; meters: number }
  | { kind: "openNow"; key: string; items: NearbyPlace[] }
  | { kind: "weekend"; key: string; events: Event[] }
  | { kind: "discover"; key: string }
  | { kind: "shortcuts"; key: string };

interface FeedInput {
  places: Place[];
  events: Event[];
  offers: Offer[];
  redemptions: RedemptionRow[];
  news: NewsItem[];
  friendVisits: FriendVisit[];
  collectibles: Collectible[];
  collected: Map<string, string> | undefined;
  favoritePlaceIds: Set<number>;
  savedEventIds: Set<number>;
  visitedPlaceIds: Set<number>;
  /** Kategorierna man själv sagt att man gillar (profiles.interests) */
  interests: string[];
  /** Platser man själv sköter (Mitt företag): deras evenemang är "Ert evenemang" */
  ownPlaceIds?: Set<number>;
  location: { lat: number; lng: number } | null;
  /** Blandningen av platserna: samma hela dagen, ny när man drar ner för att uppdatera */
  seed: number;
  now?: Date;
}

/** Kortens ordning, om och om igen. Saknas en sort tar en plats dess plats */
const PATTERN: FeedItem["kind"][] = [
  "event", "place", "offer", "news", "place", "friend", "event", "place", "treasure",
  "place", "news", "event", "place", "offer", "friend", "place",
];
/** Hur länge ett erbjudande räknas som nytt */
const NEW_OFFER_DAYS = 7;
/** Skatten och "Öppet nu nära dig": så nära de får ligga */
const TREASURE_KM = 15;
const OPEN_NOW_KM = 25;
const RAIL_MAX = 8;
const EVENTS_MAX = 15;
const NEWS_MAX = 10;
/** En nyhet syns i flödet så här länge efter att den publicerats — sedan är den inte en nyhet längre */
const NEWS_DAYS = 21;
const FRIENDS_MAX = 8;

/** Ett tal mellan 0 och 1 som bara beror på fröet och platsen (samma varje gång med samma frö) */
function noise(seed: number, id: number): number {
  let t = (seed ^ Math.imul(id, 2654435761)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Dagens frö: samma hela dagen */
export function daySeed(now = new Date()): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

export function buildFeed(input: FeedInput): FeedItem[] {
  const now = input.now ?? new Date();
  const { places, location } = input;
  const placeById = new Map(places.map((p) => [p.id, p]));
  const kmTo = (p: { lat: number | null; lng: number | null }) =>
    location && p.lat != null && p.lng != null ? distanceMeters(location.lat, location.lng, p.lat, p.lng) / 1000 : null;
  const liked = likedCategories(places, input.visitedPlaceIds, input.favoritePlaceIds, input.interests);

  // ── Evenemangen, rankade för personen; ett som är i dag eller pågår blir det första kortet ──
  const picks = recommendEvents({
    events: input.events,
    places,
    favoritePlaceIds: input.favoritePlaceIds,
    savedEventIds: input.savedEventIds,
    visitedPlaceIds: input.visitedPlaceIds,
    categoryCounts: liked,
    location,
    ownPlaceIds: input.ownPlaceIds,
    now,
  });
  const heroPick = picks.find((p) => p.reason.kind === "today" || p.reason.kind === "ongoing")
    ?? picks.find((p) => {
      const d = p.event.date ?? "";
      return d <= dayKey(now) && (lastDay(p.event) ?? "") >= dayKey(now);
    });
  // I helgen (en rad att svepa) — de eventen blir inte också stora kort
  const weekend = weekendEvents(input.events, now).filter((e) => e.id !== heroPick?.event.id);
  const weekendRail = weekend.length >= 2;
  const weekendIds = new Set(weekendRail ? weekend.map((e) => e.id) : []);
  const events: FeedItem[] = picks
    .filter((p) => p !== heroPick && !weekendIds.has(p.event.id))
    .slice(0, EVENTS_MAX)
    .map((pick) => ({ kind: "event", key: `e${pick.event.id}`, pick, hero: false }));

  // ── Erbjudanden man kan använda, nyast först ──
  const newSince = now.getTime() - NEW_OFFER_DAYS * 86_400_000;
  const offers: FeedItem[] = input.offers
    .filter((o) => offerEligibility(o, input.redemptions).canUse)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((offer) => ({ kind: "offer", key: `o${offer.id}`, offer, isNew: new Date(offer.created_at).getTime() >= newSince }));

  // ── Nyheterna i den ordning redaktionen satt dem ──
  const newsSince = now.getTime() - NEWS_DAYS * 86_400_000;
  const news: FeedItem[] = input.news
    .filter((n) => new Date(n.published_at ?? n.created_at).getTime() >= newsSince)
    .slice(0, NEWS_MAX)
    .map((n) => ({ kind: "news", key: `n${n.id}`, news: n }));

  // ── Vänners besök: det senaste per vän ──
  const seenFriends = new Set<string>();
  const friends: FeedItem[] = [];
  for (const visit of input.friendVisits) {
    const place = placeById.get(visit.placeId);
    if (!place || seenFriends.has(visit.userId)) continue;
    seenFriends.add(visit.userId);
    friends.push({ kind: "friend", key: `f${visit.userId}-${visit.placeId}`, visit, place });
    if (friends.length >= FRIENDS_MAX) break;
  }
  const friendPlaceIds = new Set(friends.map((f) => (f.kind === "friend" ? f.place.id : -1)));

  // ── En skatt man inte hittat, nära där man är ──
  const treasures: FeedItem[] = [];
  if (location && input.collected) {
    const nearest = input.collectibles
      .filter((c) => !input.collected!.has(c.id))
      .map((c) => ({ c, m: distanceMeters(location.lat, location.lng, c.lat, c.lng) }))
      .filter((x) => x.m <= TREASURE_KM * 1000)
      .sort((a, b) => a.m - b.m)[0];
    if (nearest) treasures.push({ kind: "treasure", key: `t${nearest.c.id}`, collectible: nearest.c, meters: nearest.m });
  }

  // ── Öppet nu nära dig (en rad att svepa) — de platserna blir inte också stora kort ──
  const openNear = location
    ? places
      .map((p) => ({ place: p, km: kmTo(p), open: openInfo(p, now) }))
      .filter((x): x is NearbyPlace => x.km != null && x.km <= OPEN_NOW_KM && !!x.open?.open)
      .sort((a, b) => a.km - b.km)
      .slice(0, RAIL_MAX)
    : [];
  const openRail = openNear.length >= 3;
  const openIds = new Set(openRail ? openNear.map((x) => x.place.id) : []);

  // ── Platser att inspireras av: ej favoriter eller besökta, med bild ──
  const catLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.label ?? "";
  const inspiration = places
    .filter((p) => p.image_url && !input.favoritePlaceIds.has(p.id) && !input.visitedPlaceIds.has(p.id)
      && !friendPlaceIds.has(p.id) && !openIds.has(p.id))
    .map((p) => {
      const cat = findCategory(p.category)?.id;
      const likes = cat ? liked.get(cat) ?? 0 : 0;
      const km = kmTo(p);
      const score = Math.min(likes, 3) * 3 + (km != null && km < 15 ? 6 - km * 0.4 : 0)
        + noise(input.seed, p.id) * 5;
      return { p, cat, likes, km, score };
    })
    .sort((a, b) => b.score - a.score);
  const placeItems: FeedItem[] = inspiration.map(({ p, cat, likes, km }) => {
    const open = openInfo(p, now);
    const reason = likes > 0 && cat
      ? `Eftersom du gillar ${catLabel(cat)}`
      : km != null && km < 15
        ? `${distanceLabel(km)} från dig`
        : open?.open
          ? open.label
          : p.nearest_town ? `I ${p.nearest_town}` : "Tips för dig";
    return { kind: "place", key: `p${p.id}`, place: p, reason, km };
  });

  // ── Blanda efter mönstret ──
  const pools: Record<string, FeedItem[]> = {
    event: events, offer: offers, news, friend: friends, treasure: treasures, place: placeItems,
  };
  const take = (kind: string) => pools[kind]?.shift();
  const left = () => Object.values(pools).some((p) => p.length > 0);
  const out: FeedItem[] = heroPick ? [{ kind: "event", key: `e${heroPick.event.id}`, pick: heroPick, hero: true }] : [];
  for (let i = 0; left(); i++) {
    const last = out[out.length - 1]?.kind;
    const want = PATTERN[i % PATTERN.length];
    let item = want !== last ? take(want) : undefined;
    if (!item) {
      // Den sorten är slut (eller kom nyss): en plats, annars något annat som inte nyss kom
      const other = last !== "place" && pools.place.length > 0
        ? "place"
        : Object.keys(pools).find((k) => k !== last && pools[k].length > 0) ?? (pools.place.length > 0 ? "place" : undefined);
      item = other ? take(other) : undefined;
    }
    if (!item) break;
    out.push(item);
  }

  // ── Verktygen och raderna att svepa, på fasta platser (i växande ordning, så platserna stämmer) ──
  const insert = (at: number, item: FeedItem) => out.splice(Math.min(at, out.length), 0, item);
  insert(2, { kind: "discover", key: "discover" });
  if (openRail) insert(4, { kind: "openNow", key: "rail-open", items: openNear });
  insert(7, { kind: "shortcuts", key: "shortcuts" });
  if (weekendRail) insert(12, { kind: "weekend", key: "rail-weekend", events: weekend });

  return out;
}

/** Evenemangen i helgen (fredag–söndag den här veckan), tidigast först */
function weekendEvents(events: Event[], now = new Date()): Event[] {
  const dow = getDay(now); // 0 = söndag
  const friday = addDays(now, dow === 0 ? -2 : 5 - dow);
  const days = new Set([0, 1, 2].map((i) => dayKey(addDays(friday, i))));
  const today = dayKey(now);
  return events
    .filter((e) => (lastDay(e) ?? "") >= today && eventDays(e).some((d) => days.has(d)))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, RAIL_MAX);
}
