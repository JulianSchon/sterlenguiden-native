/**
 * Utmaningar — 7 grupper × brons/silver/guld = 21 troféer. Nollställd
 * 2026-09-16 (tredje omtaget): det gamla systemet krävde besök av en
 * PROCENTANDEL av alla platser i en kategori, vilket blir orimligt när fler
 * platser läggs till i databasen (målet växer av sig självt). Nu är alla
 * mål FASTA tal, och grupperna är inte längre bundna till platskategorierna
 * i appen (Mat & Dryck osv) — de speglar istället olika SAKER MAN GÖR i
 * appen (besöka, favoritmarkera, lösa in förmåner, svepa i Upptäck), samma
 * mönster som andra appars utmärkelsesystem (volym/bredd/återkommande),
 * inte bara "besök X av kategori Y".
 *
 * Matchar de riktiga kolumnerna i achievements-tabellen
 * (achievement_type/category/level/unlocked_at) — achievement_type är nu
 * gruppens id (t.ex. "utforskaren"), category är alltid null (fanns bara
 * för det gamla kategori-baserade systemet).
 *
 * Delad mellan app/challenges.tsx (rastret) och app/stats.tsx
 * ("Utmaningar"-KPI:n), så de aldrig kan räkna olika.
 */
import {
  Footprints, Compass, Heart, Tag, Shuffle, Layers, Trophy as TrophyIcon,
} from "lucide-react-native";
import type { Place } from "@/hooks/usePlaces";
import type { Achievement } from "@/hooks/useAchievements";
import type { Visit } from "@/hooks/useVisits";
import type { RedemptionRow } from "@/lib/offers";

export type Tier = "bronze" | "silver" | "gold";

export const TIER_LABEL: Record<Tier, string> = { bronze: "Brons", silver: "Silver", gold: "Guld" };
const TIER_ORDER: Tier[] = ["bronze", "silver", "gold"];

export const TIER_PALETTE: Record<Tier, { rim: string; field: [string, string, string]; ink: string; glow: string }> = {
  bronze: { rim: "#6b3a18", field: ["#d49262", "#a96334", "#6b3a18"], ink: "#3a1d08", glow: "rgba(196,120,60,0.28)" },
  silver: { rim: "#5a5a5a", field: ["#f4f4f4", "#b8b8b8", "#6e6e6e"], ink: "#2d2d2d", glow: "rgba(220,220,220,0.30)" },
  gold:   { rim: "#7a5418", field: ["#fbe49b", "#d4a740", "#7a5418"], ink: "#3a2708", glow: "rgba(212,167,64,0.45)" },
};

// ─── 8 platskategorier — bara använt för "Mångsidig"s breddmått (hur många
// OLIKA kategorier du besökt i, inte hur mycket av en specifik). Samma
// dbValues som appens övriga kategori-matchning (category/[categoryId].tsx,
// stats.tsx m.fl.) ──────────────────────────────────────────────────────
const CATEGORY_DB_VALUES: string[][] = [
  ["Mat", "Mat & Dryck"],
  ["Café & Bageri", "Cafe & Bageri"],
  ["Hotell & B&B", "Boende"],
  ["Butiker", "Gårdsbutik"],
  ["Natur", "Natur & Upplevelser"],
  ["Aktiviteter"],
  ["Sevärdheter", "Konst"],
  ["Hantverk & Service", "Hantverk"],
];
const TOTAL_CATEGORY_COUNT = CATEGORY_DB_VALUES.length; // 8

function placeMatchesCategory(place: Place, dbValues: string[]): boolean {
  if (!place.categories) return false;
  const parts = place.categories.split(",").map((s) => s.trim().toLowerCase());
  return dbValues.some((v) => {
    const t = v.toLowerCase();
    return parts.some((p) => p === t || p.includes(t) || t.includes(p));
  });
}

// ─── Användarens råsiffror — allt en trofés framsteg räknas mot ────────────────
export interface UserStats {
  uniqueVisits: number;
  favoritesCount: number;
  redemptionsDistinct: number;
  /** Platser svepta åt något håll i Upptäck (vänster eller höger) */
  swipedCount: number;
  categoriesVisited: number; // 0–8
  /** Listor användaren själv skapat (inte de hen bara gått med i) */
  listsCreated: number;
  memoriesCount: number;
}

export function computeUserStats(
  visits: Visit[],
  places: Place[],
  favoritesCount: number,
  redemptions: RedemptionRow[],
  swipedPlaceIds: number[],
  listsCreated: number,
  memoriesCount: number,
): UserStats {
  const placesById = new Map(places.map((p) => [p.id, p]));
  const uniqueVisitedIds = [...new Set(visits.map((v) => v.place_id))];

  const categoriesVisited = CATEGORY_DB_VALUES.filter((dbValues) =>
    uniqueVisitedIds.some((pid) => {
      const p = placesById.get(pid);
      return !!p && placeMatchesCategory(p, dbValues);
    })
  ).length;

  return {
    uniqueVisits: uniqueVisitedIds.length,
    favoritesCount,
    redemptionsDistinct: new Set(redemptions.map((r) => r.offer_id)).size,
    swipedCount: swipedPlaceIds.length,
    categoriesVisited,
    listsCreated,
    memoriesCount,
  };
}

// ─── De 7 grupperna ─────────────────────────────────────────────────────────────
interface TierSpec {
  target: number;
  progress: (s: UserStats) => number;
  requirementText: string;
  levelName: string;
  /** Vad som räknas, för framsteget "17 av 30 favoriter sparade": [ental, flertal] */
  unit: [string, string];
  /** Österlenlegend: delmålen var för sig (visas med bock i stället för "x av 3") */
  parts?: (s: UserStats) => { label: string; done: boolean }[];
}

interface GroupDef {
  id: string;
  theme: string;
  tagline: string;
  Icon: React.ComponentType<any>;
  tiers: [TierSpec, TierSpec, TierSpec];
}

const GROUPS: GroupDef[] = [
  {
    id: "kom-igang",
    theme: "Kom igång",
    tagline: "De första stegen på Österlen",
    Icon: Footprints,
    tiers: [
      { target: 1, progress: (s) => Math.min(s.uniqueVisits, 1), requirementText: "Besök en plats", levelName: "Första besöket", unit: ["plats besökt", "platser besökta"] },
      { target: 1, progress: (s) => Math.min(s.listsCreated, 1), requirementText: "Skapa en lista", levelName: "Första listan", unit: ["lista skapad", "listor skapade"] },
      { target: 1, progress: (s) => Math.min(s.memoriesCount, 1), requirementText: "Spara ett minne", levelName: "Första minnet", unit: ["minne sparat", "minnen sparade"] },
    ],
  },
  {
    id: "utforskaren",
    theme: "Utforskaren",
    tagline: "Ju fler platser, desto bättre",
    Icon: Compass,
    tiers: [
      { target: 5,  progress: (s) => s.uniqueVisits, requirementText: "Besök 5 platser",  levelName: "Nykomling", unit: ["plats besökt", "platser besökta"] },
      { target: 20, progress: (s) => s.uniqueVisits, requirementText: "Besök 20 platser", levelName: "Reserutinerad", unit: ["plats besökt", "platser besökta"] },
      { target: 50, progress: (s) => s.uniqueVisits, requirementText: "Besök 50 platser", levelName: "Österlenkännare", unit: ["plats besökt", "platser besökta"] },
    ],
  },
  {
    id: "samlaren",
    theme: "Samlaren",
    tagline: "Bygg din egen guldgruva",
    Icon: Heart,
    tiers: [
      { target: 5,  progress: (s) => s.favoritesCount, requirementText: "Spara 5 favoriter",  levelName: "Samlarsugen", unit: ["favorit sparad", "favoriter sparade"] },
      { target: 15, progress: (s) => s.favoritesCount, requirementText: "Spara 15 favoriter", levelName: "Listbyggare", unit: ["favorit sparad", "favoriter sparade"] },
      { target: 30, progress: (s) => s.favoritesCount, requirementText: "Spara 30 favoriter", levelName: "Kurator", unit: ["favorit sparad", "favoriter sparade"] },
    ],
  },
  {
    id: "formansjagaren",
    theme: "Förmånsjägaren",
    tagline: "Österlenpasset i praktiken",
    Icon: Tag,
    tiers: [
      { target: 1, progress: (s) => s.redemptionsDistinct, requirementText: "Lös in 1 erbjudande",  levelName: "Fyndaren", unit: ["erbjudande inlöst", "erbjudanden inlösta"] },
      { target: 3, progress: (s) => s.redemptionsDistinct, requirementText: "Lös in 3 erbjudanden", levelName: "Förmånsjägare", unit: ["erbjudande inlöst", "erbjudanden inlösta"] },
      { target: 6, progress: (s) => s.redemptionsDistinct, requirementText: "Lös in 6 erbjudanden", levelName: "Rabattkung", unit: ["erbjudande inlöst", "erbjudanden inlösta"] },
    ],
  },
  {
    id: "mangsidig",
    theme: "Mångsidig",
    tagline: "Bredd, inte bara djup",
    Icon: Shuffle,
    tiers: [
      { target: 3, progress: (s) => s.categoriesVisited, requirementText: "Besök platser i 3 olika kategorier",     levelName: "Nyfiken", unit: ["kategori besökt", "kategorier besökta"] },
      { target: 5, progress: (s) => s.categoriesVisited, requirementText: "Besök platser i 5 olika kategorier",     levelName: "Allätare", unit: ["kategori besökt", "kategorier besökta"] },
      { target: TOTAL_CATEGORY_COUNT, progress: (s) => s.categoriesVisited, requirementText: `Besök platser i alla ${TOTAL_CATEGORY_COUNT} kategorier`, levelName: "Mångsidig mästare", unit: ["kategori besökt", "kategorier besökta"] },
    ],
  },
  {
    id: "bladdraren",
    theme: "Bläddraren",
    tagline: "Svep dig igenom hela katalogen",
    Icon: Layers,
    tiers: [
      { target: 15,  progress: (s) => s.swipedCount, requirementText: "Svep igenom 15 platser i Upptäck",  levelName: "Bläddrare", unit: ["plats svept", "platser svepta"] },
      { target: 60,  progress: (s) => s.swipedCount, requirementText: "Svep igenom 60 platser i Upptäck",  levelName: "Katalogkännare", unit: ["plats svept", "platser svepta"] },
      { target: 150, progress: (s) => s.swipedCount, requirementText: "Svep igenom 150 platser i Upptäck", levelName: "Hela högen", unit: ["plats svept", "platser svepta"] },
    ],
  },
  {
    id: "osterlenlegend",
    theme: "Österlenlegend",
    tagline: "Lite av allt, inte bara mycket av en sak",
    Icon: TrophyIcon,
    tiers: [
      {
        target: 3,
        progress: (s) => [s.uniqueVisits >= 1, s.favoritesCount >= 1, s.redemptionsDistinct >= 1].filter(Boolean).length,
        requirementText: "1 besök, 1 favorit, 1 inlöst förmån",
        levelName: "Nyfrälst",
        parts: (s) => [
          { label: "1 besök", done: s.uniqueVisits >= 1 },
          { label: "1 favorit", done: s.favoritesCount >= 1 },
          { label: "1 inlöst förmån", done: s.redemptionsDistinct >= 1 },
        ],
        unit: ["delmål klart", "delmål klara"],
      },
      {
        target: 3,
        progress: (s) => [s.uniqueVisits >= 10, s.favoritesCount >= 5, s.redemptionsDistinct >= 2].filter(Boolean).length,
        requirementText: "10 besök, 5 favoriter, 2 inlösta förmåner",
        levelName: "Helhjärtad",
        parts: (s) => [
          { label: "10 besök", done: s.uniqueVisits >= 10 },
          { label: "5 favoriter", done: s.favoritesCount >= 5 },
          { label: "2 inlösta förmåner", done: s.redemptionsDistinct >= 2 },
        ],
        unit: ["delmål klart", "delmål klara"],
      },
      {
        target: 3,
        progress: (s) => [s.uniqueVisits >= 30, s.favoritesCount >= 15, s.redemptionsDistinct >= 5].filter(Boolean).length,
        requirementText: "30 besök, 15 favoriter, 5 inlösta förmåner",
        levelName: "Österlenlegend",
        parts: (s) => [
          { label: "30 besök", done: s.uniqueVisits >= 30 },
          { label: "15 favoriter", done: s.favoritesCount >= 15 },
          { label: "5 inlösta förmåner", done: s.redemptionsDistinct >= 5 },
        ],
        unit: ["delmål klart", "delmål klara"],
      },
    ],
  },
];

export const GROUP_ORDER = GROUPS.map((g) => g.id);

export interface TrophyMeta {
  identity: string;      // gruppens temanamn, t.ex. "Utforskaren"
  levelName: string;     // nivå-specifikt smeknamn
  levelLabel: string;    // "Brons"/"Silver"/"Guld"
  tagline: string;
  requirementText: string;
  Icon: React.ComponentType<any>;
}

/** Statisk info (inget framsteg/mål) för en grupp+nivå — ställen som bara vet VILKA troféer någon
 * redan låst upp (t.ex. vänprofilen, som inte har hela poängmotorn/UserStats för den personen). */
export function getTrophyMeta(groupId: string, tier: Tier): TrophyMeta | null {
  const group = GROUPS.find((g) => g.id === groupId);
  if (!group) return null;
  const spec = group.tiers[TIER_ORDER.indexOf(tier)];
  return {
    identity: group.theme,
    levelName: spec.levelName,
    levelLabel: TIER_LABEL[tier],
    tagline: group.tagline,
    requirementText: spec.requirementText,
    Icon: group.Icon,
  };
}

// ─── Troféer ────────────────────────────────────────────────────────────────────
export interface Trophy {
  key: string;
  groupId: string;
  tier: Tier;
  Icon: React.ComponentType<any>;
  identity: string;      // gruppens temanamn, t.ex. "Utforskaren"
  levelName: string;     // nivå-specifikt smeknamn
  levelLabel: string;    // "Brons"/"Silver"/"Guld"
  tagline: string;
  requirementText: string;
  /** Vad som räknas i framsteget, efter "17 av 30": "favoriter sparade" */
  progressUnit: string;
  /** Bara Österlenlegend: delmålen var för sig */
  parts: { label: string; done: boolean }[] | null;
  done: boolean;
  percent: number;
  progress: number;
  target: number;
  doneAt: string | null;
}

export function buildTrophies(stats: UserStats, achievements: Achievement[]): Trophy[] {
  const items: Trophy[] = [];

  for (const group of GROUPS) {
    group.tiers.forEach((spec, idx) => {
      const tier = TIER_ORDER[idx];
      const rawProgress = spec.progress(stats);
      const progress = Math.min(rawProgress, spec.target);
      const done = rawProgress >= spec.target;
      const percent = spec.target > 0 ? Math.min(100, Math.round((progress / spec.target) * 100)) : 0;
      const achieved = achievements.find((a) => a.achievement_type === group.id && a.level === tier);

      items.push({
        key: `${group.id}-${tier}`,
        groupId: group.id,
        tier,
        Icon: group.Icon,
        identity: group.theme,
        levelName: spec.levelName,
        levelLabel: TIER_LABEL[tier],
        tagline: group.tagline,
        requirementText: spec.requirementText,
        progressUnit: spec.target === 1 ? spec.unit[0] : spec.unit[1],
        parts: spec.parts?.(stats) ?? null,
        done,
        percent,
        progress,
        target: spec.target,
        doneAt: achieved?.unlocked_at ?? null,
      });
    });
  }

  return items;
}
