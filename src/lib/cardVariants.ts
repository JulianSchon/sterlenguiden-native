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
      text:           "rgba(15,10,0,0.88)",
      muted:          "rgba(15,10,0,0.38)",
      accent:         "#7A5C10",
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
    id: "midnight",
    name: "Midnatt",
    bg:  "#0A0A0A",
    bg2: "#1A1208",
    glow: "rgba(197,160,89,0.22)",
    bgImage: require("../../assets/card-bg.png"),
    light: false,
  },
  {
    id: "forest",
    name: "Skog",
    bg:  "#0A1E0D",
    bg2: "#152A18",
    glow: "rgba(50,160,70,0.16)",
    bgImage: require("../../assets/card-forest.png"),
    light: false,
  },
];

/** Slår upp variant på ID – faller tillbaka på Midnatt. */
export function getVariant(id?: string | null): CardVariant {
  return CARD_VARIANTS.find((v) => v.id === id) ?? CARD_VARIANTS[0];
}
