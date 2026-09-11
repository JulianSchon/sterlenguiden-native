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
  // ── Mörka varianter ─────────────────────────────────────────────────────────
  {
    id: "midnight",
    name: "Midnatt",
    bg:  "#0A0A0A",
    bg2: "#1A1208",
    glow: "rgba(197,160,89,0.22)",
    // PNG sätts i profile.tsx via require() för att Metro ska hitta den
    light: false,
  },
  {
    id: "navy",
    name: "Marin",
    bg:  "#08192E",
    bg2: "#0E2544",
    glow: "rgba(50,120,220,0.18)",
    light: false,
  },
  {
    id: "forest",
    name: "Skog",
    bg:  "#0A1E0D",
    bg2: "#152A18",
    glow: "rgba(50,160,70,0.16)",
    light: false,
  },
  {
    id: "wine",
    name: "Bordeaux",
    bg:  "#180A0D",
    bg2: "#2B1016",
    glow: "rgba(180,50,65,0.18)",
    light: false,
  },
  {
    id: "graphite",
    name: "Grafit",
    bg:  "#16162A",
    bg2: "#1E1E3C",
    glow: "rgba(110,90,220,0.14)",
    light: false,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    bg:  "#0A0A0A",
    bg2: "#1C1C1C",
    glow: "rgba(200,200,200,0.06)",
    light: false,
  },
  {
    id: "copper",
    name: "Koppar",
    bg:  "#1A0E08",
    bg2: "#2C1A0E",
    glow: "rgba(180,100,40,0.22)",
    light: false,
  },
  // ── Ljusa varianter ──────────────────────────────────────────────────────────
  {
    id: "sand",
    name: "Sand",
    bg:  "#F0E5C8",
    bg2: "#E0D0A8",
    glow: "rgba(160,120,40,0.30)",
    light: true,
  },
  {
    id: "ivory",
    name: "Elfenben",
    bg:  "#FDFAF2",
    bg2: "#EDE8DA",
    glow: "rgba(180,145,60,0.20)",
    light: true,
  },
  {
    id: "sage",
    name: "Salvia",
    bg:  "#CDE0CD",
    bg2: "#B5CEB5",
    glow: "rgba(50,110,55,0.22)",
    light: true,
  },
];

/** Slår upp variant på ID – faller tillbaka på Midnatt. */
export function getVariant(id?: string | null): CardVariant {
  return CARD_VARIANTS.find((v) => v.id === id) ?? CARD_VARIANTS[0];
}
