/**
 * Sökets färdiga frågor ("Äta nu", "Fika", "Sova i natt" …) och deras färger. Samma rutor på Sök
 * och samma genvägar på Hem: ett tryck på Hem öppnar Sök med svaret redan klart (openSearch).
 */
import type { useRouter } from "expo-router";
import {
  Baby, BedDouble, CalendarDays, Coffee, Dog, Moon, Trees, UtensilsCrossed, type LucideIcon,
} from "lucide-react-native";

export type Tint = { dark: string; light: string; ring?: "night" };

/**
 * Rutornas och svarskortets färger: kategorins (samma som kartans prickar) där det finns en,
 * annars en egen som inte krockar med kategorierna.
 */
export const TINT = {
  eat: { dark: "#C23A5E", light: "#881337" },
  fika: { dark: "#D4BE86", light: "#8A6A2E" },
  sleep: { dark: "#3F7BEA", light: "#1E3A8A" },
  kids: { dark: "#2499C2", light: "#0C4A6E" },
  // Månen: gul mot en grå ring, som månen på natthimlen
  late: { dark: "#F2D06B", light: "#A8830A" },
  dog: { dark: "#C08A5B", light: "#7C4A21" },
  nature: { dark: "#2BA36A", light: "#064E3B" },
  events: { dark: "#A55BE0", light: "#581C87" },
  open: { dark: "#4ADE80", light: "#15803D" },
  gold: { dark: "#E8C674", light: "#8A6A2E" },
} satisfies Record<string, Tint>;

export interface Shortcut { key: string; label: string; query: string; Icon: LucideIcon; tint: Tint }

/** "Vad vill du göra?" — varje ruta är en färdig fråga till söket (ordningen håller lika färger isär) */
export const TILES: Shortcut[] = [
  { key: "eat", label: "Äta nu", query: "äta nu", Icon: UtensilsCrossed, tint: TINT.eat },
  { key: "fika", label: "Fika", query: "fika", Icon: Coffee, tint: TINT.fika },
  { key: "sleep", label: "Sova i natt", query: "sova", Icon: BedDouble, tint: TINT.sleep },
  { key: "kids", label: "Familj", query: "familj", Icon: Baby, tint: TINT.kids },
  { key: "late", label: "Öppet sent", query: "öppet sent", Icon: Moon, tint: { ...TINT.late, ring: "night" } },
  { key: "dog", label: "Med hund", query: "med hund", Icon: Dog, tint: TINT.dog },
  { key: "nature", label: "Ut i naturen", query: "natur", Icon: Trees, tint: TINT.nature },
  { key: "events", label: "Händer snart", query: "evenemang", Icon: CalendarDays, tint: TINT.events },
];

/**
 * Öppnar Sök med en fråga redan ställd. Hem och Sök är båda flikar, så det räcker att byta flik;
 * `n` gör att samma fråga två gånger i rad ändå ställs igen.
 */
export function openSearch(router: ReturnType<typeof useRouter>, query: string) {
  router.navigate({ pathname: "/(tabs)/explore", params: { ask: query, n: String(Date.now()) } });
}
