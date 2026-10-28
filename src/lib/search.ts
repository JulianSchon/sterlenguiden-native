/**
 * Söket — allt sker i telefonen (platserna och eventen finns redan där), så svaren kommer direkt
 * på första bokstaven, utan att vänta på nätet.
 *
 * Söket förstår vardagsord: "fika" = Café & Bageri, "sova" = Hotell & B&B, "barn" = barnvänligt,
 * "hund" = hundvänligt, "äta nu" = Mat & Dryck som har öppet, "Kivik" = orten. Hela meningar går
 * bra: "jag är hungrig och har två barn och en hund" blir Mat & Dryck · Barnvänligt · Hundvänligt.
 * Dag och tid går också: "äta på måndag kväll 19:00" = Mat & Dryck som har öppet måndag kl 19
 * ("kväll" utan klockslag = 19, "lunch" = 12, "kl 18", "18.30", "måndag 19").
 * Det som blir över söks i namn, kategori, ort och beskrivning — felstavat går också ("kafe",
 * "kivk"), och å/ä/ö spelar ingen roll.
 *
 * Hittas inget med allt man bad om släpps det som saknar uppgifter (t.ex. barnvänligt, som många
 * platser inte angett än) — och svaret säger det. Det blir aldrig tomt i onödan.
 *
 * Orden förstås på svenska, engelska och tyska ("eat now", "Kaffee in Kivik", "tonight"), oavsett
 * vilket språk appen står på. Det söket själv skriver (rubriker, meningen när ett chip tas bort)
 * skrivs på appens språk.
 */
import { addDays, format, getDay, startOfDay } from "date-fns";
import i18n from "i18next";
import { dateLocale } from "@/i18n/dates";
import type { Place } from "@/hooks/usePlaces";
import type { Event } from "@/hooks/useEvents";
import { lastDay } from "@/lib/events";
import { distanceMeters } from "@/lib/checkin";
import { DAY_NAMES, clock, parseDay, todayHours, type Hours } from "@/lib/openingHours";
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

// Orden på svenska, engelska och tyska (i sökform: gemener, utan prickar och accenter)
const CATEGORY_WORDS: Record<CategoryId, string[]> = {
  "mat-dryck": ["mat", "ata", "ater", "hungrig", "hungriga", "lunch", "middag", "frukost", "brunch", "restaurang", "restauranger", "krog", "krogar", "kroog", "kvallsmat",
    "food", "eat", "eating", "hungry", "restaurant", "restaurants", "dinner", "breakfast",
    "essen", "hunger", "restaurants", "mittagessen", "abendessen", "fruhstuck", "speisen"],
  "cafe-bageri": ["fika", "fikar", "fikat", "kaffe", "cafe", "kafe", "kafeer", "cafeer", "bageri", "bagerier", "konditori", "bulle", "bullar", "kanelbulle", "kanelbullar",
    "coffee", "cafes", "bakery", "bakeries", "kaffee", "backerei", "konditorei"],
  "hotell-bb": ["sova", "sover", "boende", "boenden", "hotell", "bnb", "overnatta", "overnattning", "overnatting", "vandrarhem", "stuga", "stugor",
    "sleep", "stay", "hotel", "hotels", "accommodation", "hostel", "cabin", "cottage",
    "schlafen", "ubernachten", "ubernachtung", "unterkunft", "pension", "ferienhaus"],
  "natur-upplevelser": ["natur", "naturen", "vandra", "vandring", "promenad", "promenera", "strand", "strander", "bada", "skog", "skogen",
    "nature", "hike", "hiking", "walk", "walking", "beach", "beaches", "swim", "swimming", "forest",
    "wandern", "wanderung", "spaziergang", "baden", "wald"],
  "aktiviteter": ["aktivitet", "aktiviteter", "gora", "upplevelse", "upplevelser",
    "activity", "activities", "experience", "experiences", "aktivitat", "aktivitaten", "erlebnis", "erlebnisse"],
  "sevardheter": ["sevardhet", "sevardheter", "museum", "museer", "kyrka", "kyrkor", "slott", "fornminne", "fornminnen",
    "sights", "sightseeing", "museums", "church", "churches", "castle", "castles",
    "sehenswurdigkeit", "sehenswurdigkeiten", "museen", "kirche", "kirchen", "schloss", "burg"],
  "butiker": ["handla", "shoppa", "shopping", "butik", "butiker", "affar", "affarer", "gardsbutik", "gardsbutiker",
    "shop", "shops", "store", "stores", "einkaufen", "laden", "geschaft", "geschafte", "hofladen"],
  "hantverk-service": ["design", "hantverk", "keramik", "atelje", "ateljeer", "galleri", "gallerier", "glasblaseri",
    "craft", "crafts", "ceramics", "pottery", "gallery", "galleries", "handwerk", "galerie", "topferei"],
};

const PRACTICAL_WORDS: Record<PracticalKey, string[]> = {
  family: ["barn", "barnen", "barnvanligt", "barnvanlig", "barnvanliga", "familj", "familjen", "familjevanligt", "ungar", "ungarna",
    "kids", "children", "child", "family", "kinder", "kindern", "familie", "familienfreundlich"],
  pets: ["hund", "hunden", "hundar", "hundvanligt", "hundvanlig", "husdjur", "valp", "dog", "dogs", "pet", "pets", "hunde", "haustier"],
  outdoor: ["uteservering", "utomhus", "terrass", "outdoor", "outdoors", "terrace", "patio", "terrasse", "draussen", "draußen"],
  accessible: ["rullstol", "tillganglig", "tillgangligt", "tillganglighet", "handikapp", "rullator",
    "wheelchair", "accessible", "accessibility", "rollstuhl", "barrierefrei"],
  vegetarian: ["vegetariskt", "vegetarisk", "vego", "vegan", "veganskt", "vegansk", "vegetarian", "veggie", "vegetarisch"],
  parking: ["parkering", "parkera", "parking", "parkplatz", "parken"],
  wifi: ["wifi", "wlan"],
  ev: ["laddstolpe", "elbil", "elbilsladdning", "charger", "charging", "ev", "ladestation", "elektroauto"],
};

/** Det praktiska som platsens egenskaper (samma nycklar som kartans filter), på appens språk */
export const practicalLabel = (key: PracticalKey): string => i18n.t(`search.practical.${key}`);

const SINGLE: Record<string, Meaning> = {};
for (const [id, list] of Object.entries(CATEGORY_WORDS)) list.forEach((w) => { SINGLE[w] = { kind: "category", value: id as CategoryId }; });
for (const [id, list] of Object.entries(PRACTICAL_WORDS)) list.forEach((w) => { SINGLE[w] = { kind: "practical", value: id as PracticalKey }; });
["oppet", "oppen", "oppna", "nu", "open", "now", "geoffnet", "offen", "jetzt"].forEach((w) => { SINGLE[w] = { kind: "open" }; });
["sent", "senare", "late", "spat"].forEach((w) => { SINGLE[w] = { kind: "late" }; });
["nara", "narheten", "narmast", "narmaste", "near", "nearby", "close", "closest", "nearest", "nahe"].forEach((w) => { SINGLE[w] = { kind: "near" }; });
["evenemang", "event", "events", "hander", "handelse", "handelser", "pagang", "happening", "veranstaltung", "veranstaltungen"].forEach((w) => { SINGLE[w] = { kind: "events" }; });
["idag", "ikvall", "today", "tonight", "heute"].forEach((w) => { SINGLE[w] = { kind: "when", value: "today" }; });
["imorgon", "tomorrow", "morgen"].forEach((w) => { SINGLE[w] = { kind: "when", value: "tomorrow" }; });
["helg", "helgen", "weekend", "wochenende"].forEach((w) => { SINGLE[w] = { kind: "when", value: "weekend" }; });
[
  "jag", "du", "vi", "ni", "de", "dem", "man", "mig", "dig", "oss", "er", "min", "mitt", "mina", "var", "vart", "vara",
  "ar", "har", "hade", "och", "o", "en", "ett", "tva", "tre", "fyra", "fem", "med", "utan", "vad", "vilken", "vilka",
  "vilket", "kan", "kunna", "ska", "skall", "vill", "att", "som", "det", "den", "i", "pa", "till", "for", "av", "fran",
  "om", "nagon", "nagot", "nagonstans", "nanstans", "nan", "nat", "bra", "lite", "mycket", "hos", "sa", "da", "nar",
  "hur", "finns", "tips", "tipsa", "nagra", "fa", "bli", "inatt", "natt", "gar", "ga", "kommer",
  "efter", "under", "mellan", "mest", "basta", "bast", "gott", "god", "goda",
  "eller", "samt", "plus", "bade", "antingen", "ocksa", "aven", "kanske", "garna", "helst", "typ", "vid", "kring",
  "runt", "omkring", "dar", "hit", "dit", "stalle", "stallen", "platser", "hitta", "hittar", "leta", "letar",
  "soka", "soker", "rekommendera", "rekommenderar", "forslag", "nagonting", "ngt", "sugen", "sugna", "suget", "gillar", "alskar",
  // Engelska
  "the", "a", "an", "and", "or", "with", "without", "to", "in", "on", "of", "is", "are", "we", "you", "me", "my", "our",
  "some", "any", "good", "best", "nice", "place", "places", "where", "what", "find", "want", "looking", "something",
  "can", "get", "go", "this", "that", "here", "there", "around", "lets", "let", "us", "please", "recommend",
  "things", "do", "cream", "somewhere", "at",
  // Tyska
  "ich", "wir", "der", "die", "das", "dem", "den", "ein", "eine", "einen", "einem", "und", "oder", "mit", "ohne", "fur",
  "zu", "im", "am", "an", "auf", "von", "ist", "sind", "gut", "gute", "guten", "beste", "besten", "ort", "orte", "wo",
  "was", "finden", "suche", "suchen", "mochte", "mochten", "etwas", "mir", "mich", "uns", "kann", "gibt", "es", "hier",
  "uhr", "bitte", "irgendwo", "um",
].forEach((w) => { SINGLE[w] ??= { kind: "filler" }; });

/** Två ord som hör ihop ("öppet sent", "nära mig", "i morgon", "open late", "in der Nähe") */
const PAIRS: Record<string, Meaning> = {
  "oppet sent": { kind: "late" },
  "nara mig": { kind: "near" },
  "i dag": { kind: "when", value: "today" },
  "i kvall": { kind: "when", value: "today" },
  "i morgon": { kind: "when", value: "tomorrow" },
  "i helgen": { kind: "when", value: "weekend" },
  "pa gang": { kind: "events" },
  "open late": { kind: "late" },
  "late night": { kind: "late" },
  "near me": { kind: "near" },
  "close by": { kind: "near" },
  "spat geoffnet": { kind: "late" },
  "der nahe": { kind: "near" },
  "heute abend": { kind: "when", value: "today" },
};

// ── Smaker och rätter ────────────────────────────────────────────────────────

/**
 * Det man är sugen på, när det inte är en kategori: "torsk" och "räkor" är fisk & skaldjur,
 * "köttbullar" och "dagens" är husmanskost. Appen har inga menyer, så en plats räknas om dess namn,
 * kategori eller beskrivning nämner något av orden (terms). Ett ord med * räknas som början på ett
 * ord ("fisk*" = fisk, fisken, fiskrökeri); utan * måste hela ordet stämma ("ost" ≠ "Österlen").
 * category = vilken kategori smaken hör till (läggs till om man inte sagt någon).
 */
interface Taste { readonly label: string; triggers: string[]; terms: string[]; category?: CategoryId }

/** Smakens namn på appens språk (search.tastes.*) */
const tasteLabel = (key: string) => i18n.t(`search.tastes.${key}` as "search.tastes.fish");

// Orden man skriver (triggers) går på alla tre språken; det platserna nämner (terms) står på svenska,
// för det är så platsernas beskrivningar är skrivna
export const TASTES: Record<string, Taste> = {
  fish: {
    get label() { return tasteLabel("fish"); }, category: "mat-dryck",
    triggers: ["fisk", "fisken", "fiskar", "fiskratt", "fiskratter", "fiskrestaurang", "skaldjur", "seafood", "fish",
      "torsk", "torsken", "lax", "laxen", "sill", "sillen", "stromming", "sjotunga", "kolja", "sej", "gos", "abborre",
      "rodspotta", "makrill", "al", "rakor", "rakmacka", "raksmorgas", "kraftor", "hummer", "musslor", "ostron", "krabba",
      "fiskrokeri", "rokeri", "rokt", "rokta",
      "shrimp", "prawns", "salmon", "cod", "herring", "lobster", "mussels", "oysters", "crab", "smoked",
      "fisch", "meeresfruchte", "garnelen", "lachs", "kabeljau", "hering", "muscheln", "austern", "krabben", "geraucherter"],
    terms: ["fisk*", "skaldjur*", "torsk*", "lax", "laxen", "sill*", "stromming*", "sjotunga", "kolja", "rodspotta", "makrill*",
      "rakor", "raksmorgas*", "rakmacka*", "kraft*", "hummer*", "mussl*", "ostron*", "krabb*", "rokeri*", "rokt", "rokta", "seafood"],
  },
  homestyle: {
    get label() { return tasteLabel("homestyle"); }, category: "mat-dryck",
    triggers: ["husmanskost", "husman", "husmans", "kottbullar", "pyttipanna", "pytt", "dagens", "dagenslunch", "schnitzel",
      "stekt", "flask", "kalops", "svensk", "svenskt", "traditionell", "traditionellt", "hemlagat", "hemlagad",
      "swedish", "traditional", "homestyle", "homemade", "cooking", "meatballs", "hausmannskost", "schwedisch"],
    terms: ["husman*", "dagens", "kottbull*", "pytt*", "schnitzel*", "kalops", "flask*", "traditionell*", "klassisk*",
      "hemlagad*", "hemlagat", "vardshus*", "gastgiveri*", "kro", "krog*", "svensk", "svenska", "skansk*"],
  },
  pizza: { get label() { return tasteLabel("pizza"); }, category: "mat-dryck", triggers: ["pizza", "pizzor", "pizzeria", "pizzan", "pizzas"], terms: ["pizz*"] },
  burger: { get label() { return tasteLabel("burger"); }, category: "mat-dryck", triggers: ["burgare", "hamburgare", "burger", "burgers", "burgaren", "hamburger"], terms: ["burg*", "hamburg*"] },
  asian: {
    get label() { return tasteLabel("asian"); }, category: "mat-dryck",
    triggers: ["sushi", "asiatiskt", "asiatisk", "thai", "thaimat", "wok", "ramen", "kinesiskt", "indiskt", "curry",
      "asian", "chinese", "indian", "asiatisch", "chinesisch", "indisch"],
    terms: ["sushi*", "asiat*", "thai*", "wok*", "ramen", "kines*", "indisk*", "curry*"],
  },
  meat: {
    get label() { return tasteLabel("meat"); }, category: "mat-dryck",
    triggers: ["kott", "biff", "entrecote", "grill", "grillat", "bbq", "steak", "oxfile", "lamm", "vilt",
      "meat", "beef", "lamb", "grilled", "fleisch", "rind"],
    terms: ["kott*", "biff*", "entrecote*", "grill*", "bbq", "oxfile*", "lamm*", "vilt*", "steak*"],
  },
  sweets: {
    get label() { return tasteLabel("sweets"); }, category: "cafe-bageri",
    triggers: ["bakverk", "bakelse", "bakelser", "tarta", "tartor", "semla", "semlor", "kaka", "kakor", "surdeg", "brod",
      "cake", "cakes", "pastry", "pastries", "bread", "sourdough", "cinnamon", "kuchen", "torte", "torten", "geback", "brot", "sauerteig"],
    terms: ["bakverk*", "bakelse*", "tart*", "seml*", "kak*", "surdeg*", "brod*", "bageri*", "konditori*"],
  },
  icecream: { get label() { return tasteLabel("icecream"); }, triggers: ["glass", "glassen", "glassbar", "softglass", "gelato", "ice", "icecream", "eis", "speiseeis", "eisdiele"], terms: ["glass*", "gelato*"] },
  wine: { get label() { return tasteLabel("wine"); }, triggers: ["vin", "vinet", "vinprovning", "vingard", "vingardar", "vinbar", "wine", "winery", "vineyard", "wein", "weingut", "weinprobe"], terms: ["vin", "vinet", "viner", "vingard*", "vinprov*", "vinbar*", "vinodl*"] },
  beer: { get label() { return tasteLabel("beer"); }, triggers: ["ol", "olen", "bryggeri", "olprovning", "mikrobryggeri", "beer", "brewery", "bier", "brauerei"], terms: ["ol", "olen", "bryggeri*", "olprov*", "mikrobryggeri*"] },
  cheese: { get label() { return tasteLabel("cheese"); }, triggers: ["ost", "ostar", "osten", "gardsost", "mejeri", "cheese", "dairy", "kase", "kaserei", "molkerei"], terms: ["ost", "ostar", "osten", "osteri*", "mejeri*", "gardsost*"] },
  apples: { get label() { return tasteLabel("apples"); }, triggers: ["apple", "applen", "musteri", "must", "cider", "appelmust", "apples", "apfel", "apfelsaft"], terms: ["apple*", "musteri*", "must", "cider*", "appelmust*", "apelmust*"] },
  chocolate: { get label() { return tasteLabel("chocolate"); }, triggers: ["choklad", "praliner", "pralin", "chocolate", "pralines", "schokolade", "pralinen"], terms: ["choklad*", "pralin*"] },
};
const TASTE_OF: Record<string, string> = {};
for (const [key, taste] of Object.entries(TASTES)) taste.triggers.forEach((w) => { TASTE_OF[w] ??= key; });

/** Hur många av smakens ord platsen nämner (0 = inga) */
function tasteMatches(words: Set<string>, prefixes: string[], key: string): number {
  let n = 0;
  for (const term of TASTES[key].terms) {
    if (term.endsWith("*")) {
      const stem = term.slice(0, -1);
      if (prefixes.some((w) => w.startsWith(stem))) n++;
    } else if (words.has(term)) n++;
  }
  return n;
}

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
  /** Det företaget själv sagt att de serverar (fish, pizza …, se TASTES) */
  tastes: Set<string>;
  /** Alla ord i namn, kategori och beskrivning (för smakerna) */
  allWords: Set<string>;
  allWordList: string[];
}

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
      tastes: new Set(place.tastes ?? []),
      ...(() => {
        const list = [...new Set(words(`${name} ${norm(`${place.category ?? ""} ${sub}`)} ${norm(`${place.short_description ?? ""} ${place.description ?? ""}`)}`))];
        return { allWords: new Set(list), allWordList: list };
      })(),
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
  | { kind: "when"; value: When; tokens: number[] }
  | ({ kind: "at"; tokens: number[] } & At)
  | { kind: "taste"; value: string; tokens: number[] };

/**
 * En dag och/eller tid man frågar efter ("på måndag", "kl 19", "i kväll"): platserna ska ha öppet då.
 * weekday = veckodag (0 = söndag), rel = i dag (0) eller i morgon (1); minutes = klockslaget i
 * minuter, part = den del av dagen tiden kom från ("kväll") när inget klockslag skrevs.
 */
export type DayPart = "evening" | "morning" | "forenoon" | "afternoon" | "breakfast" | "brunch" | "lunch" | "dinner";

export interface At {
  weekday: number | null;
  rel: 0 | 1 | null;
  minutes: number | null;
  part: DayPart | null;
}

export interface Parsed {
  /** Frågans ord (normaliserade) */
  tokens: string[];
  intents: Intent[];
  /** Orden som blev över: söks i namn, kategori, ort och text */
  text: string[];
  /** Samma ord som de skrevs (med å, ä, ö och stora bokstäver) */
  textOriginal: string[];
  /** "Nära mig" — sorteras alltid på avstånd ändå, men ordet ska inte sökas som text */
  near: boolean;
  /** "göra eller sova" / "äta och sova" — rubriken använder samma sorts ord, på appens språk */
  conj: "and" | "or";
}

/** Hur olika två ord är (antal tecken som måste ändras), avbryter när det blir fler än max */
function editDistance(a: string, b: string, max: number): number {
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

/** Veckodagarna i sökform (0 = söndag, som Date.getDay()) */
const WEEKDAYS: Record<string, number> = {};
["sondag", "mandag", "tisdag", "onsdag", "torsdag", "fredag", "lordag"].forEach((d, i) => {
  [d, `${d}en`, `${d}ar`, `${d}s`].forEach((w) => { WEEKDAYS[w] = i; });
});
["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].forEach((d, i) => {
  [d, `${d}s`].forEach((w) => { WEEKDAYS[w] = i; });
});
["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"].forEach((d, i) => {
  [d, `${d}s`].forEach((w) => { WEEKDAYS[w] = i; });
});
WEEKDAYS.sonnabend = 6;
/** Delar av dagen och vilket klockslag de betyder. alsoCategory = ordet betyder också en kategori (lunch → äta) */
const DAY_PARTS: Record<string, { minutes: number; part: DayPart; alsoCategory?: boolean }> = {
  kvall: { minutes: 19 * 60, part: "evening" }, kvallen: { minutes: 19 * 60, part: "evening" },
  evening: { minutes: 19 * 60, part: "evening" }, abend: { minutes: 19 * 60, part: "evening" }, abends: { minutes: 19 * 60, part: "evening" },
  morgon: { minutes: 9 * 60, part: "morning" }, morgonen: { minutes: 9 * 60, part: "morning" }, morning: { minutes: 9 * 60, part: "morning" },
  formiddag: { minutes: 10 * 60, part: "forenoon" }, formiddagen: { minutes: 10 * 60, part: "forenoon" },
  forenoon: { minutes: 10 * 60, part: "forenoon" }, vormittag: { minutes: 10 * 60, part: "forenoon" },
  eftermiddag: { minutes: 15 * 60, part: "afternoon" }, eftermiddagen: { minutes: 15 * 60, part: "afternoon" },
  afternoon: { minutes: 15 * 60, part: "afternoon" }, nachmittag: { minutes: 15 * 60, part: "afternoon" },
  frukost: { minutes: 8 * 60 + 30, part: "breakfast", alsoCategory: true },
  breakfast: { minutes: 8 * 60 + 30, part: "breakfast", alsoCategory: true },
  fruhstuck: { minutes: 8 * 60 + 30, part: "breakfast", alsoCategory: true },
  brunch: { minutes: 11 * 60, part: "brunch", alsoCategory: true },
  lunch: { minutes: 12 * 60, part: "lunch", alsoCategory: true },
  mittagessen: { minutes: 12 * 60, part: "lunch", alsoCategory: true },
  middag: { minutes: 18 * 60 + 30, part: "dinner", alsoCategory: true },
  dinner: { minutes: 18 * 60 + 30, part: "dinner", alsoCategory: true },
  abendessen: { minutes: 18 * 60 + 30, part: "dinner", alsoCategory: true },
};
/** Ord före ett klockslag: "kl 19", "at 19", "um 19" */
const CLOCK_WORDS = new Set(["kl", "klockan", "at", "um"]);
const isHour = (t: string) => /^\d{1,2}$/.test(t) && Number(t) <= 24;

/**
 * Dag och tid i frågan. Ett klockslag är "19:00", "19.30", "kl 19" eller en timme direkt efter en
 * dag eller del av dagen ("måndag 19") — en ensam siffra kan vara en del av ett namn ("MÅL 19").
 */
function parseAt(tokens: string[], gaps: string[], used: Set<number>): ({ kind: "at"; tokens: number[] } & At) | null {
  let weekday: number | null = null;
  let minutes: number | null = null;
  let part: { minutes: number; part: DayPart } | null = null;
  const idx: number[] = [];
  const take = (...i: number[]) => { i.forEach((k) => { used.add(k); idx.push(k); }); };
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const t = tokens[i];
    if (t in WEEKDAYS) { weekday = WEEKDAYS[t]; take(i); continue; }
    const dp = DAY_PARTS[t];
    if (dp) {
      part = { minutes: dp.minutes, part: dp.part };
      if (dp.alsoCategory) idx.push(i);
      else take(i);
      continue;
    }
    if (CLOCK_WORDS.has(t) && isHour(tokens[i + 1] ?? "")) {
      // "kl 19:00": minuterna hör till klockslaget även när de är 00
      const hasMinutes = /^\d{2}$/.test(tokens[i + 2] ?? "") && /^\s*[:.]\s*$/.test(gaps[i + 1] ?? "");
      const mm = hasMinutes ? Number(tokens[i + 2]) : 0;
      minutes = Number(tokens[i + 1]) * 60 + Math.min(mm, 59);
      take(i, i + 1);
      if (hasMinutes) take(i + 2);
      i += hasMinutes ? 2 : 1;
      continue;
    }
    if (isHour(t) && /^\d{2}$/.test(tokens[i + 1] ?? "") && /^\s*[:.]\s*$/.test(gaps[i] ?? "") && Number(tokens[i + 1]) < 60) {
      minutes = Number(t) * 60 + Number(tokens[i + 1]);
      take(i, i + 1);
      i += 1;
      continue;
    }
    const prev = tokens[i - 1] ?? "";
    if (isHour(t) && Number(t) >= 6 && (prev in WEEKDAYS || prev in DAY_PARTS)) {
      minutes = Number(t) * 60;
      take(i);
    }
  }
  if (weekday === null && minutes === null && !part) return null;
  return { kind: "at", tokens: idx, weekday, rel: null, minutes: minutes ?? part?.minutes ?? null, part: minutes === null ? part?.part ?? null : null };
}

export function parseQuery(query: string, towns: Town[]): Parsed {
  // Orden som de skrevs, och samma ord i sökform (så de alltid hör ihop, ord för ord). gaps = det
  // som stod mellan ett ord och nästa (så "19:00" går att skilja från "19 00")
  const prepared = query.replace(/b\s*&\s*b/gi, "bnb");
  const found = [...prepared.matchAll(/[\p{L}\p{N}]+/gu)];
  const originals = found.map((m) => m[0]);
  const gaps = found.map((m, i) => prepared.slice((m.index ?? 0) + m[0].length, found[i + 1]?.index ?? prepared.length));
  const tokens = originals.map((w) => norm(w));
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
  const at = parseAt(tokens, gaps, used);
  tokens.forEach((t, i) => {
    if (used.has(i)) return;
    const key = TASTE_OF[t];
    if (!key) return;
    used.add(i);
    intents.push({ kind: "taste", value: key, tokens: [i] });
    // Smaken säger vad man vill göra (fisk → äta), om man inte sagt det själv
    const cat = TASTES[key].category;
    if (cat && !tokens.some((w) => SINGLE[w]?.kind === "category")) intents.push({ kind: "category", value: cat, tokens: [] });
  });
  tokens.forEach((t, i) => {
    if (used.has(i)) return;
    const m = SINGLE[t];
    if (m) { add(m, [i]); return; }
    // En felstavad ort ("kivk") — bara för ord som inte är något annat. Den närmaste stavningen
    const tol = tolerance(t.length);
    if (tol === 0) return;
    let town: Town | null = null;
    let best = tol + 1;
    for (const tw of towns) {
      if (tw.key.includes(" ")) continue;
      const d = editDistance(t, tw.key, tol);
      if (d < best) { town = tw; best = d; }
    }
    if (town) {
      used.add(i);
      intents.push({ kind: "town", value: town, tokens: [i] });
    }
  });

  // "i kväll" = i dag kl 19. Finns en dag eller tid gäller den i stället för "nu", och "i dag" /
  // "i morgon" blir dagen den gäller
  const evening = tokens.includes("ikvall") || tokens.includes("tonight")
    || tokens.some((t, i) => (t === "i" && tokens[i + 1] === "kvall") || (t === "heute" && tokens[i + 1] === "abend"));
  let atIntent = at;
  if (evening && !atIntent) atIntent = { kind: "at", tokens: [], weekday: null, rel: 0, minutes: 19 * 60, part: "evening" };
  if (atIntent) {
    const whenIntent = intents.find((x) => x.kind === "when");
    if (whenIntent?.kind === "when" && whenIntent.value !== "weekend" && atIntent.weekday === null) {
      atIntent.rel = whenIntent.value === "today" ? 0 : 1;
      atIntent.tokens = [...whenIntent.tokens, ...atIntent.tokens];
      if (evening && atIntent.minutes === null) { atIntent.minutes = 19 * 60; atIntent.part = "evening"; }
    }
    for (let k = intents.length - 1; k >= 0; k--) {
      const x = intents[k];
      if (x.kind === "open" || (x.kind === "when" && x.value !== "weekend")) {
        atIntent.tokens.push(...x.tokens);
        intents.splice(k, 1);
      }
    }
    intents.push(atIntent);
  }

  // Samma sak två gånger ("äta … äter") räknas en gång
  const seen = new Set<string>();
  const unique = intents.filter((x) => {
    const key = `${x.kind}:${"value" in x ? (typeof x.value === "object" ? x.value.key : x.value) : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const textIdx = tokens.flatMap((t, i) => (!used.has(i) && t.length >= 2 ? [i] : []));
  return {
    tokens,
    intents: unique,
    text: textIdx.map((i) => tokens[i]),
    textOriginal: textIdx.map((i) => originals[i]),
    near,
    conj: tokens.some((t) => t === "eller" || t === "or" || t === "oder") ? "or" : "and",
  };
}

/** Ett ord för det söket förstått, på appens språk — och ett ord som söket själv förstår igen */
const catWord = (id: CategoryId) => i18n.t(`search.words.cat.${id}`);
const practicalWord = (key: PracticalKey) => i18n.t(`search.words.practical.${key}`);
export const whenWord = (when: When) => i18n.t(`search.words.when.${when}`);
const conjWord = (conj: Parsed["conj"]) => i18n.t(conj === "or" ? "search.words.or" : "search.words.and");

/** "19:00", "18:30" */
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** Veckodagens namn på appens språk ("måndag", "Monday", "Montag") */
function weekdayName(day: number): string {
  // 2026-10-04 är en söndag
  return format(addDays(new Date(2026, 9, 4), day), "EEEE", { locale: dateLocale() });
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Dagen och tiden som en del av en mening: "på måndag kl 19:00", "i kväll", "i morgon kl 12:00" */
export function atPhrase(at: At): string {
  const day = at.weekday !== null ? i18n.t("search.at.onDay", { day: weekdayName(at.weekday) })
    : at.rel === 1 ? i18n.t("search.at.tomorrow") : at.rel === 0 ? i18n.t("search.at.today") : "";
  if (at.part === "evening" && at.rel === 0 && at.weekday === null) return i18n.t("search.at.tonight");
  const part = at.part ? i18n.t(`search.at.parts.${at.part}`) : "";
  if (part && day) return `${day} ${part}`;
  const time = part || (at.minutes !== null ? i18n.t("search.at.atTime", { time: hhmm(at.minutes) }) : "");
  return [day, time].filter(Boolean).join(" ");
}

/** Samma sak som en etikett: "Måndag 19:00", "I kväll", "Måndag kväll" */
export function atLabel(at: At): string {
  if (at.part === "evening" && at.rel === 0 && at.weekday === null) return cap(i18n.t("search.at.tonight"));
  const day = at.weekday !== null ? weekdayName(at.weekday)
    : at.rel === 1 ? i18n.t("search.at.tomorrow") : at.rel === 0 ? i18n.t("search.at.today") : "";
  const time = at.part ? i18n.t(`search.at.parts.${at.part}`) : at.minutes !== null ? hhmm(at.minutes) : "";
  return cap([day, time].filter(Boolean).join(" "));
}

/** Dagen (och klockslaget) man frågar efter, räknat från nu: nästa sådan veckodag, i dag eller i morgon */
function atDate(at: At, now = new Date()): Date {
  const day = startOfDay(now);
  const offset = at.weekday !== null ? (at.weekday - getDay(day) + 7) % 7 : at.rel ?? 0;
  const d = addDays(day, offset);
  d.setHours(0, at.minutes ?? 12 * 60, 0, 0);
  return d;
}

/**
 * Frågan utan en av tolkningarna (krysset på ett chip), skriven som en riktig mening av det som
 * är kvar: "äta och sova i Simrishamn" utan Hotell & B&B blir "äta i Simrishamn".
 */
export function withoutIntent(parsed: Parsed, drop: Intent): string {
  const keep = parsed.intents.filter((x) => x !== drop);
  const conj = conjWord(parsed.conj);
  const cats = keep.flatMap((x) => (x.kind === "category" ? [catWord(x.value)] : []));
  const withWords = keep.flatMap((x) => (x.kind === "practical" && (x.value === "family" || x.value === "pets") ? [practicalWord(x.value)] : []));
  const otherPractical = keep.flatMap((x) => (x.kind === "practical" && x.value !== "family" && x.value !== "pets" ? [practicalWord(x.value)] : []));
  const out: string[] = [];
  if (cats.length > 0) out.push(cats.join(` ${conj} `));
  if (parsed.textOriginal.length > 0) out.push(parsed.textOriginal.join(" "));
  if (keep.some((x) => x.kind === "open")) out.push(i18n.t(cats.length > 0 ? "search.words.now" : "search.words.openNow"));
  if (keep.some((x) => x.kind === "late")) out.push(i18n.t(cats.length > 0 ? "search.words.late" : "search.words.openLate"));
  if (withWords.length > 0) out.push(i18n.t("search.words.with", { list: withWords.join(` ${conjWord("and")} `) }));
  out.push(...otherPractical);
  if (keep.some((x) => x.kind === "events")) out.push(i18n.t("search.words.events"));
  const when = keep.find((x) => x.kind === "when");
  if (when?.kind === "when") out.push(whenWord(when.value));
  const at = keep.find((x) => x.kind === "at");
  if (at?.kind === "at") out.push(atPhrase(at));
  keep.forEach((x) => { if (x.kind === "taste") out.push(TASTES[x.value].label.toLowerCase()); });
  const townNames = keep.flatMap((x) => (x.kind === "town" ? [x.value.name] : []));
  // Bara orten kvar: bara namnet ("Kivik"), annars "äta i Kivik"
  const towns = townNames.join(` ${conj} `);
  if (townNames.length > 0) out.push(out.length > 0 ? i18n.t("search.words.inTown", { town: towns }) : towns);
  return out.join(" ");
}

// ── Öppettider (tolkningen i lib/openingHours) ──────────────────────────────

export interface OpenInfo { open: boolean; label: string }

const hoursOf = (place: Place) => place.opening_hours as Hours;

/** "Öppet till 17", "Öppnar 10", "Stängt", "Stängt i dag" — null om dagens öppettider inte är kända */
/**
 * Samma få texter ("Öppet till 17", "Öppnar 10") byggs för hundratals platser varje gång Sök räknar
 * sina rutor: varje text översätts en gång per språk och klockslag och återanvänds sen.
 */
const hoursLabels = new Map<string, string>();
function hoursLabel(key: "hours.allDay" | "hours.openUntil" | "hours.opensAt" | "hours.closedToday" | "hours.closed", time?: string): string {
  const cacheKey = `${i18n.language}|${key}|${time ?? ""}`;
  let label = hoursLabels.get(cacheKey);
  if (label === undefined) {
    label = time === undefined ? i18n.t(key) : i18n.t(key, { time });
    hoursLabels.set(cacheKey, label);
  }
  return label;
}

export function openInfo(place: Place, now = new Date()): OpenInfo | null {
  const h = todayHours(hoursOf(place), now);
  if (!h) return null;
  if (h.open) return { open: true, label: h.allDay ? hoursLabel("hours.allDay") : hoursLabel("hours.openUntil", String(clock(h.closes!))) };
  if (h.opens != null) return { open: false, label: hoursLabel("hours.opensAt", String(clock(h.opens))) };
  const closedAllDay = parseDay(hoursOf(place)?.[DAY_NAMES[now.getDay()]]) === "closed";
  return { open: false, label: hoursLabel(closedAllDay ? "hours.closedToday" : "hours.closed") };
}

/** Har öppet efter 21 den dagen (i dag om inget annat sägs) */
export function openLate(place: Place, now = new Date()): boolean {
  const today = parseDay(hoursOf(place)?.[DAY_NAMES[now.getDay()]]);
  return Array.isArray(today) && today.some((r) => r.to >= 21 * 60);
}

// ── Platser ──────────────────────────────────────────────────────────────────

export interface PlaceHit {
  place: Place;
  score: number;
  km: number | null;
  open: OpenInfo | null;
  /** Det man bad om som platsen inte angett, men som dess beskrivning tyder på (sorteras först) */
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


interface PlaceResult {
  hits: PlaceHit[];
  /** Det som släpptes för att det inte gav några träffar (uppgifter platserna inte angett än) */
  relaxed: Intent[];
  /** Ord som ingen av platserna hade, och därför inte räknades med (som de skrevs) */
  ignored: string[];
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
  // Flera orter: en plats i någon av dem räcker ("Simrishamn eller Kivik")
  const townIntents = parsed.intents.flatMap((x) => (x.kind === "town" ? [x] : []));
  const strict = parsed.intents.filter((x) => x.kind === "practical" || x.kind === "taste" || x.kind === "open" || x.kind === "late" || x.kind === "at");
  const atIntent = parsed.intents.find((x) => x.kind === "at");
  const target = atIntent?.kind === "at" ? atDate(atIntent, now) : null;
  /** Det platsen säger om tiden man frågar efter (nu, eller dagen och tiden i frågan) */
  const statusAt = (place: Place): OpenInfo | null => {
    if (!target || !atIntent || atIntent.kind !== "at") return openInfo(place, now);
    if (atIntent.minutes !== null) {
      // Dagen står med, så det inte går att missa vilken dag svaret gäller ("Öppet till 21 på måndag")
      const info = openInfo(place, target);
      const day = atIntent.weekday !== null ? i18n.t("search.at.onDay", { day: weekdayName(atIntent.weekday) })
        : atIntent.rel === 1 ? i18n.t("search.at.tomorrow") : "";
      if (!info || info.open) return info && day ? { ...info, label: `${info.label} ${day}` } : info;
      // Stängt just då, men kanske öppet andra tider samma dag: säg tiden ("Stängt på måndag 22:00")
      const wholeDay = parseDay(hoursOf(place)?.[DAY_NAMES[target.getDay()]]) === "closed";
      const time = wholeDay ? "" : day ? hhmm(atIntent.minutes) : i18n.t("search.at.atTime", { time: hhmm(atIntent.minutes) });
      const when = [day, time].filter(Boolean).join(" ") || i18n.t("search.at.today");
      return { open: false, label: i18n.t("search.closedWhen", { when }) };
    }
    // Bara en dag: dagens öppettider ("Måndag 11–22")
    const day = parseDay(hoursOf(place)?.[DAY_NAMES[target.getDay()]]);
    if (day === "closed") return { open: false, label: i18n.t("search.closedWhen", { when: weekdayName(target.getDay()) }) };
    if (!Array.isArray(day)) return null;
    return { open: true, label: `${cap(weekdayName(target.getDay()))} ${day.map((r) => `${clock(r.from)}–${clock(r.to)}`).join(", ")}` };
  };

  // Orden bakom kategorin och orten: en plats som HETER så räknas också (sök "örum" hittar
  // Örums Nygård även om Örum också är en ort, "fika" hittar ett ställe som heter Fika …)
  const nameHas = (p: IndexedPlace, tokens: number[]) =>
    tokens.length > 0 && tokens.every((i) => p.nameWords.some((w) => w.startsWith(parsed.tokens[i])));
  const catTokens = parsed.intents.flatMap((x) => (x.kind === "category" ? x.tokens : []));

  const understood = parsed.intents.some((x) => x.kind !== "events" && x.kind !== "when");
  let ignored: string[] = [];

  const run = (rules: Intent[], soft: PracticalKey[] = []): PlaceHit[] => {
    const candidates: { p: IndexedPlace; bonus: number }[] = [];
    for (const p of index) {
      let bonus = 0;
      if (cats.length > 0 && !cats.some((c) => p.cats.has(c))) {
        if (!nameHas(p, catTokens)) continue;
      }
      if (townIntents.length > 0) {
        if (townIntents.some((t) => p.town === t.value.key)) bonus += 30;
        else if (townIntents.some((t) => nameHas(p, t.tokens))) bonus += 60;
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
          if (!openLate(p.place, target ?? now)) { ok = false; break; }
        } else if (r.kind === "at") {
          if (!statusAt(p.place)?.open) { ok = false; break; }
        } else if (r.kind === "taste") {
          // Har företaget själv valt smaken räknas det som en säker träff
          const n = p.tastes.has(r.value) ? 3 : tasteMatches(p.allWords, p.allWordList, r.value);
          if (n === 0) { ok = false; break; }
          bonus += n * 10;
        }
      }
      if (!ok) continue;
      candidates.push({ p, bonus });
    }
    const active = understood
      ? parsed.text.filter((t) => candidates.some(({ p }) => tokenScore(p, t) > 0))
      : parsed.text;
    ignored = parsed.textOriginal.filter((_, i) => !active.includes(parsed.text[i]));
    const out: PlaceHit[] = [];
    for (const { p, bonus } of candidates) {
      let score = 0;
      for (const t of active) {
        const s = tokenScore(p, t);
        if (s === 0) { score = -1; break; }
        score += s;
      }
      if (score < 0) continue;
      const phrase = active.join(" ");
      if (phrase && p.name.startsWith(phrase)) score += p.name === phrase ? 80 : 40;
      score += bonus;
      const km = loc && p.place.lat != null && p.place.lng != null
        ? distanceMeters(loc.lat, loc.lng, p.place.lat, p.place.lng) / 1000
        : null;
      // Släppta egenskaper: platser vars beskrivning nämner dem kommer först (och märks)
      const mentions = soft.filter((k) => MENTION_WORDS[k].some((w) => p.text.includes(w) || p.catText.includes(w)));
      out.push({ place: p.place, score, km, open: statusAt(p.place), mentions });
    }
    const byText = active.length > 0;
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
    const practical = strict.filter((x) => x.kind === "practical" || x.kind === "taste");
    const rest = strict.filter((x) => x.kind !== "practical" && x.kind !== "taste");
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
  return { hits, relaxed, ignored };
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
  const at = parsed.intents.find((x) => x.kind === "at");
  const atDay = at?.kind === "at" && (at.weekday !== null || at.rel !== null) ? format(atDate(at, now), "yyyy-MM-dd") : null;
  const wants = parsed.intents.some((x) => x.kind === "events" || x.kind === "when") || atDay !== null;
  if (parsed.text.length === 0 && !wants) return [];
  const today = format(startOfDay(now), "yyyy-MM-dd");
  const when = parsed.intents.find((x) => x.kind === "when");
  const [from, to] = atDay ? [atDay, atDay] : when?.kind === "when" ? dayWindow(when.value, now) : [today, "9999-12-31"];
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

/** Orter vars namn matchar det man skrivit (inte de orter som redan förståtts) */
export function searchTowns(towns: Town[], parsed: Parsed): Town[] {
  if (parsed.text.length === 0) return [];
  const chosen = new Set(parsed.intents.flatMap((x) => (x.kind === "town" ? [x.value.key] : [])));
  return towns.filter((tw) =>
    !chosen.has(tw.key)
    && parsed.text.every((t) => tw.key.startsWith(t) || tw.key.includes(` ${t}`)));
}

/**
 * Inga träffar alls: närmaste stavning bland platsnamn och orter ("Menade du Kivik?"). Bara de
 * felstavade orden byts — resten av det man skrivit står kvar ("fika i kivkk" → "fika i Kivik").
 */
export function didYouMean(
  index: IndexedPlace[],
  towns: Town[],
  parsed: Parsed,
  original: string,
): { query: string; words: string[] } | null {
  if (parsed.text.length === 0) return null;
  // Orden som de är skrivna ("Nygård"), nycklade på sin sökform ("nygard")
  const vocabulary = new Map<string, string>();
  index.forEach((p) => (p.place.name ?? "").split(/[^\p{L}\p{N}]+/u).forEach((w) => {
    if (w.length >= 3) vocabulary.set(norm(w), w);
  }));
  towns.forEach((tw) => vocabulary.set(tw.key, tw.name));
  const fixes = new Map<string, string>();
  parsed.text.forEach((t) => {
    if (vocabulary.has(t)) return;
    let best: string | null = null;
    let bestD = 3;
    for (const [w, shown] of vocabulary) {
      const d = editDistance(t, w, 2);
      if (d > 0 && d < bestD) { best = shown; bestD = d; }
    }
    if (best) fixes.set(t, best);
  });
  if (fixes.size === 0) return null;
  // Byt orden där de står i det man skrev, så meningen (och stora/små bokstäver) blir kvar
  const words: string[] = [];
  const query = original.replace(/[\p{L}\p{N}]+/gu, (word) => {
    const fix = fixes.get(norm(word));
    if (!fix) return word;
    words.push(fix);
    return fix;
  });
  return words.length > 0 ? { query, words } : null;
}
