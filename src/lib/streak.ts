/**
 * Streak — regler och uträkningar.
 *
 * En "dag" är en svensk kalenderdag med minst en appöppning, sparad som en rad
 * i app_days. Streak, längsta streak och startdatum räknas alltid ut ur
 * dagslistan (inget räknat värde sparas), precis som troféerna räknas ut ur
 * riktig data. Missar man en dag börjar streaken om.
 *
 * Dagar hanteras som strängar "YYYY-MM-DD" och räknas som heltal
 * (dagar sedan 1970) så att sommartid aldrig kan förskjuta en dag.
 */

const DAY_MS = 86_400_000;

/** Dagens datum i Sverige, "2026-09-24". */
export function swedishDay(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function dayString(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export interface StreakStats {
  /** Antal dagar i rad fram till idag (eller igår, om idag inte hunnit räknas än) */
  current: number;
  longest: number;
  /** Första dagen i den pågående streaken, eller null om ingen pågår */
  startedOn: string | null;
}

export function computeStreak(days: string[], today = swedishDay()): StreakStats {
  const nums = [...new Set(days.map(dayNumber))].sort((a, b) => a - b);

  let longest = 0;
  let run = 0;
  for (let i = 0; i < nums.length; i++) {
    run = i > 0 && nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // Pågående streak: räkna bakåt från idag. Har man inte öppnat appen idag än
  // lever streaken ändå tills dagen är slut, så då räknar vi från igår.
  const set = new Set(nums);
  const t = dayNumber(today);
  let cursor = set.has(t) ? t : t - 1;
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor--;
  }

  const startedOn = current > 0 ? dayString(cursor + 1) : null;
  return { current, longest, startedOn };
}

/** Veckans sju dagar (måndag först) för veckan som innehåller `today`. */
export function weekDays(today = swedishDay()): string[] {
  const t = dayNumber(today);
  const weekday = (new Date(t * DAY_MS).getUTCDay() + 6) % 7; // 0 = måndag
  return Array.from({ length: 7 }, (_, i) => dayString(t - weekday + i));
}
