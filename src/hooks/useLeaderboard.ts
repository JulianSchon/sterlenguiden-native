/**
 * Topplistor — Besök, Streak och Samlarobjekt, rangordnade i tre omfång (hela appen, samma ort,
 * vänner). All rangordning sker på servern (rpc_leaderboard, migration 020–022): klienten får
 * bara se de som själva valt att delta, plus sin egen rad (placement null om man inte deltar).
 * Hämtas i sidor om 50, så en lista med tusentals deltagare aldrig hämtas på en gång.
 */
import { useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_BUCKET, storagePath } from "@/hooks/useAvatarUrl";

export const LEADERBOARD_PAGE = 50;

export type LeaderboardMetric = "visits" | "streak" | "stickers";
export type LeaderboardScope = "all" | "area" | "friends";
export type LeaderboardPeriod = "month" | "year" | "all";

export interface LeaderboardEntry {
  userId: string;
  name: string;
  circleColor: string | null;
  value: number;
  /** Plats i listan — null om man inte deltar (eller saknar ort i "mitt område") */
  placement: number | null;
  /** Radens position i listan (1, 2, 3 … även vid delad placering) — null om man inte är med */
  rowPos: number | null;
  username: string | null;
  city: string | null;
  /** Tillfällig länk till profilbilden — bara om personen valt att visa den i topplistorna */
  avatarUrl: string | null;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

type Period = LeaderboardPeriod;

async function fetchPage(metric: LeaderboardMetric, scope: LeaderboardScope, period: Period, offset: number, limit: number) {
  const { data, error } = await supabase.rpc("rpc_leaderboard", {
    p_metric: metric, p_scope: scope, p_period: period, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  const rows = data ?? [];

  // Profilbilderna ligger i en privat mapp — signera alla sidans bilder i ett enda anrop
  const paths = [...new Set(rows.map((r) => storagePath(r.avatar_path)).filter((p): p is string => !!p))];
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const toEntry = (r: (typeof rows)[number]): LeaderboardEntry => ({
    avatarUrl: signed.get(storagePath(r.avatar_path) ?? "") ?? null,
    userId: r.user_id,
    name: r.display_name,
    circleColor: r.circle_color,
    value: r.metric_value,
    placement: r.placement,
    rowPos: r.row_pos,
    username: r.username,
    city: r.city,
  });
  const self = rows.find((r) => r.self_row);
  return { entries: rows.filter((r) => !r.self_row).map(toEntry), me: self ? toEntry(self) : null, offset, limit };
}

// Perioden betyder bara något för besök — streak och samlarobjekt delar cache oavsett vad den står på
const periodFor = (metric: LeaderboardMetric, period: Period): Period => (metric === "visits" ? period : "all");

/** Min egen rad i "flest besök denna månad, hela appen" — antal, placering och radnummer
 * (placering och rad är null om jag inte syns i topplistorna, eller inte besökt något än i
 * månaden). Hämtas före och efter en incheckning, för att visa klättringen. */
export async function fetchMyMonthStanding(): Promise<LeaderboardEntry | null> {
  const page = await fetchPage("visits", "all", "month", 0, 1);
  return page.me;
}

/** Raderna `fromRow` till `fromRow + count - 1` i samma topplista — grannarna runt mig efter en
 * incheckning (den jag nu jagar och de jag nyss gick om). */
export async function fetchMonthRows(fromRow: number, count: number): Promise<LeaderboardEntry[]> {
  const page = await fetchPage("visits", "all", "month", Math.max(0, fromRow - 1), count);
  return page.entries;
}

/** Första sidan (topp 5) — förhandstitten på Mitt Österlen. */
export function useLeaderboard(metric: LeaderboardMetric, scope: LeaderboardScope, period: Period = "all") {
  const p = periodFor(metric, period);
  return useQuery({
    queryKey: ["leaderboard", "preview", metric, scope, p],
    // Kortare än appens standard (5 min) — ens egen siffra ska hänga med efter en incheckning
    staleTime: 60_000,
    queryFn: async (): Promise<Leaderboard> => {
      const page = await fetchPage(metric, scope, p, 0, 5);
      return { entries: page.entries, me: page.me };
    },
  });
}

/**
 * Hela listan på topplistesidan: 50 i taget när man scrollar mot slutet. `jumpTo(rowPos)` hämtar
 * allt fram till en viss rad i ETT anrop (i stället för sida för sida), för "tryck på mig själv"
 * — så den som ligger på plats 12 000 inte behöver vänta på 240 anrop i rad.
 */
export function useLeaderboardList(metric: LeaderboardMetric, scope: LeaderboardScope, period: Period = "all") {
  const p = periodFor(metric, period);
  const jumpTarget = useRef<number | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["leaderboard", "list", metric, scope, p],
    staleTime: 60_000,
    initialPageParam: { offset: 0, limit: LEADERBOARD_PAGE },
    queryFn: ({ pageParam }) => fetchPage(metric, scope, p, pageParam.offset, pageParam.limit),
    getNextPageParam: (last) => {
      if (last.entries.length < last.limit) return undefined;
      const loaded = last.offset + last.limit;
      const target = jumpTarget.current;
      const limit = target && target > loaded ? target - loaded + LEADERBOARD_PAGE / 2 : LEADERBOARD_PAGE;
      return { offset: loaded, limit };
    },
  });
  const pages = query.data?.pages ?? [];
  const entries = pages.flatMap((pg) => pg.entries);
  return {
    ...query,
    entries,
    me: pages[0]?.me ?? null,
    /** Läser in raderna fram till `rowPos` (ett enda anrop) om de inte redan finns */
    async loadThrough(rowPos: number) {
      if (entries.length >= rowPos || !query.hasNextPage) return;
      jumpTarget.current = rowPos;
      try {
        await query.fetchNextPage();
      } finally {
        jumpTarget.current = null;
      }
    },
  };
}

type LeaderboardSettings = { show_in_leaderboard?: boolean; show_leaderboard_avatar?: boolean };

function useUpdateLeaderboardSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: LeaderboardSettings) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");
      const { error } = await supabase.from("profiles").update(changes).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

/** Sätter samtycket. false sparas också (inte bara true) så appen vet att den redan frågat. */
export function useSetLeaderboardVisibility() {
  const update = useUpdateLeaderboardSettings();
  return { ...update, mutate: (v: boolean) => update.mutate({ show_in_leaderboard: v }), mutateAsync: (v: boolean) => update.mutateAsync({ show_in_leaderboard: v }) };
}

/** Visa profilbilden i topplistorna (gäller bara när man också syns). */
export function useSetLeaderboardAvatar() {
  const update = useUpdateLeaderboardSettings();
  return {
    ...update,
    mutate: (v: boolean, options?: Parameters<typeof update.mutate>[1]) => update.mutate({ show_leaderboard_avatar: v }, options),
  };
}

/** "4 besök", "12 dagar", "7 objekt" — samma enhet överallt där ett värde visas. */
export function formatLeaderboardValue(metric: LeaderboardMetric, value: number): string {
  if (metric === "visits") return `${value} besök`;
  if (metric === "streak") return `${value} ${value === 1 ? "dag" : "dagar"}`;
  return `${value} objekt`;
}
