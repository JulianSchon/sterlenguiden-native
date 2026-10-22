/**
 * Företagsportalen: det som delas mellan sidorna — typerna från databasen, anropen, felen i klartext,
 * bilduppladdningen, länkarnas form och de svenska helgdagarna.
 *
 * Allt ett företag ändrar går genom databasens egna funktioner (migration 046). De kollar att man
 * sköter platsen och att värdena är rimliga, så det här är bara appens sida av det.
 */
import { supabase } from "@/integrations/supabase/client";
import { preparePhoto } from "@/lib/photos";
import type { HoursException } from "@/lib/openingHours";
import type { Offer } from "@/lib/offers";
import { findCategory, type CategoryId } from "@/theme/categories";

// ── Typerna ─────────────────────────────────────────────────────────────────

export type MemberRole = "owner" | "staff";

/** Vad någon i personalen får göra (migration 050). Ägare får alltid allt. */
export type Permission = "stories" | "events" | "offers" | "info";

export const PERMISSIONS: { id: Permission; label: string; help: string }[] = [
  { id: "stories", label: "Lägga upp stories", help: "Visa hur det ser ut hos er just nu" },
  { id: "events", label: "Skapa evenemang", help: "Lägga in, ändra och ta bort evenemang" },
  { id: "offers", label: "Skapa erbjudanden", help: "Påverkar kassan – ge bara till den du litar på" },
  { id: "info", label: "Ändra er sida", help: "Öppettider, Stängt i dag, texter, bilder och kontakt" },
];

/** Ny personal får allt utom erbjudanden (samma som databasen) */
export const DEFAULT_PERMISSIONS: Permission[] = ["stories", "events", "info"];

/** Får jag göra det här på platsen? (null = allt, som för ägare och personal från förr) */
export function canDo(place: { role: MemberRole; permissions?: string[] | null } | null | undefined, perm: Permission): boolean {
  if (!place) return false;
  return place.role === "owner" || !place.permissions || place.permissions.includes(perm);
}

export interface MyPlace {
  id: number;
  name: string;
  town: string | null;
  image_url: string | null;
  logo_url: string | null;
  categories: string | null;
  role: MemberRole;
  terms_accepted_at: string | null;
  joined_at: string;
  /** Väntande förfrågningar om att gå med */
  requests: number;
  /** Vad jag får göra (null = allt) */
  permissions?: Permission[] | null;
}

export interface MyInvite {
  id: string;
  place_id: number;
  place_name: string;
  image_url: string | null;
  logo_url: string | null;
  role: MemberRole;
  invited_by: string | null;
  created_at: string;
}

export interface MyRequest {
  id: string;
  kind: "claim" | "join" | "new_place";
  status: "pending" | "approved" | "rejected" | "cancelled";
  place_id: number | null;
  place_name: string | null;
  created_at: string;
}

export interface BusinessOverview {
  places: MyPlace[];
  invites: MyInvite[];
  requests: MyRequest[];
  /** Väntande förfrågningar till admin (null om man inte är admin) */
  admin: number | null;
}

export const EMPTY_OVERVIEW: BusinessOverview = { places: [], invites: [], requests: [], admin: null };

/** Platsen som den ligger i databasen, utan appens omräkningar (portalen ändrar ju just det) */
export interface BusinessPlace {
  id: number;
  name: string;
  categories: string | null;
  sub_category: string | null;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  logo_url: string | null;
  opening_hours: Record<string, string> | null;
  hours_exceptions: HoursException[] | null;
  nearest_town: string | null;
  short_description: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  book_url: string | null;
  transit_stop_name: string | null;
  price_level: number | null;
  amenities: Record<string, boolean> | null;
  tastes: string[] | null;
  claim_link_hidden: boolean | null;
  info_updated_at: string | null;
}

export type PlacePatch = Partial<Omit<BusinessPlace, "id" | "image_url" | "lat" | "lng" | "nearest_town" | "info_updated_at">> & {
  /** Bilderna i ordning (sparas som image_url) */
  image_url?: string[];
};

export interface TeamMember {
  user_id: string;
  name: string | null;
  username: string | null;
  color: string | null;
  role: MemberRole;
  since: string;
  me: boolean;
  /** Vad personen får göra (null = allt) */
  permissions?: Permission[] | null;
}

export interface Team {
  members: TeamMember[];
  invites: { id: string; email: string; role: MemberRole; created_at: string }[];
  requests: { id: string; user_id: string; name: string | null; username: string | null; role_title: string | null; message: string | null; created_at: string }[];
  changes: { what: string; at: string; name: string | null }[];
}

export interface BusinessOffer {
  offer: Offer & { updated_at?: string };
  redemptions: number;
  people: number;
  recent: number;
}

export interface StoryLink {
  kind: "offer" | "event";
  id: string;
  /** Klistermärkets ruta som andelar av bilden (0–1) */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BusinessStory {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  expires_at: string | null;
  link: StoryLink | null;
  views: number;
}

export interface BusinessStats {
  days: number;
  views: number;
  views_prev: number;
  visitors: number;
  visitors_prev: number;
  clicks: number;
  clicks_prev: number;
  directions: number;
  directions_prev: number;
  links: Record<string, number>;
  sources: Record<string, number>;
  favorites_total: number;
  favorites_new: number;
  favorites_new_prev: number;
  checkins: number;
  checkins_prev: number;
  redemptions: number;
  redemptions_prev: number;
  story_views: number;
  series: { d: string; views: number; visitors: number }[];
  audience: {
    people: number;
    ages: Record<string, number>;
    towns: { town: string; n: number }[];
    local: number;
    visiting: number;
  } | null;
  audience_people?: number;
}

export interface ClaimInfo {
  place: { id: number; name: string; town: string | null; image_url: string | null; logo_url: string | null };
  role: MemberRole | null;
  has_owner: boolean;
  link_hidden: boolean;
  /** false = en plats (strand, kyrka …), inget företag att ta över (migration 048) */
  is_business?: boolean;
  pending: "claim" | "join" | null;
  /** Platsens e-post om koden kan skickas dit (null = ingen e-post, eller mejlen är inte igång) */
  email: string | null;
  adult: boolean;
  code_active: boolean;
}

export interface AdminRequest {
  id: string;
  kind: "claim" | "new_place";
  status: MyRequest["status"];
  created_at: string;
  decided_at: string | null;
  role_title: string | null;
  phone: string | null;
  message: string | null;
  new_place: { name: string; town: string | null; category: string | null; website: string | null } | null;
  place: { id: number; name: string; town: string | null; email: string | null; phone: string | null; image_url: string | null; logo_url: string | null } | null;
  owners: number;
  user: { id: string; name: string | null; username: string | null; email: string | null; since: string };
}

// ── Anropen ─────────────────────────────────────────────────────────────────

/** Ett fel från databasen, med koden kvar ("invalid:phone", "not_member" …) */
export class BusinessError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** Anropar en av portalens databasfunktioner (de finns inte i de genererade typerna) */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  // bind: utan den tappar rpc sin koppling till klienten ("Cannot read property rest of undefined")
  const call = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: object) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  const { data, error } = await call(fn, args);
  if (error) throw new BusinessError(error.message, error.code);
  return data as T;
}

const FIELD_NAMES: Record<string, string> = {
  phone: "Telefonnumret", email: "E-postadressen", website_url: "Hemsidan", book_url: "Bokningslänken",
  facebook_url: "Facebook-länken", instagram_url: "Instagram-länken", ticket_url: "Biljettlänken", name: "Namnet",
  title: "Rubriken", date: "Datumet", end_date: "Slutdatumet", image_url: "Bilden", logo_url: "Loggan",
};

/** Felet i klartext, att visa för företaget */
export function businessError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e ?? "");
  const code = e instanceof BusinessError ? e.code : undefined;
  if (code === "PGRST202" || /could not find the function/i.test(message)) return "Den här delen är inte igång än. Försök igen lite senare.";
  if (/network|fetch|timeout/i.test(message)) return "Vi får ingen kontakt just nu. Kolla nätet och försök igen.";
  if (message.includes("not_member")) return "Du sköter inte den här platsen längre.";
  if (message.includes("not_owner")) return "Det här kan bara en ägare göra.";
  if (message.includes("no_permission")) return "Det här har du inte tillgång till. Fråga en ägare för företaget.";
  if (message.includes("not_signed_in")) return "Du behöver vara inloggad.";
  if (message.includes("locked")) return "Någon har redan använt erbjudandet, så det kan inte skrivas om. Avsluta det och skapa ett nytt i stället.";
  if (message.includes("too_many:offers")) return "Ni kan ha högst 10 erbjudanden igång samtidigt.";
  if (message.includes("too_many:stories")) return "Ni har lagt upp många stories i dag. Vänta till i morgon.";
  if (message.includes("too_many:events")) return "Ni har väldigt många kommande evenemang. Ta bort några gamla först.";
  if (message.includes("too_many:dates")) return "Högst 52 tillfällen åt gången.";
  if (message.includes("too_many:image_url")) return "Högst 10 bilder.";
  if (message.includes("invalid:savings_value")) return "Värdet kan vara högst 5 000 kr.";
  if (message.includes("invalid:expires_at")) return "Slutdatumet behöver vara inom två år.";
  if (message.includes("invalid:hours_exceptions") || message.includes("too_many:hours_exceptions")) return "Datumen ser inte rätt ut. Kolla att slutet kommer efter början.";
  const field = message.match(/(?:invalid|too_long):([a-z_]+)/)?.[1];
  if (field && message.includes("too_long")) return `${FIELD_NAMES[field] ?? "Texten"} är för lång.`;
  if (field) return `${FIELD_NAMES[field] ?? "Något"} ser inte rätt ut.`;
  return "Något gick fel. Försök igen.";
}

// ── Bilderna ────────────────────────────────────────────────────────────────

const MEDIA_BUCKET = "place-media";

/** Krymper bilden och lägger den i platsens egen mapp. Returnerar den publika adressen. */
export async function uploadPlaceImage(
  placeId: number,
  photo: { uri: string; width: number; height: number },
  maxEdge = 2000,
): Promise<string> {
  const uri = await preparePhoto(photo, maxEdge);
  const bytes = await (await fetch(uri)).arrayBuffer();
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const path = `${placeId}/${name}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Laddar upp färdiga bytes (berättelsens bild, som redan är rätt storlek) */
export async function uploadPlaceBytes(placeId: number, bytes: Uint8Array): Promise<string> {
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const path = `${placeId}/${name}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Tar bort bilder som inte används längre — bara de som ligger i portalens egen bucket */
export async function removePlaceImages(urls: (string | null | undefined)[]): Promise<void> {
  const marker = `/${MEDIA_BUCKET}/`;
  const paths = urls.filter((u): u is string => !!u && u.includes(marker)).map((u) => u.split(marker)[1]);
  if (paths.length > 0) await supabase.storage.from(MEDIA_BUCKET).remove(paths).catch(() => {});
}

// ── Länkar och kontakt ──────────────────────────────────────────────────────

const DOMAIN = /^(https?:\/\/)?([a-z0-9åäöæøü-]+\.)+[a-z]{2,}(:[0-9]{2,5})?([/?#]\S*)?$/i;

/** En webbadress som databasen godtar, med https:// först. null om tom, false om den inte ser rätt ut. */
export function cleanUrl(input: string): string | null | false {
  const v = input.trim();
  if (!v) return null;
  if (/\s/.test(v) || !DOMAIN.test(v)) return false;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** "@orumsnygard", "orumsnygard" eller en hel länk → en Instagram-länk */
export function cleanInstagram(input: string): string | null | false {
  const v = input.trim();
  if (!v) return null;
  const handle = v.replace(/^@/, "");
  if (/^[a-z0-9._]{1,30}$/i.test(handle)) return `https://instagram.com/${handle}`;
  return cleanUrl(v);
}

/** Facebook-sidans namn eller hela länken → en Facebook-länk */
export function cleanFacebook(input: string): string | null | false {
  const v = input.trim();
  if (!v) return null;
  const handle = v.replace(/^@/, "");
  if (/^[a-z0-9-]{2,60}$/i.test(handle)) return `https://facebook.com/${handle}`;
  return cleanUrl(v);
}

/** Visar en sparad Instagram-/Facebook-länk som det man skrev ("@orumsnygard") */
export function socialHandle(url: string | null | undefined, site: "instagram" | "facebook"): string {
  if (!url) return "";
  const m = url.match(new RegExp(`${site}\\.com/([^/?#]+)`, "i"));
  return m ? (site === "instagram" ? `@${m[1]}` : m[1]) : url;
}

export const isPhone = (v: string) => /^\+?[0-9][0-9 ()-]{4,28}$/.test(v.trim());
export const isEmail = (v: string) => v.trim().length <= 200 && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim());

// ── Underkategorierna i klartext ────────────────────────────────────────────

/** Det företaget ser på knappen (databasens nyckel står kvar om den inte finns här) */
export const SUB_LABELS: Record<string, string> = {
  "Fine Dining": "Fine dining",
  "Casual": "Avslappnat",
  "Pub & Bar": "Pub & bar",
  "Trädgård": "Trädgårdscafé",
  "Snabbt": "Fika att ta med",
  "Livsmedel & Dagligvaror": "Livsmedel",
  "Barn": "Barnvänligt",
  "Sport": "Sport & rörelse",
  "Hälsa": "Hälsa & välmående",
  "Djur": "Djurupplevelser",
  "Stränder": "Strand",
  "Utsikt": "Utsikt",
  "Kyrkor": "Kyrka",
};

// ── Erbjudandets kategori ───────────────────────────────────────────────────

/** Erbjudandena har fyra kategorier (som Förmåner filtrerar på) — vilken platsen hör till */
export function offerCategoryFor(categories: string | null): string {
  const id: CategoryId | undefined = findCategory(categories)?.id;
  if (id === "hotell-bb") return "Hotell & B&B";
  if (id === "butiker" || id === "hantverk-service") return "Butiker";
  if (id === "natur-upplevelser" || id === "aktiviteter" || id === "sevardheter") return "Natur & Upplevelser";
  return "Mat & Dryck";
}

// ── Svenska helgdagar (för "Stängt på midsommarafton?") ─────────────────────

interface Holiday { date: string; name: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Påskdagen (gregoriansk, Meeus/Jones/Butcher) */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Första veckodagen `weekday` (0 = sön) från och med datumet */
function firstWeekday(year: number, month: number, day: number, weekday: number): Date {
  const d = new Date(year, month, day);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return d;
}

function swedishHolidays(year: number): Holiday[] {
  const e = easter(year);
  const plus = (n: number) => new Date(e.getFullYear(), e.getMonth(), e.getDate() + n);
  const list: [Date, string][] = [
    [new Date(year, 0, 1), "Nyårsdagen"],
    [new Date(year, 0, 6), "Trettondedag jul"],
    [plus(-2), "Långfredagen"],
    [plus(-1), "Påskafton"],
    [e, "Påskdagen"],
    [plus(1), "Annandag påsk"],
    [new Date(year, 4, 1), "Första maj"],
    [plus(39), "Kristi himmelsfärd"],
    [plus(49), "Pingstdagen"],
    [new Date(year, 5, 6), "Nationaldagen"],
    [firstWeekday(year, 5, 19, 5), "Midsommarafton"],
    [firstWeekday(year, 5, 20, 6), "Midsommardagen"],
    [firstWeekday(year, 9, 31, 6), "Alla helgons dag"],
    [new Date(year, 11, 24), "Julafton"],
    [new Date(year, 11, 25), "Juldagen"],
    [new Date(year, 11, 26), "Annandag jul"],
    [new Date(year, 11, 31), "Nyårsafton"],
  ];
  return list.map(([d, name]) => ({ date: iso(d), name })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Helgdagarna de närmaste `days` dagarna */
export function upcomingHolidays(days = 120, now = new Date()): Holiday[] {
  const today = iso(now);
  const until = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  return [...swedishHolidays(now.getFullYear()), ...swedishHolidays(now.getFullYear() + 1)]
    .filter((h) => h.date >= today && h.date <= until);
}
