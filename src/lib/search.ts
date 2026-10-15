/**
 * Söket — allt sker i telefonen (platserna och eventen finns redan där), så svaren kommer direkt
 * på första bokstaven, utan att vänta på nätet.
 *
 * Söket förstår vardagsord: "fika" = Café & Bageri, "sova" = Hotell & B&B, "barn" = barnvänligt,
 * "hund" = hundvänligt, "äta nu" = Mat & Dryck som har öppet, "Kivik" = orten. Hela meningar går
 * bra: "jag är hungrig och har två barn och en hund" blir Mat & Dryck · Barnvänligt · Hundvänligt.
 * Det som blir över söks i namn, kategori, ort och beskrivning — felstavat går också ("kafe",
 * "kivk"), och å/ä/ö spelar ingen roll.
 *
 * Hittas inget med allt man bad om släpps det som saknar uppgifter (t.ex. barnvänligt, som många
 * platser inte angett än) — och svaret säger det. Det blir aldrig tomt i onödan.
 */
import { addDays, format, getDay, startOfDay } from "date-fns";
import type { Place } from "@/hooks/usePlaces";
import type { Event } from "@/hooks/useEvents";
import { lastDay } from "@/lib/events";
import { distanceMeters } from "@/lib/checkin";
import { parseAmenities } from "@/lib/mapFilters";
import { findCategory, type CategoryId } from "@/theme/categories";

/** Gemener, utan accenter och prickar: "Örums Nygård" → "orums nygard", "Café" → "cafe" */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ett tecken i taget, så att positionerna stämmer med originaltexten (för markeringen av träffen) */
export const normChars = (s: string) => [...s].map((c) => norm(c).charAt(0) || c.toLowerCase()).join("");

const words = (s: string) => s.split(/[^a-z0-9]+/).filter(Boolean);

// ── Ordlistan ────────────────────────────────────────────────────────────────

export type PracticalKey = "family" | "pets" | "outdoor" | "accessible" | "vegetarian" | "parking" | "wifi" | "ev";
export type When = "today" | "tomorrow" | "weekend";

type Meaning =
  | { kind: "category"; value: CategoryId }
  | { kind: "practical"; value: PracticalKey }
  | { kind: "open" }
  | { kind: "late" }
  | { kind: "near" }
  | { kind: "events" }
  | { kind: "when"; value: When }
  | { kind: "filler" };

const CATEGORY_WORDS: Record<CategoryId, string[]> = {
  "mat-dryck": ["mat", "ata", "ater", "hungrig", "hungriga", "lunch", "middag", "frukost", "brunch", "restaurang", "restauranger", "krog", "krogar", "kroog", "kvallsmat", "dinner"],
  "cafe-bageri": ["fika", "fikar", "fikat", "kaffe", "cafe", "kafe", "kafeer", "cafeer", "bageri", "bagerier", "konditori", "bulle", "bullar", "kanelbulle", "kanelbullar"],
  "hotell-bb": ["sova", "sover", "boende", "boenden", "hotell", "bnb", "overnatta", "overnattning", "overnatting", "vandrarhem", "stuga", "stugor"],
  "natur-upplevelser": ["natur", "naturen", "vandra", "vandring", "promenad", "promenera", "strand", "strander", "bada", "skog", "skogen"],
  "aktiviteter": ["aktivitet", "aktiviteter", "gora", "upplevelse", "upplevelser"],
  "sevardheter": ["sevardhet", "sevardheter", "museum", "museer", "kyrka", "kyrkor", "slott", "fornminne", "fornminnen"],
  "butiker": ["handla", "shoppa", "shopping", "butik", "butiker", "affar", "affarer", "gardsbutik", "gardsbutiker"],
  "hantverk-service": ["design", "hantverk", "keramik", "atelje", "ateljeer", "galleri", "gallerier", "glasblaseri"],
};

const PRACTICAL_WORDS: Record<PracticalKey, string[]> = {
  family: ["barn", "barnen", "barnvanligt", "barnvanlig", "barnvanliga", "familj", "familjen", "familjevanligt", "ungar", "ungarna", "kids"],
  pets: ["hund", "hunden", "hundar", "hundvanligt", "hundvanlig", "husdjur", "valp"],
  outdoor: ["uteservering", "utomhus", "terrass"],
  accessible: ["rullstol", "tillganglig", "tillgangligt", "tillganglighet", "handikapp", "rullator"],
  vegetarian: ["vegetariskt", "vegetarisk", "vego", "vegan", "veganskt", "vegansk"],
  parking: ["parkering", "parkera"],
  wifi: ["wifi"],
  ev: ["laddstolpe", "elbil", "elbilsladdning"],
};

/** Det praktiska som platsens egenskaper (samma nycklar som kartans filter) */
export const PRACTICAL_LABELS: Record<PracticalKey, string> = {
  family: "Barnvänligt", pets: "Hundvänligt", outdoor: "Uteservering", accessible: "Tillgänglighet",
  vegetarian: "Vegetariskt", parking: "Parkering", wifi: "Wifi", ev: "Laddstolpe",
};

const SINGLE: Record<string, Meaning> = {};
for (const [id, list] of Object.entries(CATEGORY_WORDS)) list.forEach((w) => { SINGLE[w] = { kind: "category", value: id as CategoryId }; });
for (const [id, list] of Object.entries(PRACTICAL_WORDS)) list.forEach((w) => { SINGLE[w] = { kind: "practical", value: id as PracticalKey }; });
["oppet", "oppen", "oppna", "nu"].forEach((w) => { SINGLE[w] = { kind: "open" }; });
["sent", "kvall", "kvallen", "senare"].forEach((w) => { SINGLE[w] = { kind: "late" }; });
["nara", "narheten", "narmast", "narmaste"].forEach((w) => { SINGLE[w] = { kind: "near" }; });
["evenemang", "event", "events", "hander", "handelse", "handelser", "pagang"].forEach((w) => { SINGLE[w] = { kind: "events" }; });
SINGLE.idag = { kind: "when", value: "today" };
SINGLE.ikvall = { kind: "when", value: "today" };
SINGLE.imorgon = { kind: "when", value: "tomorrow" };
SINGLE.helg = { kind: "when", value: "weekend" };
SINGLE.helgen = { kind: "when", value: "weekend" };
[
  "jag", "du", "vi", "ni", "de", "dem", "man", "mig", "dig", "oss", "er", "min", "mitt", "mina", "var", "vart", "vara",
  "ar", "har", "hade", "och", "o", "en", "ett", "tva", "tre", "fyra", "fem", "med", "utan", "vad", "vilken", "vilka",
  "vilket", "kan", "kunna", "ska", "skall", "vill", "att", "som", "det", "den", "i", "pa", "till", "for", "av", "fran",
  "om", "nagon", "nagot", "nagonstans", "nanstans", "nan", "nat", "bra", "lite", "mycket", "hos", "sa", "da", "nar",
  "hur", "finns", "tips", "tipsa", "nagra", "fa", "bli", "inatt", "natt", "gar", "ga", "kommer",
  "efter", "under", "mellan", "mest", "basta", "bast", "gott", "god", "goda", "the", "where", "eat",
].forEach((w) => { SINGLE[w] ??= { kind: "filler" }; });

/** Två ord som hör ihop ("öppet sent", "nära mig", "i morgon") */
const PAIRS: Record<string, Meaning> = {
  "oppet sent": { kind: "late" },
  "nara mig": { kind: "near" },
  "i dag": { kind: "when", value: "today" },
  "i kvall": { kind: "when", value: "today" },
  "i morgon": { kind: "when", value: "tomorrow" },
  "i helgen": { kind: "when", value: "weekend" },
  "pa gang": { kind: "events" },
};

// ── Platserna förberedda för sökning ─────────────────────────────────────────

export interface IndexedPlace {
  place: Place;
  name: string;
  nameWords: string[];
  cats: Set<CategoryId>;
  /** Kategorier och underkategorier som text ("mat & dryck, barn & familj") */
  catText: string;
  town: string;
  text: string;
  amenities: Record<string, boolean>;
  tier: number;
}

const TIER: Record<string, number> = { premium: 2, partner: 1 };

/** En plats kategorier (alla, inte bara den första: "Mat & Dryck, Café & Bageri" är båda) */
export function placeCategories(category: string | null): Set<CategoryId> {
  const out = new Set<CategoryId>();
  (category ?? "").split(",").forEach((part) => {
    const c = findCategory(part.trim());
    if (c) out.add(c.id);
  });
  return out;
}

export function buildIndex(places: Place[]): IndexedPlace[] {
  return places.map((place) => {
    const name = norm(place.name ?? "");
    const sub = (place as Place & { sub_category?: string | null }).sub_category ?? "";
    return {
      place,
      name,
      nameWords: words(name),
      cats: placeCategories(place.category),
      catText: norm(`${place.category ?? ""} ${sub}`),
      town: norm(place.nearest_town ?? ""),
      text: norm(`${place.short_description ?? ""} ${place.description ?? ""}`).slice(0, 1200),
      amenities: parseAmenities((place as Place & { amenities?: unknown }).amenities),
      tier: TIER[place.business_tier ?? ""] ?? 0,
    };
  });
}

// ── Orterna ──────────────────────────────────────────────────────────────────

export interface Town { key: string; name: string; count: number }

/** Orterna ur platsernas närmaste ort, flest platser först (stavningen som är vanligast visas) */
export function buildTowns(places: Place[]): Town[] {
  const byKey = new Map<string, { names: Map<string, number>; count: number }>();
  places.forEach((p) => {
    const raw = p.nearest_town?.trim();
    if (!raw) return;
    const key = norm(raw);
    const entry = byKey.get(key) ?? { names: new Map(), count: 0 };
    entry.count++;
    entry.names.set(raw, (entry.names.get(raw) ?? 0) + 1);
    byKey.set(key, entry);
  });
  return [...byKey.entries()]
    .map(([key, e]) => ({ key, name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0], count: e.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "sv"));
}

// ── Att förstå frågan ────────────────────────────────────────────────────────

export type Intent =
  | { kind: "category"; value: CategoryId; tokens: number[] }
  | { kind: "practical"; value: PracticalKey; tokens: number[] }
  | { kind: "open"; tokens: number[] }
  | { kind: "late"; tokens: number[] }
  | { kind: "town"; value: Town; tokens: number[] }
  | { kind: "events"; tokens: number[] }
  | { kind: "when"; value: When; tokens: number[] };

export interface Parsed {
  /** Frågans ord (normaliserade) */
  tokens: string[];
  intents: Intent[];
  /** Orden som blev över: söks i namn, kategori, ort och text */
  text: string[];
  /** "Nära mig" — sorteras alltid på avstånd ändå, men ordet ska inte sökas som text */
  near: boolean;
}

/** Hur olika två ord är (antal tecken som måste ändras), avbryter när det blir fler än max */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Hur felstavat ett ord får vara: inget för korta ord, ett tecken från 4, två från 7 */
const tolerance = (len: number) => (len >= 7 ? 2 : len >= 4 ? 1 : 0);

export function parseQuery(query: string, towns: Town[]): Parsed {
  const tokens = words(norm(query).replace(/b\s*&\s*b/g, "bnb"));
  const used = new Set<number>();
  const intents: Intent[] = [];
  let near = false;
  const add = (m: Meaning, idx: number[]) => {
    idx.forEach((i) => used.add(i));
    if (m.kind === "category") intents.push({ kind: "category", value: m.value, tokens: idx });
    else if (m.kind === "practical") intents.push({ kind: "practical", value: m.value, tokens: idx });
    else if (m.kind === "open") intents.push({ kind: "open", tokens: idx });
    else if (m.kind === "late") intents.push({ kind: "late", tokens: idx });
    else if (m.kind === "events") intents.push({ kind: "events", tokens: idx });
    else if (m.kind === "when") intents.push({ kind: "when", value: m.value, tokens: idx });
    else if (m.kind === "near") near = true;
  };

  // Orter först (även med flera ord: "Sankt Olof"), sen ord som hör ihop i par
  const joined = ` ${tokens.join(" ")} `;
  towns.forEach((town) => {
    const tw = words(town.key);
    if (tw.length === 0 || !joined.includes(` ${tw.join(" ")} `)) return;
    for (let i = 0; i + tw.length <= tokens.length; i++) {
      if (tw.every((w, k) => tokens[i + k] === w) && tw.every((_, k) => !used.has(i + k))) {
        const idx = tw.map((_, k) => i + k);
        idx.forEach((k) => used.add(k));
        intents.push({ kind: "town", value: town, tokens: idx });
        break;
      }
    }
  });
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (used.has(i) || used.has(i + 1)) continue;
    const m = PAIRS[`${tokens[i]} ${tokens[i + 1]}`];
    if (m) add(m, [i, i + 1]);
  }
  tokens.forEach((t, i) => {
    if (used.has(i)) return;
    const m = SINGLE[t];
    if (m) { add(m, [i]); return; }
    // En felstavad ort ("kivk") — bara för ord som inte är något annat
    const tol = tolerance(t.length);
    if (tol === 0) return;
    const town = towns.find((tw) => !tw.key.includes(" ") && editDistance(t, tw.key, tol) <= tol);
    if (town && !intents.some((x) => x.kind === "town")) {
      used.add(i);
      intents.push({ kind: "town", value: town, tokens: [i] });
    }
  });

  // Samma sak två gånger ("äta … äter") räknas en gång
  const seen = new Set<string>();
  const unique = intents.filter((x) => {
    const key = `${x.kind}:${"value" in x ? (typeof x.value === "object" ? x.value.key : x.value) : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { tokens, intents: unique, text: tokens.filter((t, i) => !used.has(i) && t.length >= 2), near };
}

/** Frågan utan orden en tolkning kom från (krysset på ett "förstod"-chip) */
export function withoutIntent(parsed: Parsed, intent: Intent): string {
  const drop = new Set(intent.tokens);
  return parsed.tokens.filter((_, i) => !drop.has(i)).join(" ");
}

// ── Öppettider ───────────────────────────────────────────────────────────────

const DAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];

/** Dagens öppettider i minuter, eller "stängt", eller null om platsen inte angett några */
function todaysHours(place: Place, now: Date): { from: number; to: number } | "closed" | null {
  const hours = place.opening_hours as Record<string, string> | null;
  const today = hours?.[DAYS[now.getDay()]];
  if (!today) return null;
  if (/st[aä]ngt/i.test(today)) return "closed";
  if (/dygnet/i.test(today)) return { from: 0, to: 24 * 60 };
  const m = today.match(/(\d{1,2})(?:[:.](\d{2}))?\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?/);
  if (!m) return null;
  let to = Number(m[3]) * 60 + Number(m[4] ?? 0);
  if (to === 0) to = 24 * 60;
  return { from: Number(m[1]) * 60 + Number(m[2] ?? 0), to };
}

const clock = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`;
};

export interface OpenInfo { open: boolean; label: string }

/** "Öppet till 17", "Öppnar 10", "Stängt", "Stängt i dag" — null om platsen inte har öppettider */
export function openInfo(place: Place, now = new Date()): OpenInfo | null {
  const h = todaysHours(place, now);
  if (!h) return null;
  if (h === "closed") return { open: false, label: "Stängt i dag" };
  const t = now.getHours() * 60 + now.getMinutes();
  const overMidnight = h.to <= h.from;
  const open = overMidnight ? t >= h.from || t < h.to : t >= h.from && t < h.to;
  if (open) return { open: true, label: h.to >= 24 * 60 && h.from === 0 ? "Öppet dygnet runt" : `Öppet till ${clock(h.to)}` };
  if (t < h.from) return { open: false, label: `Öppnar ${clock(h.from)}` };
  return { open: false, label: "Stängt" };
}

/** Har öppet efter 21 i dag */
export function openLate(place: Place, now = new Date()): boolean {
  const h = todaysHours(place, now);
  if (!h || h === "closed") return false;
  return h.to <= h.from || h.to >= 21 * 60;
}

// ── Platser ──────────────────────────────────────────────────────────────────

export interface PlaceHit {
  place: Place;
  score: number;
  km: number | null;
  open: OpenInfo | null;
  /** Det man bad om som platsen inte angett, men som dess beskrivning nämner ("Nämner barn") */
  mentions: PracticalKey[];
}

/** Ord i beskrivningen som tyder på en egenskap, när platsen inte angett den */
const MENTION_WORDS: Record<PracticalKey, string[]> = {
  family: ["barn", "familj", "lekplats", "lekpark"],
  pets: ["hund", "husdjur"],
  outdoor: ["uteservering", "terrass", "utomhus"],
  accessible: ["tillganglig", "rullstol", "handikapp"],
  vegetarian: ["vegetar", "vegan", "vego"],
  parking: ["parkering"],
  wifi: ["wifi"],
  ev: ["laddstolpe", "laddning"],
};
export const MENTION_LABELS: Record<PracticalKey, string> = {
  family: "barn", pets: "hund", outdoor: "uteservering", accessible: "tillgänglighet",
  vegetarian: "vegetariskt", parking: "parkering", wifi: "wifi", ev: "laddning",
};

export interface PlaceResult {
  hits: PlaceHit[];
  /** Det som släpptes för att det inte gav några träffar (uppgifter platserna inte angett än) */
  relaxed: Intent[];
}

/** Hur bra ett ord träffar en plats (0 = inte alls) */
function tokenScore(p: IndexedPlace, t: string): number {
  let best = 0;
  const tol = tolerance(t.length);
  for (const w of p.nameWords) {
    if (w === t) return 60;
    if (w.startsWith(t)) best = Math.max(best, 45);
    else if (tol && (editDistance(t, w, tol) <= tol || (w.length > t.length && editDistance(t, w.slice(0, t.length), tol) <= tol))) {
      best = Math.max(best, 28);
    }
  }
  if (best < 35 && p.name.includes(t)) best = 35;
  if (best < 20 && p.catText.includes(t)) best = 20;
  if (best < 18 && p.town.startsWith(t)) best = 18;
  if (best < 8 && t.length >= 3 && p.text.includes(t)) best = 8;
  return best;
}

export function searchPlaces(
  index: IndexedPlace[],
  parsed: Parsed,
  loc: { lat: number; lng: number } | null,
  now = new Date(),
): PlaceResult {
  const cats = parsed.intents.flatMap((x) => (x.kind === "category" ? [x.value] : []));
  const town = parsed.intents.find((x) => x.kind === "town");
  const strict = parsed.intents.filter((x) => x.kind === "practical" || x.kind === "open" || x.kind === "late");

  // Orden bakom kategorin och orten: en plats som HETER så räknas också (sök "örum" hittar
  // Örums Nygård även om Örum också är en ort, "fika" hittar ett ställe som heter Fika …)
  const nameHas = (p: IndexedPlace, tokens: number[]) =>
    tokens.every((i) => p.nameWords.some((w) => w.startsWith(parsed.tokens[i])));
  const catTokens = parsed.intents.flatMap((x) => (x.kind === "category" ? x.tokens : []));

  const run = (rules: Intent[], soft: PracticalKey[] = []): PlaceHit[] => {
    const out: PlaceHit[] = [];
    for (const p of index) {
      let bonus = 0;
      if (cats.length > 0 && !cats.some((c) => p.cats.has(c))) {
        if (!nameHas(p, catTokens)) continue;
      }
      if (town?.kind === "town") {
        if (p.town === town.value.key) bonus += 30;
        else if (nameHas(p, town.tokens)) bonus += 60;
        else continue;
      }
      let ok = true;
      for (const r of rules) {
        if (r.kind === "practical") {
          // Barnvänligt: angett, eller en plats under "Barn & Familj"
          const yes = p.amenities[r.value] === true || (r.value === "family" && p.catText.includes("barn & familj"));
          if (!yes) { ok = false; break; }
        } else if (r.kind === "open") {
          if (!openInfo(p.place, now)?.open) { ok = false; break; }
        } else if (r.kind === "late") {
          if (!openLate(p.place, now)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      let score = 0;
      for (const t of parsed.text) {
        const s = tokenScore(p, t);
        if (s === 0) { score = -1; break; }
        score += s;
      }
      if (score < 0) continue;
      const phrase = parsed.text.join(" ");
      if (phrase && p.name.startsWith(phrase)) score += p.name === phrase ? 80 : 40;
      score += bonus + p.tier * 2;
      const km = loc && p.place.lat != null && p.place.lng != null
        ? distanceMeters(loc.lat, loc.lng, p.place.lat, p.place.lng) / 1000
        : null;
      // Släppta egenskaper: platser vars beskrivning nämner dem kommer först (och märks)
      const mentions = soft.filter((k) => MENTION_WORDS[k].some((w) => p.text.includes(w) || p.catText.includes(w)));
      out.push({ place: p.place, score, km, open: openInfo(p.place, now), mentions });
    }
    const byText = parsed.text.length > 0;
    return out.sort((a, b) => {
      if (a.mentions.length !== b.mentions.length) return b.mentions.length - a.mentions.length;
      if (byText && a.score !== b.score) return b.score - a.score;
      const ao = a.open?.open ? 1 : 0;
      const bo = b.open?.open ? 1 : 0;
      if (ao !== bo) return bo - ao;
      if (a.km != null && b.km != null && a.km !== b.km) return a.km - b.km;
      if (a.score !== b.score) return b.score - a.score;
      return a.place.name.localeCompare(b.place.name, "sv");
    });
  };

  let hits = run(strict);
  const relaxed: Intent[] = [];
  // Inget med allt man bad om: släpp först egenskaperna (som många inte angett), sen öppettiden
  if (hits.length === 0 && strict.length > 0) {
    const practical = strict.filter((x) => x.kind === "practical");
    const rest = strict.filter((x) => x.kind !== "practical");
    const soft = practical.flatMap((x) => (x.kind === "practical" ? [x.value] : []));
    if (practical.length > 0) {
      hits = run(rest, soft);
      relaxed.push(...practical);
    }
    if (hits.length === 0 && rest.length > 0) {
      hits = run([], soft);
      relaxed.push(...rest);
    }
  }
  return { hits, relaxed };
}

// ── Evenemang ────────────────────────────────────────────────────────────────

/** Fönstret för "i dag", "i morgon", "i helgen" (fredag–söndag; en lördag/söndag: från i dag) */
function dayWindow(when: When, now: Date): [string, string] {
  const day = startOfDay(now);
  const key = (d: Date) => format(d, "yyyy-MM-dd");
  if (when === "today") return [key(day), key(day)];
  if (when === "tomorrow") return [key(addDays(day, 1)), key(addDays(day, 1))];
  const dow = getDay(day); // 0 = söndag
  if (dow === 0) return [key(day), key(day)];
  if (dow === 6) return [key(day), key(addDays(day, 1))];
  const friday = addDays(day, 5 - dow);
  return [key(friday), key(addDays(friday, 2))];
}

/** Kommande event som matchar. Bara med ord att söka på, eller om man frågar efter evenemang */
export function searchEvents(events: Event[], parsed: Parsed, now = new Date()): Event[] {
  const wants = parsed.intents.some((x) => x.kind === "events" || x.kind === "when");
  if (parsed.text.length === 0 && !wants) return [];
  const today = format(startOfDay(now), "yyyy-MM-dd");
  const when = parsed.intents.find((x) => x.kind === "when");
  const [from, to] = when?.kind === "when" ? dayWindow(when.value, now) : [today, "9999-12-31"];
  return events
    .filter((e) => {
      const end = lastDay(e);
      if (!e.date || !end || end < today) return false;
      if (end < from || e.date > to) return false;
      if (parsed.text.length === 0) return true;
      const hay = norm(`${e.title ?? ""} ${e.place?.name ?? ""} ${e.location ?? ""} ${e.main_category ?? ""} ${e.description ?? ""}`);
      const titleWords = words(norm(e.title ?? ""));
      return parsed.text.every((t) => {
        if (hay.includes(t)) return true;
        const tol = tolerance(t.length);
        return tol > 0 && titleWords.some((w) => editDistance(t, w, tol) <= tol);
      });
    })
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

// ── Orter, och "menade du" ───────────────────────────────────────────────────

/** Orter vars namn matchar det man skrivit (inte den ort som redan förståtts) */
export function searchTowns(towns: Town[], parsed: Parsed): Town[] {
  if (parsed.text.length === 0) return [];
  const chosen = parsed.intents.find((x) => x.kind === "town");
  return towns.filter((tw) =>
    (chosen?.kind !== "town" || chosen.value.key !== tw.key)
    && parsed.text.every((t) => tw.key.startsWith(t) || tw.key.includes(` ${t}`)));
}

/** Inga träffar alls: närmaste stavning bland platsnamn och orter ("Menade du Kivik?") */
export function didYouMean(index: IndexedPlace[], towns: Town[], parsed: Parsed): string | null {
  if (parsed.text.length === 0) return null;
  // Orden som de är skrivna ("Nygård"), nycklade på sin sökform ("nygard")
  const vocabulary = new Map<string, string>();
  index.forEach((p) => (p.place.name ?? "").split(/[^\p{L}\p{N}]+/u).forEach((w) => {
    if (w.length >= 3) vocabulary.set(norm(w), w);
  }));
  towns.forEach((tw) => vocabulary.set(tw.key, tw.name));
  let changed = false;
  const fixed = parsed.text.map((t) => {
    let best: string | null = null;
    let bestD = 3;
    for (const [w, shown] of vocabulary) {
      const d = editDistance(t, w, 2);
      if (d > 0 && d < bestD) { best = shown; bestD = d; }
    }
    if (best) { changed = true; return best; }
    return t;
  });
  return changed ? fixed.join(" ") : null;
}
