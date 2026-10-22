/**
 * Öppettider i servicepunkternas text, så kartan kan visa om det är öppet just nu.
 *
 * - AutoMat: ett tidsintervall någonstans i texten, oftast "05-23" (alla dagar).
 * - Vård: "vardagar, lördag, (söndag)", t.ex. "08-15, stängt, (Stängt)".
 */

/** "08-15", "8.30–17", "07:00-22:00" */
const RANGE = /(\d{1,2})(?:[:.](\d{2}))?\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?/;

/** Öppet nu enligt ett tidsintervall i texten; null om texten inte är en tid */
function openNowIn(text: string, now = new Date()): boolean | null {
  const m = text.match(RANGE);
  if (!m) return /stängt/i.test(text) ? false : null;
  const from = Number(m[1]) * 60 + Number(m[2] ?? 0);
  let to = Number(m[3]) * 60 + Number(m[4] ?? 0);
  if (to === 0) to = 24 * 60;
  const t = now.getHours() * 60 + now.getMinutes();
  return to > from ? t >= from && t < to : t >= from || t < to; // över midnatt
}

/** AutoMat: texten delad i före / tiden / efter, och om det är öppet nu */
export function splitRange(text: string, now = new Date()) {
  const m = text.match(RANGE);
  if (!m || m.index == null) return null;
  return {
    before: text.slice(0, m.index),
    range: m[0],
    after: text.slice(m.index + m[0].length),
    open: openNowIn(m[0], now) === true,
  };
}

interface DayHours { label: string; text: string; today: boolean; open: boolean }

/** Vård: "08-15, stängt, (Stängt)" → vardagar, lördag, söndag — och vilken som gäller idag */
export function careHours(text: string, now = new Date()): DayHours[] | null {
  const m = text.match(/^\s*([^,(]+?)\s*,\s*([^,(]+?)\s*,?\s*\(([^)]+)\)\s*$/);
  if (!m) return null;
  const day = now.getDay(); // 0 = söndag
  const todayIndex = day === 0 ? 2 : day === 6 ? 1 : 0;
  const tidy = (s: string) => (/stängt/i.test(s) ? "stängt" : s.replace(/\s*[-–]\s*/, "–"));
  return [
    { label: "Vardagar", raw: m[1] },
    { label: "Lördag", raw: m[2] },
    { label: "Söndag", raw: m[3] },
  ].map((d, i) => ({
    label: d.label,
    text: tidy(d.raw),
    today: i === todayIndex,
    open: openNowIn(d.raw, now) === true,
  }));
}
