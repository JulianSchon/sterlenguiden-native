/** Små färg- och namnhjälpare för profilcirkeln. */

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Textfärg som passar på en bakgrund av samma nyans: mörk nyans på en ljus
 * färg (ljusblå → mörkblå), ljus nyans på en mörk färg (marinblå → ljusblå).
 */
export function toneOnTone(background: string): string {
  const hsl = hexToHsl(background);
  if (!hsl) return "#F5F1E8";
  const [h, s, l] = hsl;
  return l > 0.5 ? hslToHex(h, Math.max(s, 0.35), 0.2) : hslToHex(h, Math.max(s, 0.25), 0.85);
}

/** Samma nyans men ljusare och mindre mättad, för färger som ska synas på mörk bakgrund utan att lysa. */
export function softenColor(color: string): string {
  const hsl = hexToHsl(color);
  if (!hsl) return color;
  const [h, s, l] = hsl;
  return hslToHex(h, s * 0.7, l + (1 - l) * 0.3);
}

/** "Viktor Hallin" → "VH", "Viktor" → "V". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
