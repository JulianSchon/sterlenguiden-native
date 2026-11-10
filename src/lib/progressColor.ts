/** Framstegets färg efter hur nära man är: glider från vinrött (långt kvar) via rött, orange och gult
 * till grönt, så att 59 av 60 redan är nästan grönt. Används av utmaningarna och av ordräknaren
 * i Mitt företag (där räknas den baklänges: många ord kvar är grönt, fullt är vinrött).
 * Färgstopp i HSL (nyansen räknas vidare förbi 360 så att vinrött → rött går åt rätt håll). */
const PROGRESS_STOPS: [number, number, number, number][] = [
  // [andel, nyans, mättnad %, ljushet %]
  [0, 342, 62, 46],    // vinröd
  [0.2, 360, 82, 60],  // röd
  [0.5, 388, 90, 58],  // orange
  [0.8, 412, 88, 57],  // gul
  [1, 475, 70, 55],    // grön
];

export const progressColor = (ratio: number) => {
  const r = Math.max(0, Math.min(1, ratio));
  const i = Math.max(0, PROGRESS_STOPS.findIndex((stop) => stop[0] >= r) - 1);
  const [a, h1, s1, l1] = PROGRESS_STOPS[i];
  const [b, h2, s2, l2] = PROGRESS_STOPS[Math.min(i + 1, PROGRESS_STOPS.length - 1)];
  const t = b > a ? (r - a) / (b - a) : 0;
  const mix = (x: number, y: number) => x + (y - x) * t;
  return `hsl(${Math.round(mix(h1, h2)) % 360}, ${Math.round(mix(s1, s2))}%, ${Math.round(mix(l1, l2))}%)`;
};
