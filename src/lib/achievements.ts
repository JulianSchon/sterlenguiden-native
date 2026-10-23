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
import i18n from "i18next";

export type Tier = "bronze" | "silver" | "gold";

const TIER_ORDER: Tier[] = ["bronze", "silver", "gold"];

export const TIER_PALETTE: Record<Tier, { rim: string; field: [string, string, string]; ink: string; glow: string }> = {
  bronze: { rim: "#6b3a18", field: ["#d49262", "#a96334", "#6b3a18"], ink: "#3a1d08", glow: "rgba(196,120,60,0.28)" },
  silver: { rim: "#5a5a5a", field: ["#f4f4f4", "#b8b8b8", "#6e6e6e"], ink: "#2d2d2d", glow: "rgba(220,220,220,0.30)" },
  gold:   { rim: "#7a5418", field: ["#fbe49b", "#d4a740", "#7a5418"], ink: "#3a2708", glow: "rgba(212,167,64,0.45)" },
};

// ─── 8 platskategorier — bara använt för "Mångsidig"s breddmått (hur många
// OLIKA kategorier du besökt i, inte hur mycket av en specifik). Samma
// dbValues som appens övriga kategori-matchning (theme/categories.ts,
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
  // Tomma delar (t.ex. efter ett avslutande komma) räknas inte — som i databasen (user_trophy_stats)
  const parts = place.categories.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return dbValues.some((v) => {
    const t = v.toLowerCase();
    return parts.some((p) => p === t || p.includes(t) || t.includes(p));
  });
}

// ─── Användarens råsiffror — allt en trofés framsteg räknas mot ────────────────
interface UserStats {
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
// Namn, krav och enheter finns i språkfilerna (trophies.<grupp>.<nivå>), här bara målen
interface TierSpec {
  target: number;
  progress: (s: UserStats) => number;
  /** Österlenlegend: delmålen var för sig (visas med bock i stället för "x av 3") */
  parts?: (s: UserStats) => [boolean, boolean, boolean];
}

interface GroupDef {
  id: string;
  Icon: React.ComponentType<any>;
  tiers: [TierSpec, TierSpec, TierSpec];
}

const legend = (visits: number, favorites: number, redemptions: number): TierSpec => {
  const parts = (s: UserStats): [boolean, boolean, boolean] =>
    [s.uniqueVisits >= visits, s.favoritesCount >= favorites, s.redemptionsDistinct >= redemptions];
  return { target: 3, progress: (s) => parts(s).filter(Boolean).length, parts };
};

const GROUPS: GroupDef[] = [
  {
    id: "kom-igang",
    Icon: Footprints,
    tiers: [
      { target: 1, progress: (s) => Math.min(s.uniqueVisits, 1) },
      { target: 1, progress: (s) => Math.min(s.listsCreated, 1) },
      { target: 1, progress: (s) => Math.min(s.memoriesCount, 1) },
    ],
  },
  {
    id: "utforskaren",
    Icon: Compass,
    tiers: [
      { target: 5, progress: (s) => s.uniqueVisits },
      { target: 20, progress: (s) => s.uniqueVisits },
      { target: 50, progress: (s) => s.uniqueVisits },
    ],
  },
  {
    id: "samlaren",
    Icon: Heart,
    tiers: [
      { target: 5, progress: (s) => s.favoritesCount },
      { target: 15, progress: (s) => s.favoritesCount },
      { target: 30, progress: (s) => s.favoritesCount },
    ],
  },
  {
    id: "formansjagaren",
    Icon: Tag,
    tiers: [
      { target: 1, progress: (s) => s.redemptionsDistinct },
      { target: 3, progress: (s) => s.redemptionsDistinct },
      { target: 6, progress: (s) => s.redemptionsDistinct },
    ],
  },
  {
    id: "mangsidig",
    Icon: Shuffle,
    tiers: [
      { target: 3, progress: (s) => s.categoriesVisited },
      { target: 5, progress: (s) => s.categoriesVisited },
      { target: TOTAL_CATEGORY_COUNT, progress: (s) => s.categoriesVisited },
    ],
  },
  {
    id: "bladdraren",
    Icon: Layers,
    tiers: [
      { target: 15, progress: (s) => s.swipedCount },
      { target: 60, progress: (s) => s.swipedCount },
      { target: 150, progress: (s) => s.swipedCount },
    ],
  },
  {
    id: "osterlenlegend",
    Icon: TrophyIcon,
    tiers: [legend(1, 1, 1), legend(10, 5, 2), legend(30, 15, 5)],
  },
];

/** En text om gruppen eller nivån, på appens språk */
const groupText = (groupId: string, field: "theme" | "tagline") =>
  i18n.t(`trophies.${groupId}.${field}` as "trophies.kom-igang.theme");
const tierText = (groupId: string, tier: Tier, field: "requirement" | "name" | "unitOne" | "unitOther" | "part1" | "part2" | "part3") =>
  i18n.t(`trophies.${groupId}.${tier}.${field}` as "trophies.kom-igang.bronze.name", { total: TOTAL_CATEGORY_COUNT });
const tierLabel = (tier: Tier) => i18n.t(`trophies.tiers.${tier}`);

export const GROUP_ORDER = GROUPS.map((g) => g.id);

interface TrophyMeta {
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
  if (!spec) return null;
  return {
    identity: groupText(group.id, "theme"),
    levelName: tierText(group.id, tier, "name"),
    levelLabel: tierLabel(tier),
    tagline: groupText(group.id, "tagline"),
    requirementText: tierText(group.id, tier, "requirement"),
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
        identity: groupText(group.id, "theme"),
        levelName: tierText(group.id, tier, "name"),
        levelLabel: tierLabel(tier),
        tagline: groupText(group.id, "tagline"),
        requirementText: tierText(group.id, tier, "requirement"),
        progressUnit: tierText(group.id, tier, spec.target === 1 ? "unitOne" : "unitOther"),
        parts: spec.parts?.(stats).map((done, i) => ({ label: tierText(group.id, tier, `part${i + 1}` as "part1"), done })) ?? null,
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
