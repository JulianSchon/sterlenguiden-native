/**
 * Onboardingen: det man fyllt i medan man går igenom stegen, och vägen in i appen efter inloggning.
 *
 * Svaren sparas i telefonen efter varje steg (inte på servern), så inget försvinner om appen stängs
 * mitt i — man fortsätter där man var. Allt skrivs till servern på en gång när man är klar
 * (finishOnboarding). Först då räknas kontot som klart (profiles.onboarded_at, migration 043); är
 * det inte klart skickas man tillbaka till onboardingen vid nästa start, oavsett hur man loggade in.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { currentLanguage } from "@/i18n";
import type { CategoryId } from "@/theme/categories";

export interface OnboardingDraft {
  firstName: string;
  lastName: string;
  username: string;
  /** "ÅÅÅÅ-MM-DD", eller null innan man valt */
  birthDate: string | null;
  /** Bor på Österlen (true), någon annanstans (false), inte valt än (null) */
  livesInOsterlen: boolean | null;
  city: string;
  interests: CategoryId[];
  /** Platser man sparat som favoriter under onboardingen */
  favorites: number[];
  /** Steget man var på */
  step: string | null;
  /** E-postkontot har inget lösenord än (appen stängdes innan man valde ett) */
  needsPassword: boolean;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  firstName: "", lastName: "", username: "", birthDate: null, livesInOsterlen: null, city: "",
  interests: [], favorites: [], step: null, needsPassword: false,
};

const draftKey = (userId: string) => `onboarding-draft:v1:${userId}`;
const doneKey = (userId: string) => `onboarded:v1:${userId}`;

export async function loadDraft(userId: string): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<OnboardingDraft>) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: OnboardingDraft): void {
  AsyncStorage.setItem(draftKey(userId), JSON.stringify(draft)).catch(() => {});
}

/**
 * Har kontot gått igenom onboardingen? Telefonen minns ett ja, så det behövs ingen fråga till servern
 * vid varje start. Går servern inte att nå räknas kontot som klart — hellre in i appen än fast här.
 */
export async function isOnboarded(userId: string): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(doneKey(userId))) return true;
  } catch {
    // Inget minne i telefonen: fråga servern
  }
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) return true;
  // Ingen profilrad = ett helt nytt konto. Saknas kolumnen (migration 043 inte körd) räknas den som
  // klar som har ett namn — det får man först i onboardingen
  const row = data as { onboarded_at?: string | null; display_name?: string | null } | null;
  const done = !!row && (row.onboarded_at !== undefined ? row.onboarded_at !== null : !!row.display_name?.trim());
  if (done) AsyncStorage.setItem(doneKey(userId), "1").catch(() => {});
  return done;
}

/**
 * Efter inloggning: in i appen, eller vidare i onboardingen om kontot inte är klart än. Namnet
 * (från Apple eller Google) fylls i där, så man slipper skriva det.
 */
export async function enterApp(name?: { first: string; last: string }): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) {
    router.replace("/(auth)/welcome");
    return;
  }
  if (await isOnboarded(userId)) router.replace("/(tabs)");
  else router.replace({ pathname: "/(auth)/signup", params: { mode: "resume", first: name?.first ?? "", last: name?.last ?? "" } });
}

// ── Användarnamn ─────────────────────────────────────────────────────────────

export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]{3,20}$/;

/** "Åsa Öhrn-Lind" → "asa.ohrnlind" (bara tecken som användarnamn får ha) */
export function usernameBase(first: string, last: string): string {
  const clean = (s: string) => s
    .toLowerCase()
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return [clean(first), clean(last)].filter(Boolean).join(".").slice(0, 20).replace(/\.+$/, "");
}

/** Användarnamn som redan är tagna och börjar som `prefix` (null om det inte gick att fråga) */
async function takenStartingWith(prefix: string): Promise<Set<string> | null> {
  const { data, error } = await supabase.rpc("rpc_search_users", { q: prefix });
  if (error) return null;
  return new Set((data ?? []).map((r) => (r.username ?? "").toLowerCase()));
}

/** Är namnet upptaget av någon annan? null = gick inte att kontrollera just nu */
export async function usernameTaken(username: string): Promise<boolean | null> {
  const taken = await takenStartingWith(username);
  return taken ? taken.has(username.toLowerCase()) : null;
}

/** Ett ledigt förslag utifrån namnet: viktor.halling, annars viktor.halling2, 3 … */
export async function suggestUsername(first: string, last: string): Promise<string> {
  const base = usernameBase(first, last);
  if (base.length < 3) return "";
  const taken = await takenStartingWith(base);
  if (!taken || !taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, 20 - String(n).length)}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}

// ── Klart ────────────────────────────────────────────────────────────────────

type FinishError = "username_taken" | "failed";

/** Fält som kom med migration 043 — utan den sparas resten ändå */
const NEW_COLUMNS = ["interests", "onboarded_at"] as const;

/**
 * Sparar allt på en gång: profilen (namn, användarnamn, födelsedag, ort, intressen, språk och att
 * kontot är klart) och favoriterna. Favoriterna är inte avgörande — går de inte att spara blir
 * kontot klart ändå.
 */
export async function finishOnboarding(userId: string, draft: OnboardingDraft): Promise<FinishError | null> {
  const row: Record<string, unknown> = {
    display_name: `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim(),
    username: draft.username.trim() || null,
    birth_date: draft.birthDate,
    birth_year: draft.birthDate ? Number(draft.birthDate.slice(0, 4)) : null,
    city: draft.city.trim() || null,
    lives_in_osterlen: draft.livesInOsterlen,
    interests: draft.interests,
    preferred_language: currentLanguage(),
    onboarded_at: new Date().toISOString(),
  };

  const write = async (values: Record<string, unknown>) => {
    const updated = await supabase.from("profiles").update(values as never).eq("user_id", userId).select("user_id");
    if (updated.error || (updated.data?.length ?? 0) > 0) return updated.error;
    // Ingen profilrad än: skapa den
    const inserted = await supabase.from("profiles").insert({ ...values, user_id: userId } as never);
    return inserted.error;
  };

  let error = await write(row);
  // Kolumnerna från migration 043 saknas: spara resten
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    const rest = { ...row };
    for (const key of NEW_COLUMNS) delete rest[key];
    error = await write(rest);
  }
  if (error) return error.code === "23505" ? "username_taken" : "failed";

  if (draft.favorites.length > 0) {
    try {
      const { data: existing } = await supabase.from("favorites").select("place_id").eq("user_id", userId).not("place_id", "is", null);
      const have = new Set((existing ?? []).map((f) => f.place_id));
      const add = draft.favorites.filter((id) => !have.has(id));
      if (add.length > 0) {
        await supabase.from("favorites").insert(add.map((place_id) => ({ user_id: userId, place_id, event_id: null, service_point_id: null })));
      }
    } catch {
      // Favoriterna går att spara igen från platserna
    }
  }

  AsyncStorage.setItem(doneKey(userId), "1").catch(() => {});
  AsyncStorage.removeItem(draftKey(userId)).catch(() => {});
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["profile"] }),
    queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  ]);
  return null;
}

// ── Platsfrågan ──────────────────────────────────────────────────────────────

const LOCATION_LATER_KEY = "location-ask:later";

/** "Inte nu" på platssteget: Hem frågar inte själv efteråt (kartan frågar när man öppnar den) */
export function deferLocationAsk(): void {
  AsyncStorage.setItem(LOCATION_LATER_KEY, "1").catch(() => {});
}

export async function locationAskDeferred(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LOCATION_LATER_KEY)) === "1";
  } catch {
    return false;
  }
}
