/**
 * Kartans markörer.
 *
 * - Vanliga nålar: klassiska droppformade nålar i kategoriernas färger med vit prick (skatter:
 *   lila med stjärna, service: ljusa). Färdiga bilder (assets/map-pins, scripts/render-map-pins.js)
 *   som Google Kartor ritar själv — snabbast möjligt, inget ritas om när kartan rör sig.
 * - SelectedPin: den valda platsen — en större guldnål som studsar in.
 * - LogoMarker: när en kategori är vald visas platserna som sina loggor i vita cirklar.
 * - ClusterMarker / LogoClusterMarker: många platser nära varandra när man zoomat ut.
 * - NumberPin: en plats i en vald lista, med sitt nummer i listans ordning.
 *
 * Markörer som ritas i appen (allt utom de färdiga bilderna) fångas av Google som bilder — de är få.
 */
import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { HeartPulse, MapPin, Plug, Store, Toilet, type LucideIcon } from "lucide-react-native";
import { firstImageUrl, type Place } from "@/hooks/usePlaces";
import type { CategoryId } from "@/theme/categories";

const GOLD = "#D9A441";

/** Nålens spets ligger 83 % ner i bilden (resten är plats för skuggan) */
export const PIN_ANCHOR = { x: 0.5, y: 0.8333 };

/** Nålarnas färger — kategoriernas djupa toner, lite ljusare så de syns mot den svarta kartan */
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

/* eslint-disable @typescript-eslint/no-require-imports */
const IMAGES = {
  "mat-dryck": require("../../../assets/map-pins/pin-mat-dryck.png"),
  "hotell-bb": require("../../../assets/map-pins/pin-hotell-bb.png"),
  "cafe-bageri": require("../../../assets/map-pins/pin-cafe-bageri.png"),
  "butiker": require("../../../assets/map-pins/pin-butiker.png"),
  "natur-upplevelser": require("../../../assets/map-pins/pin-natur-upplevelser.png"),
  "aktiviteter": require("../../../assets/map-pins/pin-aktiviteter.png"),
  "sevardheter": require("../../../assets/map-pins/pin-sevardheter.png"),
  "hantverk-service": require("../../../assets/map-pins/pin-hantverk-service.png"),
  "other": require("../../../assets/map-pins/pin-other.png"),
  "service": require("../../../assets/map-pins/pin-service.png"),
  "service-selected": require("../../../assets/map-pins/pin-service-selected.png"),
  "treasure": require("../../../assets/map-pins/pin-treasure.png"),
  "treasure-selected": require("../../../assets/map-pins/pin-treasure-selected.png"),
  "treasure-found": require("../../../assets/map-pins/pin-treasure-found.png"),
  "treasure-found-selected": require("../../../assets/map-pins/pin-treasure-found-selected.png"),
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */

export const placePinImage = (category: CategoryId | undefined) => IMAGES[category ?? "other"];
export const treasurePinImage = (found: boolean, selected: boolean) =>
  IMAGES[`${found ? "treasure-found" : "treasure"}${selected ? "-selected" : ""}` as keyof typeof IMAGES];
export const servicePinImage = (selected: boolean) => IMAGES[selected ? "service-selected" : "service"];

/** Bilden en plats visas med i loggläget: loggan, annars platsens första bild */
export function placeLogo(place: Place): { uri: string; fit: "contain" | "cover" } | null {
  if (place.logo_url) return { uri: place.logo_url, fit: "contain" };
  const image = firstImageUrl(place.image_url);
  return image ? { uri: image, fit: "cover" } : null;
}

// ── Vald nål: guld, studsar in ──────────────────────────────────────────────

/** Guldnålens spets: längst ner i sin yta */
export const SELECTED_ANCHOR = { x: 0.5, y: 1 };

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
    <View style={{ width: 36, height: 54, justifyContent: "flex-end" }}>
      <Reanimated.View style={[{ transformOrigin: "bottom" }, style]}>
        <Svg width={36} height={44} viewBox="0 0 36 44">
          <Path d="M18 0C8.06 0 0 8.06 0 18c0 12.6 18 26 18 26s18-13.4 18-26C36 8.06 27.94 0 18 0z" fill={GOLD} stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={1.5} />
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

// ── Klumpar ──────────────────────────────────────────────────────────────────

export const ClusterMarker = memo(function ClusterMarker({ count }: { count: number }) {
  return (
    <View style={{ padding: 10 }}>
      <View style={s.clusterGlow}>
        <LinearGradient colors={["#396A52", "#214F38"]} start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }} style={s.cluster}>
          <Text style={s.clusterText}>{count}</Text>
        </LinearGradient>
      </View>
    </View>
  );
});

export const LogoClusterMarker = memo(function LogoClusterMarker({
  logo, count, onReady,
}: { logo: { uri: string; fit: "contain" | "cover" }; count: number; onReady?: () => void }) {
  return (
    <View style={{ padding: 10 }}>
      <View style={[s.clusterGlow, s.logoCluster]}>
        <ExpoImage
          source={{ uri: logo.uri }}
          style={logo.fit === "contain" ? { width: 38, height: 38 } : StyleSheet.absoluteFill}
          contentFit={logo.fit}
          cachePolicy="memory-disk"
          onLoad={onReady}
          onError={onReady}
        />
      </View>
      <LinearGradient colors={["#D9A441", "#AD8030"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={s.badge}>
        <Text style={s.badgeText}>{count}</Text>
      </LinearGradient>
    </View>
  );
});

// ── Listans nummer ───────────────────────────────────────────────────────────

const PIN_PATH = "M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z";
/** Listans numrerade nålar: spetsen 92 % ner i ritytan */
export const NUMBER_ANCHOR = { x: 0.5, y: 0.919 };

export const NumberPin = memo(function NumberPin({ n, selected = false }: { n: number; selected?: boolean }) {
  const scale = selected ? 1.4 : 1;
  return (
    <View style={{ width: 28 * scale, height: 37 * scale }}>
      <Svg width={28 * scale} height={37 * scale} viewBox="-2 -2 28 37">
        <Path d={PIN_PATH} fill="#C5A059" stroke="#FFFFFF" strokeOpacity={0.92} strokeWidth={1.5} />
        <SvgText x={12} y={15.6} fontSize={n > 9 ? 9.5 : 11} fontWeight="700" fill="#121212" textAnchor="middle">
          {n}
        </SvgText>
      </Svg>
    </View>
  );
});

// ── Service ──────────────────────────────────────────────────────────────────

/** Servicepunkternas typer, i den ordning de visas i filtret */
export const SERVICE_TYPES: { type: string; label: string; Icon: LucideIcon }[] = [
  { type: "Toalett", label: "Toaletter", Icon: Toilet },
  { type: "Laddning", label: "Laddning", Icon: Plug },
  { type: "AutoMat", label: "AutoMat", Icon: Store },
  { type: "Vård", label: "Vård", Icon: HeartPulse },
];

export const serviceIcon = (type: string): LucideIcon => SERVICE_TYPES.find((t) => t.type === type)?.Icon ?? MapPin;

const s = StyleSheet.create({
  logo: {
    alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#FFFFFF",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  clusterGlow: {
    borderRadius: 24,
    shadowColor: "#C5A059", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 6,
  },
  cluster: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.4)",
  },
  clusterText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF" },
  logoCluster: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden",
    backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "rgba(197,160,89,0.55)",
  },
  badge: {
    position: "absolute", right: 6, bottom: 6, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 4,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#141414",
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#141414" },
});
