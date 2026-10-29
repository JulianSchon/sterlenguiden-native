/**
 * Kartans markörer.
 *
 * - Vanliga nålar: klassiska droppformade nålar i temats färg — svarta i mörkt läge, vita i ljust,
 *   som klumparna — med kategorins färg som prick. Servicenålarna har typens ikon i guld, skatterna
 *   är kryss som på en skattkarta. Färdiga bilder (assets/map-pins, scripts/render-map-pins.js och render-treasure-pins.js) som Google
 *   Kartor ritar själv som ikoner — snabbast möjligt, inget ritas om när kartan rör sig.
 *   Klumparna och listans numrerade nålar är också färdiga bilder (mapIcons.ts).
 * - SelectedPin: det man valt (plats eller servicepunkt) — en större guldnål som studsar in.
 * - LogoMarker: när en kategori är vald visas platserna som sina loggor i vita cirklar.
 *
 * Markörer som ritas i appen (guldnålen och loggorna) fångas av Google som bilder — de är få.
 */
import { memo, useEffect } from "react";
import { Platform, StyleSheet, View, type ImageRequireSource, type ImageURISource } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from "react-native-svg";
import { HeartPulse, MapPin, Plug, Store, Toilet, ToyBrick, type LucideIcon } from "lucide-react-native";
import { firstImageUrl, type Place } from "@/hooks/usePlaces";
import type { CategoryId } from "@/theme/categories";
import i18n from "i18next";

const GOLD = "#D9A441";

/** Nålens spets ligger 83 % ner i bilden (resten är plats för skuggan) */
export const PIN_ANCHOR = { x: 0.5, y: 0.8333 };
/** Klumparna sitter med mitten på sin punkt */
export const CENTER_ANCHOR = { x: 0.5, y: 0.5 };

/**
 * En färdig bild som nålens ikon. På iPhone som Googles egen ikon (icon) — med image blir den en
 * vy som Google måste fånga, vilket är mycket långsammare. Android har bara image, och där är
 * den redan en ikon.
 */
export const pinImage = (source: ImageURISource | ImageRequireSource) =>
  Platform.OS === "ios" ? { icon: source } : { image: source };

/** Loggornas kant i loggläget: kategoriernas färg */
export const PIN_COLORS: Record<CategoryId | "other", string> = {
  "mat-dryck": "#A3214B",
  "hotell-bb": "#4C44C9",
  "cafe-bageri": "#C2A468",
  "butiker": "#D9582A",
  "natur-upplevelser": "#16794A",
  "aktiviteter": "#11708F",
  "sevardheter": "#7A2BB8",
  "hantverk-service": "#7D8796",
  "other": "#8E8E93",
};

/** Servicepunkternas typer (type i databasen), i den ordning de visas i filtret */
/** type = värdet i databasen; namnen på appens språk (map.services.*) */
const service = (type: string, key: ServiceKey, Icon: LucideIcon) => ({
  type, key, Icon,
  get label() { return i18n.t(`map.services.${key}.label`); },
  get one() { return i18n.t(`map.services.${key}.one`); },
  get many() { return i18n.t(`map.services.${key}.many`); },
});
export const SERVICE_TYPES: { type: string; key: ServiceKey; readonly label: string; readonly one: string; readonly many: string; Icon: LucideIcon }[] = [
  service("Toalett", "toalett", Toilet),
  service("Laddning", "laddning", Plug),
  service("AutoMat", "automat", Store),
  service("Vård", "vard", HeartPulse),
  service("Lekplats", "lekplats", ToyBrick),
];
type ServiceKey = "toalett" | "laddning" | "automat" | "vard" | "lekplats";
export const serviceType = (type: string) => SERVICE_TYPES.find((t) => t.type.toLowerCase() === type.trim().toLowerCase());
export const serviceIcon = (type: string): LucideIcon => serviceType(type)?.Icon ?? MapPin;

/* eslint-disable @typescript-eslint/no-require-imports */
const PLACE_PINS: Record<"dark" | "light", Record<CategoryId | "other", ImageRequireSource>> = {
  dark: {
    "mat-dryck": require("../../../assets/map-pins/pin-mat-dryck-dark.png"),
    "hotell-bb": require("../../../assets/map-pins/pin-hotell-bb-dark.png"),
    "cafe-bageri": require("../../../assets/map-pins/pin-cafe-bageri-dark.png"),
    "butiker": require("../../../assets/map-pins/pin-butiker-dark.png"),
    "natur-upplevelser": require("../../../assets/map-pins/pin-natur-upplevelser-dark.png"),
    "aktiviteter": require("../../../assets/map-pins/pin-aktiviteter-dark.png"),
    "sevardheter": require("../../../assets/map-pins/pin-sevardheter-dark.png"),
    "hantverk-service": require("../../../assets/map-pins/pin-hantverk-service-dark.png"),
    "other": require("../../../assets/map-pins/pin-other-dark.png"),
  },
  light: {
    "mat-dryck": require("../../../assets/map-pins/pin-mat-dryck-light.png"),
    "hotell-bb": require("../../../assets/map-pins/pin-hotell-bb-light.png"),
    "cafe-bageri": require("../../../assets/map-pins/pin-cafe-bageri-light.png"),
    "butiker": require("../../../assets/map-pins/pin-butiker-light.png"),
    "natur-upplevelser": require("../../../assets/map-pins/pin-natur-upplevelser-light.png"),
    "aktiviteter": require("../../../assets/map-pins/pin-aktiviteter-light.png"),
    "sevardheter": require("../../../assets/map-pins/pin-sevardheter-light.png"),
    "hantverk-service": require("../../../assets/map-pins/pin-hantverk-service-light.png"),
    "other": require("../../../assets/map-pins/pin-other-light.png"),
  },
};
const SERVICE_PINS: Record<"dark" | "light", Record<ServiceKey, ImageRequireSource>> = {
  dark: {
    toalett: require("../../../assets/map-pins/pin-svc-toalett-dark.png"),
    laddning: require("../../../assets/map-pins/pin-svc-laddning-dark.png"),
    automat: require("../../../assets/map-pins/pin-svc-automat-dark.png"),
    vard: require("../../../assets/map-pins/pin-svc-vard-dark.png"),
    lekplats: require("../../../assets/map-pins/pin-svc-lekplats-dark.png"),
  },
  light: {
    toalett: require("../../../assets/map-pins/pin-svc-toalett-light.png"),
    laddning: require("../../../assets/map-pins/pin-svc-laddning-light.png"),
    automat: require("../../../assets/map-pins/pin-svc-automat-light.png"),
    vard: require("../../../assets/map-pins/pin-svc-vard-light.png"),
    lekplats: require("../../../assets/map-pins/pin-svc-lekplats-light.png"),
  },
};
// Skatterna som kryss på en skattkarta: grått = ej hittad, lila = hittad (scripts/render-treasure-pins.js)
const TREASURE_PINS = {
  "treasure-dark": require("../../../assets/map-pins/pin-treasure-dark.png"),
  "treasure-light": require("../../../assets/map-pins/pin-treasure-light.png"),
  "treasure-selected-dark": require("../../../assets/map-pins/pin-treasure-selected-dark.png"),
  "treasure-selected-light": require("../../../assets/map-pins/pin-treasure-selected-light.png"),
  "treasure-found": require("../../../assets/map-pins/pin-treasure-found.png"),
  "treasure-found-selected": require("../../../assets/map-pins/pin-treasure-found-selected.png"),
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */

export const placePinImage = (category: CategoryId | undefined, dark: boolean) =>
  PLACE_PINS[dark ? "dark" : "light"][category ?? "other"];
export const servicePinImage = (type: string, dark: boolean) =>
  SERVICE_PINS[dark ? "dark" : "light"][serviceType(type)?.key ?? "toalett"];
/** Ej hittade är ljusgrå på den mörka kartan och mörkgrå på den ljusa; hittade är lila i båda */
export const treasurePinImage = (found: boolean, selected: boolean, dark: boolean) =>
  TREASURE_PINS[(found
    ? `treasure-found${selected ? "-selected" : ""}`
    : `treasure${selected ? "-selected" : ""}-${dark ? "dark" : "light"}`) as keyof typeof TREASURE_PINS];

/** Bilden en plats visas med i loggläget: loggan, annars platsens första bild */
export function placeLogo(place: Place): { uri: string; fit: "contain" | "cover" } | null {
  if (place.logo_url) return { uri: place.logo_url, fit: "contain" };
  const image = firstImageUrl(place.image_url);
  return image ? { uri: image, fit: "cover" } : null;
}

// ── Vald nål: guld, studsar in ──────────────────────────────────────────────

// Ytan runt nålen har luft åt alla håll, så att studsen (som gör nålen större en stund) och
// skuggan på marken aldrig klipps av kanten
const SEL_W = 48;
const SEL_H = 64;
/** Från ytans nederkant upp till spetsen (plats för studsen nedåt och skuggan) */
const SEL_FOOT = 7;
const SEL_PATH = "M18 0C8.06 0 0 8.06 0 18c0 12.6 18 26 18 26s18-13.4 18-26C36 8.06 27.94 0 18 0z";

/** Guldnålens spets i sin yta */
export const SELECTED_ANCHOR = { x: 0.5, y: (SEL_H - SEL_FOOT) / SEL_H };
/** Guldnålens yta (platssidans lilla karta lägger nålen ovanpå kartan själv) */
export const SELECTED_SIZE = { width: SEL_W, height: SEL_H };

export function SelectedPin() {
  const t = useSharedValue(0);
  useEffect(() => {
    // 0 → 55 %: ner, större; 55 → 80 %: lite upp, mindre; 80 → 100 %: på plats (sammanlagt 360 ms)
    const ease = Easing.bezier(0.22, 1, 0.36, 1);
    t.value = withSequence(
      withTiming(0.55, { duration: 198, easing: ease }),
      withTiming(0.8, { duration: 90, easing: ease }),
      withTiming(1, { duration: 72, easing: ease }),
    );
  }, [t]);
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const seg = (a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    const y = v <= 0.55 ? -8 + 10 * seg(0, 0.55) : v <= 0.8 ? 2 - 3 * seg(0.55, 0.8) : -1 + seg(0.8, 1);
    const s = v <= 0.55 ? 0.7 + 0.38 * seg(0, 0.55) : v <= 0.8 ? 1.08 - 0.11 * seg(0.55, 0.8) : 0.97 + 0.03 * seg(0.8, 1);
    return { opacity: Math.min(1, v / 0.55), transform: [{ translateY: y }, { scale: s }] };
  });
  return (
    <View style={{ width: SEL_W, height: SEL_H }}>
      {/* Skuggan på marken står still medan nålen studsar */}
      <Svg width={20} height={8} style={{ position: "absolute", left: SEL_W / 2 - 10, top: SEL_H - SEL_FOOT - 4 }}>
        <Defs>
          <RadialGradient id="selShadow" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#000" stopOpacity={0.45} />
            <Stop offset="1" stopColor="#000" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={10} cy={4} rx={10} ry={4} fill="url(#selShadow)" />
      </Svg>
      {/* Nålen: spetsen precis på ankaret, ritytan en punkt större åt alla håll för den vita kanten */}
      <Reanimated.View style={[s.selPin, style]}>
        <Svg width={38} height={46} viewBox="-1 -1 38 46">
          <Path d={SEL_PATH} fill={GOLD} stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={1.5} />
          <Circle cx={18} cy={16} r={7} fill="#FFFFFF" />
        </Svg>
      </Reanimated.View>
    </View>
  );
}

// ── Loggläget ────────────────────────────────────────────────────────────────

export const LogoMarker = memo(function LogoMarker({
  logo, color, selected = false, onReady,
}: { logo: { uri: string; fit: "contain" | "cover" }; color: string; selected?: boolean; onReady?: () => void }) {
  const size = selected ? 48 : 40;
  return (
    // Luft runt om så skuggan får plats i bilden Google fångar
    <View style={{ padding: 8 }}>
      <View
        style={[
          s.logo,
          { width: size, height: size, borderRadius: size / 2, borderWidth: selected ? 3 : 2, borderColor: selected ? GOLD : color },
        ]}
      >
        <ExpoImage
          source={{ uri: logo.uri }}
          style={logo.fit === "contain" ? { width: size - 10, height: size - 10 } : StyleSheet.absoluteFill}
          contentFit={logo.fit}
          cachePolicy="memory-disk"
          onLoad={onReady}
          onError={onReady}
        />
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  selPin: { position: "absolute", left: (SEL_W - 38) / 2, bottom: SEL_FOOT - 1, transformOrigin: "bottom" },
  logo: {
    alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#FFFFFF",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
});
