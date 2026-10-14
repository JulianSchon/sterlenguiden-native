/**
 * Kartans nålar. Kartan är svartvit, så nålarna är det enda som har färg — runda medaljonger i
 * kategoriernas djupa färger med en tunn guldkant, som små ädelstenar:
 *
 * - PlacePin:   en plats (ikon i kategorins färg). Bock om man varit där, hjärta om den är sparad.
 * - LogoPin:    platsens logga i en ring i kategorins färg — när man valt en enda kategori
 * - ClusterPin: flera platser nära varandra när man zoomat ut (antalet i guld)
 * - NumberPin:  en plats i en lista, med dess nummer i listans ordning
 * - ServicePin: toalett, laddning, AutoMat, vård — neutrala, så de inte tävlar med platserna
 */
import { memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Check, Heart, MapPin, Plug, Store, Toilet, HeartPulse, type LucideIcon } from "lucide-react-native";
import type { CategoryDef } from "@/theme/categories";

const GOLD_RIM = "#E2C47F";
const GOLD = "#C5A059";
const RED = "#EF4444";

/** Ljusare/mörkare variant av en färg (t = -1…1), för medaljongens glans */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t);
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Medaljongens två färger: ljusare uppe till vänster, djupare nere till höger */
const jewel = (color: string): [string, string] => [shade(color, 0.22), shade(color, -0.35)];

export const PlacePin = memo(function PlacePin({
  category, selected = false, visited = false, saved = false,
}: { category: CategoryDef | undefined; selected?: boolean; visited?: boolean; saved?: boolean }) {
  const size = selected ? 42 : 30;
  const Icon = category?.icon ?? MapPin;
  const color = category?.screen ?? "#6B7280";
  return (
    <View style={{ padding: 4 }}>
      <View style={[s.shadow, { width: size, height: size, borderRadius: size / 2 }, selected && s.selectedGlow]}>
        <LinearGradient
          colors={jewel(color)}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[s.medal, { width: size, height: size, borderRadius: size / 2, borderWidth: selected ? 2 : 1.5 }]}
        >
          <Icon size={selected ? 19 : 14} color="#FFFFFF" strokeWidth={2.2} />
        </LinearGradient>
      </View>
      {saved && (
        <View style={[s.badge, s.badgeTop]}>
          <Heart size={8} color={RED} fill={RED} strokeWidth={2} />
        </View>
      )}
      {visited && (
        <View style={[s.badge, s.badgeBottom, { backgroundColor: GOLD }]}>
          <Check size={8} color="#121212" strokeWidth={3.4} />
        </View>
      )}
    </View>
  );
});

export const LogoPin = memo(function LogoPin({
  uri, category, selected = false, onReady,
}: { uri: string; category: CategoryDef | undefined; selected?: boolean; onReady?: () => void }) {
  const size = selected ? 54 : 42;
  const ring = category?.screen ?? GOLD;
  return (
    <View style={{ padding: 4 }}>
      <View style={[s.shadow, s.logoOuter, { width: size, height: size, borderRadius: size / 2 }, selected && s.selectedGlow]}>
        <View style={[s.logoRing, { borderColor: ring, borderRadius: size / 2 }]}>
          <Image
            source={{ uri }}
            style={{ width: size - 7, height: size - 7, borderRadius: (size - 7) / 2, backgroundColor: "#FFFFFF" }}
            resizeMode="cover"
            onLoad={onReady}
            onError={onReady}
          />
        </View>
      </View>
    </View>
  );
});

export const ClusterPin = memo(function ClusterPin({ count, dark }: { count: number; dark: boolean }) {
  const size = Math.round(36 + Math.min(18, Math.log2(count) * 4));
  return (
    <View style={[s.clusterHalo, { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2 }]}>
      <View style={[s.shadow, s.cluster, { width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? "#141414" : "#FFFFFF" }]}>
        <Text style={[s.clusterText, { color: dark ? "#E8C674" : "#8A6A2E" }]}>{count}</Text>
      </View>
    </View>
  );
});

export const NumberPin = memo(function NumberPin({ n, selected = false }: { n: number; selected?: boolean }) {
  const size = selected ? 42 : 32;
  return (
    <View style={{ padding: 4 }}>
      <LinearGradient
        colors={["#F0D48E", "#B8913F"]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[s.shadow, s.number, { width: size, height: size, borderRadius: size / 2 }, selected && s.selectedGlow]}
      >
        <Text style={[s.numberText, selected && { fontSize: 17 }]}>{n}</Text>
      </LinearGradient>
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

export const ServicePin = memo(function ServicePin({ type, dark, selected = false }: { type: string; dark: boolean; selected?: boolean }) {
  const Icon = SERVICE_TYPES.find((t) => t.type === type)?.Icon ?? MapPin;
  const size = selected ? 36 : 26;
  return (
    <View style={{ padding: 3 }}>
      <View
        style={[
          s.shadow, s.service,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? "#F5F1E8" : "#2A2A2A" },
          selected && { borderColor: GOLD_RIM, borderWidth: 2 },
        ]}
      >
        <Icon size={selected ? 17 : 13} color={dark ? "#1A1A1A" : "#F5F1E8"} strokeWidth={2.2} />
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  shadow: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.45, shadowRadius: 4, elevation: 4,
  },
  // Vald: en mjuk guldglöd runt medaljongen
  selectedGlow: { shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  medal: { alignItems: "center", justifyContent: "center", borderColor: GOLD_RIM },
  badge: {
    position: "absolute", width: 15, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: "#121212", borderWidth: 1, borderColor: GOLD_RIM,
  },
  badgeTop: { top: 0, right: 0 },
  badgeBottom: { bottom: 0, right: 0 },
  logoOuter: { borderWidth: 1, borderColor: GOLD_RIM, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  logoRing: { flex: 1, alignSelf: "stretch", borderWidth: 2.5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  clusterHalo: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(197,160,89,0.22)" },
  cluster: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: GOLD_RIM },
  clusterText: { fontFamily: "Montserrat_700Bold", fontSize: 14 },
  number: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  numberText: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: "#121212" },
  service: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.25)" },
});
