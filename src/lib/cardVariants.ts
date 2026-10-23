/**
 * Kortvariant-system – Österlenpasset
 *
 * Varje variant definierar bakgrundsfärger och om kortet är ljust eller mörkt.
 * cardColors() returnerar rätt text- och accentfärger automatiskt.
 *
 * Arbetsflöde för att lägga till en bakgrundsbild:
 *   1. Skapa designen i Figma (utan rundade hörn) och exportera den stort, minst 1260 punkter bred
 *   2. Kör scripts/resize-card-images.js: den gör card-<id>.jpg, @2x och @3x i assets/cards/
 *   3. Sätt bgImage: require("../../assets/cards/card-<id>.jpg") på varianten
 *      — RN hittar @2x/@3x-filerna automatiskt och väljer rätt upplösning
 *      efter skärmens pixeltäthet.
 */

export type CardVariant = {
  id: string;
  name: string;
  bg: string;        // Primär bakgrundsfärg (alltid solid fallback)
  bg2: string;       // Sekundär färg (gradient-ände)
  glow?: string;     // Radial-glow, rgba-sträng
  bgImage?: any;     // require()'d bild – sätts när Figma-bild finns
  light: boolean;    // true = ljust kort → mörk text
};

type CardColors = {
  text: string;
  muted: string;
  accent: string;
  avatarBorder: string;
  avatarBg: string;
  avatarInitials: string;
  border: string;    // inner border
  sweep: string;     // light sweep overlay
};

/** Returnerar rätt färgpalett baserat på kortets kontrast. */
export function cardColors(variant: CardVariant): CardColors {
  if (variant.light) {
    return {
      text:           "#140E00",
      muted:          "rgba(20,14,0,0.88)",   // bakgrundsbilderna är mellanljusa, så även dämpad text ska vara nästan svart
      accent:         "#241800",              // mörk guld — synlig på ljus bakgrund
      avatarBorder:   "#8B6914",
      avatarBg:       "rgba(0,0,0,0.08)",
      avatarInitials: "#5A4210",
      border:         "rgba(0,0,0,0.14)",
      sweep:          "rgba(255,255,255,0.22)",
    };
  }
  return {
    text:           "rgba(255,255,255,0.95)",
    muted:          "rgba(255,255,255,0.35)",
    accent:         "#E8C547",
    avatarBorder:   "#D4AF37",
    avatarBg:       "rgba(255,255,255,0.10)",
    avatarInitials: "#F5F1E8",
    border:         "rgba(255,255,255,0.22)",
    sweep:          "rgba(255,235,160,0.045)",
  };
}

/**
 * Kortvarianterna. bg och bg2 är bildens egen genomsnittsfärg (övre och undre halvan), så kortet
 * har rätt färg redan medan bilden laddas. Varianter med bgImage använder PNG-bakgrund; övriga
 * renderas som SVG-gradient.
 */
export const CARD_VARIANTS: CardVariant[] = [
  {
    id: "forest",
    name: "Skog",
    bg:  "#2A3F29",
    bg2: "#1B3120",
    glow: "rgba(50,160,70,0.16)",
    bgImage: require("../../assets/cards/card-forest.jpg"),
    light: false,
  },
  {
    id: "rapeseed",
    name: "Rapsfält",
    bg:  "#CB9E26",
    bg2: "#C59720",
    bgImage: require("../../assets/cards/card-rapeseed.jpg"),
    light: true,
  },
  {
    id: "ocean",
    name: "Hav",
    bg:  "#2E526A",
    bg2: "#1E4159",
    bgImage: require("../../assets/cards/card-ocean.jpg"),
    light: false,
  },
  {
    id: "grapes",
    name: "Druvor",
    bg:  "#48141C",
    bg2: "#3D0E16",
    bgImage: require("../../assets/cards/card-grapes.jpg"),
    light: false,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    bg:  "#191918",
    bg2: "#111111",
    bgImage: require("../../assets/cards/card-obsidian.jpg"),
    light: false,
  },
  {
    id: "copper",
    name: "Koppar",
    bg:  "#532A16",
    bg2: "#4D2613",
    bgImage: require("../../assets/cards/card-copper.jpg"),
    light: false,
  },
  {
    id: "sand",
    name: "Sand",
    bg:  "#CCB69B",
    bg2: "#C5AD91",
    bgImage: require("../../assets/cards/card-sand.jpg"),
    light: true,
  },
];
