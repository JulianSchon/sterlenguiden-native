/**
 * "Ny månad på topplistan": första gången appen öppnas i en ny månad visas hur det gick förra
 * månaden i topplistan "Flest besök" (och i januari även förra året) — se MonthResetMoment.
 * Bara för den som är med i topplistorna och faktiskt besökte något under perioden.
 *
 * Vilken månad man senast sett sparas på telefonen. Första gången (ny installation, eller innan
 * funktionen fanns) sparas bara den aktuella månaden — man får inget besked om en månad man inte
 * var med i från början.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/integrations/supabase/client";
import { swedishDay } from "@/lib/streak";

export interface PeriodResult {
  /** Periodens första dag, "2026-10-01" (månad) eller "2026-01-01" (år) */
  periodStart: string;
  placement: number;
  visits: number;
  participants: number;
}

export interface MonthReset {
  /** Den nya månaden, "2026-11" — sparas som sedd när ögonblicket stängs */
  month: string;
  lastMonth: PeriodResult | null;
  /** Bara i januari */
  lastYear: PeriodResult | null;
}

const seenKey = (userId: string) => `leaderboard-month-seen:v1:${userId}`;

async function fetchResult(period: "month" | "year"): Promise<PeriodResult | null> {
  const { data, error } = await supabase.rpc("rpc_my_last_leaderboard", { p_period: period });
  const r = data?.[0];
  if (error || !r) return null;
  return { periodStart: r.period_start, placement: r.placement, visits: r.visit_count, participants: r.participants };
}

// Endast för test i utvecklingsläget: visa ögonblicket igen (se LeaderboardSection). Saknas ett
// riktigt resultat för förra månaden (inga besök då) visas ett påhittat exempel, så att det går
// att se hur det ser ut.
let devRecheck: (() => void) | null = null;
let devExample = false;
export function devShowMonthResetAgain(userId: string) {
  if (!__DEV__) return;
  devExample = true;
  AsyncStorage.setItem(seenKey(userId), "0000-00").catch(() => {}).then(() => devRecheck?.());
}
function devExampleResult(month: string): PeriodResult {
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { periodStart: `${prev}-01`, placement: 3, visits: 12, participants: 37 };
}

/** Ögonblicket att visa (en gång per ny månad), och done() som markerar det som sett. */
export function useMonthReset(userId: string | undefined, participates: boolean, enabled: boolean) {
  const [moment, setMoment] = useState<MonthReset | null>(null);
  const [check, setCheck] = useState(0);
  useEffect(() => {
    if (!__DEV__) return;
    devRecheck = () => setCheck((c) => c + 1);
    return () => { devRecheck = null; };
  }, []);

  useEffect(() => {
    if (!userId || !enabled) return;
    let alive = true;
    const month = swedishDay().slice(0, 7);
    (async () => {
      const seen = await AsyncStorage.getItem(seenKey(userId)).catch(() => null);
      if (seen === month) return;
      if (!seen || !participates) {
        await AsyncStorage.setItem(seenKey(userId), month).catch(() => {});
        return;
      }
      let lastMonth = await fetchResult("month");
      if (__DEV__ && devExample && !lastMonth) lastMonth = devExampleResult(month);
      devExample = false;
      // Året bara när ett nytt år börjat sedan sist
      const lastYear = month.endsWith("-01") && seen.slice(0, 4) < month.slice(0, 4) ? await fetchResult("year") : null;
      if (!alive) return;
      if (!lastMonth && !lastYear) {
        await AsyncStorage.setItem(seenKey(userId), month).catch(() => {});
        return;
      }
      setMoment({ month, lastMonth, lastYear });
    })();
    return () => { alive = false; };
  }, [userId, participates, enabled, check]);

  const done = () => {
    if (userId && moment) AsyncStorage.setItem(seenKey(userId), moment.month).catch(() => {});
    setMoment(null);
  };
  return { moment, done };
}
