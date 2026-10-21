/** Ett antal att visa upp, avrundat nedåt så det alltid stämmer: 312 → "300+", 23 → "20+", 7 → "7" */
export function roundedCount(n: number): { value: number; plus: boolean } {
  if (n >= 100) return { value: Math.floor(n / 50) * 50, plus: true };
  if (n >= 20) return { value: Math.floor(n / 10) * 10, plus: true };
  return { value: n, plus: false };
}

/** Samma sak som text: "300+", "20+", "7" */
export function roundedCountText(n: number): string {
  const { value, plus } = roundedCount(n);
  return `${value}${plus ? "+" : ""}`;
}
