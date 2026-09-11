/**
 * Kortvariant-system – Österlenpasset
 *
 * Varje variant definierar bakgrundsfärger och om kortet är ljust eller mörkt.
 * cardColors() returnerar rätt text- och accentfärger automatiskt.
 *
 * Arbetsflöde för att lägga till PNG-bakgrund:
 *   1. Skapa design i Figma (utan rundade hörn)
 *   2. Exportera som PNG @1x/@2x/@3x till assets/cards/<id>/
 *   3. Sätt bgImage: require("../../assets/cards/<id>/card-bg.png") på varianten
 */

export type CardVariant = {
  id: string;
  name: string;
  bg: string;        // Primär bakgrundsfärg (alltid solid fallback)
  bg2: string;       // Sekundär färg (gradient-ände)
  glow?: string;     // Radial-glow, rgba-sträng
  bgImage?: any;     // require()'d PNG – sätts när Figma-bild finns
  light: boolean;    // true = ljust kort → mörk text
  premium?: boolean; // true = enbart Österlenpasset-innehavare
};

export type CardColors = {
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
      text:           "rgba(15,10,0,0.90)",
      muted:          "rgba(15,10,0,0.55)",   // mörkare → datum läsbart
      accent:         "#6B4C0A",              // mörk guld — synlig på ljus bakgrund
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
 * Alla 10 kortvarianter.
 * De sju första är mörka (vit text), de tre sista ljusa (mörk text).
 * Varianter med bgImage använder PNG-bakgrund; övriga renderas som SVG-gradient.
 */
export const CARD_VARIANTS: CardVariant[] = [
  {
    id: "forest",
    name: "Skog",
    bg:  "#0A1E0D",
    bg2: "#152A18",
    glow: "rgba(50,160,70,0.16)",
    bgImage: require("../../assets/card-forest.png"),
    light: false,
  },
  {
    id: "rapeseed",
    name: "Rapsfält",
    bg:  "#F5E84A",
    bg2: "#E8D820",
    bgImage: require("../../assets/card-rapeseed.png"),
    light: true,
  },
  {
    id: "ocean",
    name: "Hav",
    bg:  "#001A2E",
    bg2: "#002A44",
    bgImage: require("../../assets/card-ocean.png"),
    light: false,
  },
  {
    id: "grapes",
    name: "Druvor",
    bg:  "#1A0A2E",
    bg2: "#2A1044",
    bgImage: require("../../assets/card-grapes.png"),
    light: false,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    bg:  "#0A0A0A",
    bg2: "#1C1C1C",
    bgImage: require("../../assets/card-obsidian.png"),
    light: false,
    premium: true,
  },
  {
    id: "copper",
    name: "Koppar",
    bg:  "#1A0E08",
    bg2: "#2C1A0E",
    bgImage: require("../../assets/card-copper.png"),
    light: false,
    premium: true,
  },
  {
    id: "sand",
    name: "Sand",
    bg:  "#F0E5C8",
    bg2: "#E0D0A8",
    bgImage: require("../../assets/card-sand.png"),
    light: true,
  },
];

/** Slår upp variant på ID – faller tillbaka på Midnatt. */
export function getVariant(id?: string | null): CardVariant {
  return CARD_VARIANTS.find((v) => v.id === id) ?? CARD_VARIANTS[0];
}
