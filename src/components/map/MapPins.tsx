/**
 * Kartans nålar — klassiska droppformade nålar, i kategoriernas färger med en vit prick (skatter:
 * lila med stjärna, service: ljusa). Nålarna är färdiga bilder (assets/map-pins, ritade av ett
 * skript) som Google Kartor ritar själv — snabbast möjligt, inget ritas om när kartan rör sig.
 * Bara listans numrerade nålar (NumberPin) ritas i appen, de är få.
 */
import { memo } from "react";
import { View } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { HeartPulse, MapPin, Plug, Store, Toilet, type LucideIcon } from "lucide-react-native";
import type { CategoryId } from "@/theme/categories";

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
  "mat-dryck-selected": require("../../../assets/map-pins/pin-mat-dryck-selected.png"),
  "hotell-bb": require("../../../assets/map-pins/pin-hotell-bb.png"),
  "hotell-bb-selected": require("../../../assets/map-pins/pin-hotell-bb-selected.png"),
  "cafe-bageri": require("../../../assets/map-pins/pin-cafe-bageri.png"),
  "cafe-bageri-selected": require("../../../assets/map-pins/pin-cafe-bageri-selected.png"),
  "butiker": require("../../../assets/map-pins/pin-butiker.png"),
  "butiker-selected": require("../../../assets/map-pins/pin-butiker-selected.png"),
  "natur-upplevelser": require("../../../assets/map-pins/pin-natur-upplevelser.png"),
  "natur-upplevelser-selected": require("../../../assets/map-pins/pin-natur-upplevelser-selected.png"),
  "aktiviteter": require("../../../assets/map-pins/pin-aktiviteter.png"),
  "aktiviteter-selected": require("../../../assets/map-pins/pin-aktiviteter-selected.png"),
  "sevardheter": require("../../../assets/map-pins/pin-sevardheter.png"),
  "sevardheter-selected": require("../../../assets/map-pins/pin-sevardheter-selected.png"),
  "hantverk-service": require("../../../assets/map-pins/pin-hantverk-service.png"),
  "hantverk-service-selected": require("../../../assets/map-pins/pin-hantverk-service-selected.png"),
  "other": require("../../../assets/map-pins/pin-other.png"),
  "other-selected": require("../../../assets/map-pins/pin-other-selected.png"),
  "service": require("../../../assets/map-pins/pin-service.png"),
  "service-selected": require("../../../assets/map-pins/pin-service-selected.png"),
  "treasure": require("../../../assets/map-pins/pin-treasure.png"),
  "treasure-selected": require("../../../assets/map-pins/pin-treasure-selected.png"),
  "treasure-found": require("../../../assets/map-pins/pin-treasure-found.png"),
  "treasure-found-selected": require("../../../assets/map-pins/pin-treasure-found-selected.png"),
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */

type PinName = keyof typeof IMAGES;
const pick = (name: string, selected: boolean) => IMAGES[(selected ? `${name}-selected` : name) as PinName];

export const placePinImage = (category: CategoryId | undefined, selected: boolean) => pick(category ?? "other", selected);
export const treasurePinImage = (found: boolean, selected: boolean) => pick(found ? "treasure-found" : "treasure", selected);
export const servicePinImage = (selected: boolean) => pick("service", selected);

const PIN_PATH = "M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z";

/** En plats i en vald lista: guldnål med platsens nummer i listans ordning */
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

/** Servicepunkternas typer, i den ordning de visas i filtret */
export const SERVICE_TYPES: { type: string; label: string; Icon: LucideIcon }[] = [
  { type: "Toalett", label: "Toaletter", Icon: Toilet },
  { type: "Laddning", label: "Laddning", Icon: Plug },
  { type: "AutoMat", label: "AutoMat", Icon: Store },
  { type: "Vård", label: "Vård", Icon: HeartPulse },
];

export const serviceIcon = (type: string): LucideIcon => SERVICE_TYPES.find((t) => t.type === type)?.Icon ?? MapPin;
