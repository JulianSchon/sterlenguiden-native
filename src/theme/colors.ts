/**
 * Färgtokens för mörkt och ljust läge. Sidor ska hämta färger härifrån via
 * useTheme() i stället för att hårdkoda hex-värden.
 *
 * Mörkt = appens ursprungliga uttryck. Ljust = "varmt linne": en mjuk krämig
 * bakgrund, vita kort, nästan svart text och ett mörkare guld som håller
 * kontrast mot ljust.
 */

export interface ThemeColors {
  /** Sidans bakgrund */
  bg: string;
  /** Vanligt kort/yta ovanpå bakgrunden */
  card: string;
  /** Kortens mjuka gradient (uppe till vänster → nere till höger) */
  cardTop: string;
  cardBottom: string;
  /** Nedsänkt ikonruta och dess kant */
  tile: string;
  tileBorder: string;
  /** Lite upphöjd yta (t.ex. paneler, inmatningsfält) */
  raised: string;
  /** Diskret fyllning (piller, ikonrutor, tryckta ytor) */
  fill: string;
  /** Tunn kant */
  border: string;
  /** Tydligare kant (inmatningsfält, val) */
  borderStrong: string;
  text: string;
  muted: string;
  faint: string;
  /** Guld som yta/knapp; text på den är onGold */
  gold: string;
  onGold: string;
  /** Guld som text/ikon (mörkare i ljust läge så det syns) */
  goldText: string;
  /** Svagt guldskimmer bakom ikoner och val */
  goldSoft: string;
  goldBorder: string;
  /** Samlarobjekt */
  purple: string;
  /** Dämpad varm ton för mindre viktig text (som "Varje plats. Varje minne." på Profil) */
  warm: string;
  danger: string;
  /** Mörkläggning bakom paneler och dialoger */
  overlay: string;
}

export const darkColors: ThemeColors = {
  bg: "#121212",
  card: "#1C1C1C",
  cardTop: "#1C1C1C",
  cardBottom: "#181818",
  tile: "#2B2B2B",
  tileBorder: "rgba(0,0,0,0.4)",
  raised: "#1A1A1D",
  fill: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
  text: "#F5F1E8",
  muted: "rgba(245,241,232,0.55)",
  faint: "rgba(245,241,232,0.35)",
  gold: "#C5A059",
  onGold: "#121212",
  goldText: "#E8C674",
  goldSoft: "rgba(197,160,89,0.12)",
  goldBorder: "rgba(197,160,89,0.30)",
  purple: "#A78BFA",
  warm: "#A09880",
  danger: "#EF4444",
  overlay: "rgba(0,0,0,0.6)",
};

export const lightColors: ThemeColors = {
  bg: "#F4F0E6",
  card: "#FFFFFF",
  cardTop: "#FFFFFF",
  cardBottom: "#FAF7F0",
  tile: "rgba(35,28,15,0.06)",
  tileBorder: "rgba(35,28,15,0.10)",
  raised: "#FBF9F3",
  fill: "rgba(35,28,15,0.05)",
  border: "rgba(35,28,15,0.08)",
  borderStrong: "rgba(35,28,15,0.16)",
  text: "#1D1B16",
  muted: "rgba(29,27,22,0.60)",
  faint: "rgba(29,27,22,0.38)",
  gold: "#C5A059",
  onGold: "#1A1408",
  goldText: "#8A6A1F",
  goldSoft: "rgba(197,160,89,0.16)",
  goldBorder: "rgba(138,106,31,0.35)",
  purple: "#7C3AED",
  warm: "#7A6F55",
  danger: "#DC2626",
  overlay: "rgba(20,15,5,0.45)",
};
