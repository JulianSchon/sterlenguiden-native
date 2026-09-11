/**
 * Explore / Sök – native rebuild
 * Spec: native-search-spec.md
 *
 * Två tillstånd:
 *  - Browse:  chips + karusell + service-cirklar + kategori-grid
 *  - Search:  live-resultat (query) / senaste sökningar (tom)
 */
import React, {
  useState, useRef, useCallback, useMemo, useEffect,
} from "react";
import {
  View, Text, TextInput, FlatList, ScrollView,
  TouchableOpacity, Modal, Animated, StyleSheet,
  Dimensions, Platform, Linking, Pressable, Image,
  BackHandler, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import MapView, { Marker } from "react-native-maps";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect as SvgRect,
} from "react-native-svg";
// AsyncStorage kräver native rebuild – använder in-memory tills nästa EAS-build.
// Byt ut _store mot AsyncStorage-anrop när dev-clienten är ombyggd.
import {
  Search, X, MapPin, Store, Navigation, Locate,
  Toilet, Plug, Heart, Crown, Clock, Trash2,
} from "lucide-react-native";
import {
  usePlaces, isPlaceOpen, getTierScore, type Place,
} from "@/hooks/usePlaces";
import { registerScroll } from "@/lib/scrollRefs";
import { useBusinessStories } from "@/hooks/useBusinessStories";
import { useServicePoints, type ServicePoint } from "@/hooks/useServicePoints";
import { colors } from "@/lib/colors";

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BG        = "#121212";
const FG        = "#F5F2EA";
const CARD      = "#1A1A1A";
const SECONDARY = "#242424";
const MUTED     = "rgba(255,255,255,0.45)";
const WARM_MUTED = "#A09880"; // samma som colors.foregroundMuted / "JUST NU" på hem
const BORDER    = "rgba(255,255,255,0.10)";
const GOLD      = "#C5A059";

// ─── Hjälpfunktioner ───────────────────────────────────────────────────────────
function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function drivingKm(raw: number): number {
  return Math.round(raw * 1.3 + 1);
}

function formatKm(km: number): string {
  if (km < 10) return km % 1 === 0 ? `${km} km` : `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function matchesDbValues(categories: string | null, dbValues: string[]): boolean {
  if (!categories) return false;
  const parts = categories.split(",").map((s) => s.trim().toLowerCase());
  return dbValues.some((target) =>
    parts.some(
      (p) =>
        p === target.toLowerCase() ||
        p.includes(target.toLowerCase()) ||
        target.toLowerCase().includes(p),
    ),
  );
}

function openNavigation(lat: number, lng: number) {
  const url =
    Platform.OS === "ios"
      ? `maps://?daddr=${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    );
  });
}

// ─── Kategori-chip-definitioner ─────────────────────────────────────────────────
interface ChipDef {
  id: string;
  label: string;
  dbValues: string[];
}

const CHIPS: ChipDef[] = [
  { id: "mat-dryck",         label: "Mat & Dryck",         dbValues: ["Mat", "Mat & Dryck"] },
  { id: "hotell-bb",         label: "Hotell & B&B",        dbValues: ["Hotell & B&B", "Boende"] },
  { id: "cafe-bageri",       label: "Café & Bageri",        dbValues: ["Café & Bageri", "Cafe & Bageri"] },
  { id: "butiker",           label: "Butiker",              dbValues: ["Butiker"] },
  { id: "natur-upplevelser", label: "Natur & Upplevelser",  dbValues: ["Natur", "Natur & Upplevelser"] },
  { id: "aktiviteter",       label: "Aktiviteter",          dbValues: ["Aktiviteter"] },
  { id: "sevardheter",       label: "Sevärdheter",          dbValues: ["Sevärdheter", "Konst"] },
  { id: "hantverk-service",  label: "Design & Hantverk",    dbValues: ["Hantverk & Service", "Hantverk"] },
];

// ─── Kategori-grid ─────────────────────────────────────────────────────────────
const GRID: Array<ChipDef & { colors: [string, string] }> = [
  { id: "mat-dryck",         label: "Mat & Dryck",         dbValues: ["Mat", "Mat & Dryck"],             colors: ["#3D1F0D", "#1A0A04"] },
  { id: "hotell-bb",         label: "Hotell & B&B",        dbValues: ["Hotell & B&B", "Boende"],         colors: ["#0D1A2B", "#040A14"] },
  { id: "cafe-bageri",       label: "Café & Bageri",        dbValues: ["Café & Bageri", "Cafe & Bageri"], colors: ["#2B1A0D", "#140A04"] },
  { id: "butiker",           label: "Butiker",              dbValues: ["Butiker"],                        colors: ["#0D2B1A", "#04140A"] },
  { id: "natur-upplevelser", label: "Natur & Upplevelser",  dbValues: ["Natur", "Natur & Upplevelser"],   colors: ["#0D2B14", "#041408"] },
  { id: "aktiviteter",       label: "Aktiviteter",          dbValues: ["Aktiviteter"],                    colors: ["#2B0D1A", "#14040A"] },
  { id: "sevardheter",       label: "Sevärdheter",          dbValues: ["Sevärdheter", "Konst"],           colors: ["#0D142B", "#040814"] },
  { id: "hantverk-service",  label: "Design & Hantverk",    dbValues: ["Hantverk & Service", "Hantverk"], colors: ["#2B2B0D", "#141404"] },
];

// ─── Service-cirklar ───────────────────────────────────────────────────────────
interface ServiceDef {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  type: string;
  description: string;
}

const SERVICES: ServiceDef[] = [
  {
    id: "automat", label: "AutoMat", Icon: Store, type: "AutoMat",
    description: "Små livsmedelsbutiker med öppet från tidigt på morgonen till kl 23 varje dag.",
  },
  {
    id: "toalett", label: "Toalett", Icon: Toilet, type: "Toalett",
    description: "Offentliga toaletter tillgängliga för besökare i området.",
  },
  {
    id: "laddning", label: "Laddning", Icon: Plug, type: "Laddning",
    description: "Ladda din elbil vid laddstationer runt om på Österlen.",
  },
  {
    id: "vard", label: "Vård", Icon: Heart, type: "Vård",
    description: "Apotek, vårdcentraler och annan hälsovård på Österlen.",
  },
];

// ─── Sökhistorik (in-memory) ───────────────────────────────────────────────────
// TODO: byt till AsyncStorage efter nästa EAS-rebuild
const MAX_HISTORY = 15;
let _historyStore: HistoryItem[] = [];

interface HistoryItem {
  id: number;
  name: string;
  category: string | null;
  image_url: string | null;
  timestamp: number;
}

async function loadHistory(): Promise<HistoryItem[]> {
  return _historyStore;
}

async function saveHistory(items: HistoryItem[]): Promise<void> {
  _historyStore = items;
}

async function addToHistory(place: Place): Promise<HistoryItem[]> {
  const existing = await loadHistory();
  const filtered = existing.filter((h) => h.id !== place.id);
  const newItem: HistoryItem = {
    id: place.id,
    name: place.name,
    category: place.category ?? null,
    image_url: place.image_url?.split(",")[0].trim() ?? null,
    timestamp: Date.now(),
  };
  const updated = [newItem, ...filtered].slice(0, MAX_HISTORY);
  await saveHistory(updated);
  return updated;
}

// ─── ServiceSheet – bottom sheet per service-typ ───────────────────────────────
interface ServiceSheetProps {
  visible: boolean;
  service: ServiceDef | null;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
}

function ServiceSheet({ visible, service, userLocation, onClose }: ServiceSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SH)).current;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const mapRef = useRef<MapView>(null);

  const { data: points = [] } = useServicePoints(service?.type ?? "");

  // Filtrera bort punkter utan koordinater
  const validPoints = useMemo(
    () => points.filter((p) => p.lat !== null && p.lng !== null),
    [points],
  );

  // Sortera efter avstånd och ta 4 närmaste
  const sorted = useMemo(() => {
    if (!userLocation) return validPoints.slice(0, 4);
    return [...validPoints]
      .map((p) => ({
        ...p,
        dist: haversineKm(userLocation.lat, userLocation.lng, p.lat!, p.lng!),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 4);
  }, [validPoints, userLocation]);

  const nearest = sorted[0] ?? null;

  // Animera in/ut
  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 30,
        stiffness: 300,
        mass: 0.8,
      }).start();
    } else {
      Animated.spring(translateY, {
        toValue: SH,
        useNativeDriver: true,
        damping: 30,
        stiffness: 300,
        mass: 0.8,
      }).start();
    }
  }, [visible]);

  // Rensa vald marker när sheet stängs
  useEffect(() => {
    if (!visible) setSelectedId(null);
  }, [visible]);

  const handleSelectPoint = useCallback(
    (p: ServicePoint & { dist?: number }) => {
      setSelectedId(p.id);
      if (p.lat && p.lng && mapRef.current) {
        mapRef.current.animateToRegion(
          { latitude: p.lat, longitude: p.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          600,
        );
      }
    },
    [],
  );

  const handleDeselect = useCallback(() => {
    setSelectedId(null);
    if (mapRef.current && validPoints.length > 0) {
      mapRef.current.fitToCoordinates(
        validPoints.map((p) => ({ latitude: p.lat!, longitude: p.lng! })),
        { edgePadding: { top: 40, left: 40, right: 40, bottom: 40 }, animated: true },
      );
    }
  }, [validPoints]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  }, [onClose]);

  const mapInitialRegion = useMemo(() => {
    if (userLocation) {
      return {
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      };
    }
    return { latitude: 55.5, longitude: 14.1, latitudeDelta: 0.8, longitudeDelta: 0.8 };
  }, [userLocation]);

  if (!service) return null;

  const ServiceIcon = service.Icon;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <Pressable style={ss.backdrop} onPress={handleClose} />

      {/* Sheet */}
      <Animated.View
        style={[ss.sheet, { height: SH * 0.93, paddingBottom: insets.bottom + 80, transform: [{ translateY }] }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={ss.sheetHeader}>
            <ServiceIcon size={24} color={GOLD} strokeWidth={2} />
            <Text style={ss.sheetTitle}>{service.label}</Text>
          </View>
          <Text style={ss.sheetDesc}>{service.description}</Text>

          {/* Karta */}
          {validPoints.length > 0 && (
            <Pressable onPress={handleDeselect}>
              <MapView
                ref={mapRef}
                style={ss.map}
                initialRegion={mapInitialRegion}
                showsUserLocation
                showsMyLocationButton={false}
                mapType="standard"
                onMapReady={() => {
                  if (validPoints.length > 1 && mapRef.current) {
                    mapRef.current.fitToCoordinates(
                      validPoints.map((p) => ({ latitude: p.lat!, longitude: p.lng! })),
                      { edgePadding: { top: 40, left: 40, right: 40, bottom: 40 }, animated: false },
                    );
                  }
                }}
              >
                {validPoints.map((p) => (
                  <Marker
                    key={p.id}
                    coordinate={{ latitude: p.lat!, longitude: p.lng! }}
                    pinColor={selectedId === p.id ? "#C5A059" : "hsl(150,30%,30%)"}
                    onPress={() => handleSelectPoint(p as any)}
                  />
                ))}
              </MapView>
            </Pressable>
          )}

          {/* Lista: 4 närmaste */}
          <View style={ss.listContainer}>
            {sorted.length === 0 ? (
              <Text style={ss.emptyText}>
                Inga {service.label.toLowerCase()} hittades i närheten
              </Text>
            ) : (
              sorted.map((p, idx) => {
                const dist = (p as any).dist as number | undefined;
                const descClean = service.type === "Laddning"
                  ? (p.description ?? "").replace(/,/g, "")
                  : p.description;

                return (
                  <React.Fragment key={p.id}>
                    {idx > 0 && <View style={ss.divider} />}
                    <Pressable
                      style={[ss.listRow, selectedId === p.id && ss.listRowSelected]}
                      onPress={() => handleSelectPoint(p as any)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={ss.listName} numberOfLines={1}>{p.name}</Text>
                        {!!descClean && (
                          <Text style={ss.listDesc} numberOfLines={1}>{descClean}</Text>
                        )}
                      </View>
                      <View style={ss.listRight}>
                        {dist !== undefined && (
                          <Text style={ss.listDist}>{formatKm(drivingKm(dist))}</Text>
                        )}
                        {p.lat && p.lng && (
                          <TouchableOpacity
                            style={ss.navBtn}
                            onPress={() => openNavigation(p.lat!, p.lng!)}
                          >
                            <Navigation size={18} color={GOLD} strokeWidth={2} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </Pressable>
                  </React.Fragment>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Sticky bottom-bar */}
        <View style={[ss.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          {nearest?.lat && nearest?.lng ? (
            <TouchableOpacity
              style={ss.navPill}
              activeOpacity={0.85}
              onPress={() => openNavigation(nearest.lat!, nearest.lng!)}
            >
              <Navigation size={18} color={BG} strokeWidth={2.5} />
              <Text style={ss.navPillText}>Navigera till närmaste</Text>
            </TouchableOpacity>
          ) : <View style={{ flex: 1 }} />}

          <TouchableOpacity style={ss.closeBtn} onPress={handleClose}>
            <X size={20} color={FG} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    color: FG,
  },
  sheetDesc: {
    fontSize: 14,
    color: MUTED,
    paddingHorizontal: 20,
    marginBottom: 16,
    lineHeight: 20,
  },
  map: {
    marginHorizontal: 16,
    marginBottom: 16,
    aspectRatio: 3 / 2,
    borderRadius: 16,
    overflow: "hidden",
  },
  listContainer: {
    marginHorizontal: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    marginBottom: 24,
    overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 8,
  },
  listRowSelected: { backgroundColor: "rgba(197,160,89,0.08)" },
  listName: { fontSize: 15, fontWeight: "500", color: FG },
  listDesc: { fontSize: 12, color: MUTED, marginTop: 2 },
  listRight: { alignItems: "flex-end", gap: 6 },
  listDist: { fontSize: 14, color: MUTED },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(197,160,89,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { color: MUTED, fontSize: 14, padding: 20, textAlign: "center" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: BG,
  },
  navPill: {
    flex: 1,
    height: 56,
    backgroundColor: GOLD,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  navPillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: BG,
    fontWeight: "600",
  },
  closeBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── ExploreScreen (huvud) ─────────────────────────────────────────────────────
export default function ExploreScreen() {
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const inputRef    = useRef<TextInput>(null);
  const carouselRef = useRef<ScrollView>(null);

  const [query,       setQuery]       = useState("");
  const [searching,   setSearching]   = useState(false);
  const [activeChip,  setActiveChip]  = useState<string>("mat-dryck");
  const [history,     setHistory]     = useState<HistoryItem[]>([]);
  const [activeSheet, setActiveSheet] = useState<ServiceDef | null>(null);
  const [userLoc,     setUserLoc]     = useState<{ lat: number; lng: number } | null>(null);
  const browseScrollRef = useRef<ScrollView>(null);
  useEffect(() => { registerScroll("search", browseScrollRef); }, []);

  // Sökdebounce
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Data
  const { data: allPlaces = [] } = usePlaces();
  const { data: stories = [] }   = useBusinessStories();

  // Premium-set (krona-badge)
  const premiumIds = useMemo(() => {
    const now = new Date().toISOString();
    return new Set(
      stories
        .filter((s) => s.is_premium && (!s.expires_at || s.expires_at >= now))
        .map((s) => s.place_id),
    );
  }, [stories]);

  // Användarlokalisering
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== "granted") return;
      Location.getCurrentPositionAsync({}).then(({ coords }) => {
        setUserLoc({ lat: coords.latitude, lng: coords.longitude });
      });
    });
  }, []);

  // Historik vid mount
  useEffect(() => { loadHistory().then(setHistory); }, []);

  // Android back handler – stänger sök-läge
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (searching) {
        exitSearch();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [searching]);

  // Karusell-reset när chip byter
  const prevChip = useRef(activeChip);
  useEffect(() => {
    if (prevChip.current !== activeChip) {
      carouselRef.current?.scrollTo({ x: 0, animated: false });
      prevChip.current = activeChip;
    }
  }, [activeChip]);

  // ── Sök-läge ────────────────────────────────────────────────────────────────
  const enterSearch = useCallback(() => {
    setSearching(true);
    loadHistory().then(setHistory);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const exitSearch = useCallback(() => {
    setSearching(false);
    setQuery("");
    inputRef.current?.blur();
  }, []);

  const handleClear = useCallback(() => {
    if (query.length > 0) {
      setQuery("");
    } else {
      exitSearch();
    }
  }, [query, exitSearch]);

  const handleSelectPlace = useCallback(
    async (place: Place) => {
      inputRef.current?.blur();
      const updated = await addToHistory(place);
      setHistory(updated);
      router.push(`/place/${place.id}` as any);
    },
    [router],
  );

  const handleHistoryTap = useCallback(
    async (item: HistoryItem) => {
      // Flytta till toppen och navigera
      const all = await loadHistory();
      const filtered = all.filter((h) => h.id !== item.id);
      const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
      await saveHistory(updated);
      setHistory(updated);
      router.push(`/place/${item.id}` as any);
    },
    [router],
  );

  const clearHistory = useCallback(async () => {
    _historyStore = [];
    setHistory([]);
  }, []);

  // ── Karusell-platser ─────────────────────────────────────────────────────────
  const chip = CHIPS.find((c) => c.id === activeChip);
  const carouselPlaces = useMemo(() => {
    if (!chip) return [];
    const filtered = allPlaces.filter((p) =>
      matchesDbValues(p.category, chip.dbValues),
    );
    return filtered
      .map((p) => ({
        ...p,
        _dist: userLoc && p.lat && p.lng
          ? haversineKm(userLoc.lat, userLoc.lng, p.lat, p.lng)
          : null,
      }))
      .sort((a, b) => {
        // 1. avstånd asc
        if (a._dist !== null && b._dist !== null) {
          if (a._dist !== b._dist) return a._dist - b._dist;
        } else if (a._dist !== null) return -1;
        else if (b._dist !== null) return 1;
        // 2. tier desc
        const td = getTierScore(b.business_tier) - getTierScore(a.business_tier);
        if (td !== 0) return td;
        // 3. namn
        return a.name.localeCompare(b.name, "sv");
      })
      .slice(0, 10);
  }, [chip, allPlaces, userLoc]);

  // ── Kategori-grid räkningar ──────────────────────────────────────────────────
  const gridCounts = useMemo(() => {
    const map: Record<string, number> = {};
    GRID.forEach((cat) => {
      map[cat.id] = allPlaces.filter((p) =>
        matchesDbValues(p.category, cat.dbValues),
      ).length;
    });
    return map;
  }, [allPlaces]);

  // ── Sökresultat-rankning (klient-side på allPlaces) ─────────────────────────
  const rankedResults = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    const filtered = allPlaces.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        (p.short_description ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.categories ?? "").toLowerCase().includes(q) ||
        (p.nearest_town ?? "").toLowerCase().includes(q)
      );
    });
    return filtered.sort((a, b) => {
      // 1. tier desc
      const td = getTierScore(b.business_tier) - getTierScore(a.business_tier);
      if (td !== 0) return td;
      // 2. namn-match prioriteras
      const an = a.name.toLowerCase().includes(q);
      const bn = b.name.toLowerCase().includes(q);
      if (an !== bn) return an ? -1 : 1;
      // 3. avstånd
      if (userLoc && a.lat && a.lng && b.lat && b.lng) {
        const da = (a.lat - userLoc.lat) ** 2 + (a.lng - userLoc.lng) ** 2;
        const db = (b.lat - userLoc.lat) ** 2 + (b.lng - userLoc.lng) ** 2;
        return da - db;
      }
      return 0;
    });
  }, [allPlaces, debouncedQuery, userLoc]);

  // ── Service-cirklar ──────────────────────────────────────────────────────────
  const handleServicePress = useCallback((svc: ServiceDef) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveSheet(svc);
  }, []);

  // ─── Render: karusell-kort ─────────────────────────────────────────────────
  const CARD_W = Math.min(SW * 0.64, 258);

  const renderCarouselCard = useCallback(
    (place: Place & { _dist: number | null }) => {
      const img = place.image_url?.split(",")[0].trim();
      const open = isPlaceOpen(place.opening_hours as any);
      const hasPremium = premiumIds.has(place.id);
      const distKm = place._dist !== null ? drivingKm(place._dist) : null;

      return (
        <TouchableOpacity
          key={place.id}
          style={[s.carouselCard, { width: CARD_W }]}
          activeOpacity={0.88}
          onPress={() => router.push(`/place/${place.id}` as any)}
        >
          {/* Bild */}
          <View style={s.carouselImgWrap}>
            {img ? (
              <Image source={{ uri: img }} style={s.carouselImg} />
            ) : (
              <View style={[s.carouselImg, { backgroundColor: SECONDARY }]} />
            )}

            {/* Pris-badge */}
            {place.price_level ? (
              <View style={s.priceBadge}>
                <Text style={s.priceBadgeText}>
                  {"$".repeat(place.price_level)}
                </Text>
              </View>
            ) : null}

            {/* Krona-badge */}
            {hasPremium && (
              <View style={s.crownBadge}>
                <Crown size={12} color={BG} strokeWidth={2.2} />
              </View>
            )}

            {/* Gradient-overlay + text (SVG – ingen native rebuild) */}
            <View style={s.carouselGradient} pointerEvents="none">
              <Svg
                width="100%"
                height="100%"
                style={StyleSheet.absoluteFill}
                preserveAspectRatio="none"
              >
                <Defs>
                  <SvgLinearGradient id={`cg${place.id}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%"   stopColor="#000" stopOpacity={0}    />
                    <Stop offset="50%"  stopColor="#000" stopOpacity={0.5}  />
                    <Stop offset="100%" stopColor="#000" stopOpacity={0.82} />
                  </SvgLinearGradient>
                </Defs>
                <SvgRect width="100%" height="100%" fill={`url(#cg${place.id})`} />
              </Svg>
            </View>
            <View style={s.carouselTextWrap} pointerEvents="none">
              <Text style={s.carouselName} numberOfLines={2}>{place.name}</Text>
              {distKm !== null && (
                <View style={s.distRow}>
                  <MapPin size={12} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                  <Text style={s.distText}>{distKm} km</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [premiumIds, router, CARD_W],
  );

  // ─── Render: sökresultat-rad ───────────────────────────────────────────────
  const renderSearchRow = useCallback(
    ({ item }: { item: Place }) => {
      const logo = item.logo_url?.trim();
      const img  = item.image_url?.split(",")[0].trim();
      const thumb = logo || img;
      const open = isPlaceOpen(item.opening_hours as any);
      const hasPremium = premiumIds.has(item.id);

      return (
        <Pressable
          style={({ pressed }) => [s.searchRow, pressed && s.searchRowPressed]}
          onPress={() => handleSelectPlace(item)}
        >
          {/* Thumbnail – logo om det finns, annars hero-bild */}
          <View style={[s.searchThumb, logo ? s.searchThumbLogo : null]}>
            {thumb ? (
              <Image
                source={{ uri: thumb }}
                style={StyleSheet.absoluteFill}
                resizeMode={logo ? "contain" : "cover"}
              />
            ) : null}
            {hasPremium && (
              <View style={s.crownSmall}>
                <Crown size={10} color={BG} strokeWidth={2.2} />
              </View>
            )}
          </View>

          {/* Text */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={s.searchName} numberOfLines={1}>{item.name}</Text>
              {item.opening_hours && open && (
                <View style={s.openBadge}>
                  <Text style={s.openBadgeText}>Öppet</Text>
                </View>
              )}
            </View>
            <Text style={s.searchCategory} numberOfLines={1}>
              {item.category ?? ""}
            </Text>
          </View>
        </Pressable>
      );
    },
    [premiumIds, handleSelectPlace],
  );

  // ─── Render: historik-rad ──────────────────────────────────────────────────
  const renderHistoryRow = useCallback(
    ({ item, index }: { item: HistoryItem; index: number }) => (
      <React.Fragment key={item.id}>
        {index > 0 && <View style={s.histDivider} />}
        <Pressable
          style={s.histRow}
          onPress={() => handleHistoryTap(item)}
        >
          <View style={s.histThumb}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} />
            ) : (
              <Clock size={20} color={MUTED} strokeWidth={1.8} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.histName} numberOfLines={1}>{item.name}</Text>
            {item.category && (
              <Text style={s.histCategory} numberOfLines={1}>{item.category}</Text>
            )}
          </View>
        </Pressable>
      </React.Fragment>
    ),
    [handleHistoryTap],
  );

  // ─── JSX ──────────────────────────────────────────────────────────────────
  const headerTop = Math.max(insets.top, 44);

  return (
    <View style={s.container}>

      {/* ── Sticky header ── */}
      <View style={[s.header, { paddingTop: headerTop }]}>
        {/* Titel – döljs i sök-läge */}
        {!searching && (
          <View style={s.titleWrap}>
            <Text style={s.title}>Sök</Text>
          </View>
        )}

        {/* Sökfält */}
        <View style={[s.searchBarWrap, searching && { paddingTop: 8 }]}>
          <View style={s.searchBar}>
            <View style={s.searchIconWrap}>
              <Search size={20} color={WARM_MUTED} strokeWidth={2} />
            </View>
            <TextInput
              ref={inputRef}
              style={s.searchInput}
              placeholder="Sök platser, restauranger..."
              placeholderTextColor={WARM_MUTED}
              value={query}
              onChangeText={setQuery}
              onFocus={enterSearch}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              fontSize={16}
            />
            {searching && (
              <TouchableOpacity style={s.xBtn} onPress={handleClear}>
                <X size={20} color={MUTED} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* ── SÖKLÄGE ── */}
      {searching ? (
        <FlatList
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
          data={debouncedQuery.trim().length > 0 ? rankedResults : history}
          keyExtractor={(item) => String(item.id)}
          renderItem={
            debouncedQuery.trim().length > 0
              ? renderSearchRow
              : renderHistoryRow as any
          }
          ListHeaderComponent={
            debouncedQuery.trim().length > 0 ? (
              <View style={s.resultsHeader}>
                <Text style={s.resultsTitle}>Sökresultat</Text>
                <Text style={s.resultsCount}>
                  {rankedResults.length}{" "}
                  {rankedResults.length === 1 ? "plats" : "platser"}
                </Text>
              </View>
            ) : history.length > 0 ? (
              <View style={s.recentHeader}>
                <Text style={s.recentTitle}>Senaste sökningar</Text>
                <TouchableOpacity style={s.clearHistBtn} onPress={clearHistory}>
                  <Trash2 size={14} color={MUTED} strokeWidth={2} />
                  <Text style={s.clearHistText}>Rensa</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            debouncedQuery.trim().length > 0 ? (
              <Text style={s.emptyText}>Inga platser hittades</Text>
            ) : (
              <View style={s.emptyHistory}>
                <Search size={32} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
                <Text style={s.emptyHistoryText}>Sök efter platser i Österlen</Text>
              </View>
            )
          }
        />
      ) : (
        // ── BROWSE-LÄGE ──
        <ScrollView
          ref={browseScrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        >
          {/* Kategori-chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipsContent}
            style={s.chipsScroll}
          >
            {CHIPS.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                style={[s.chip, activeChip === chip.id && s.chipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setActiveChip(chip.id);
                }}
              >
                <Text style={[s.chipText, activeChip === chip.id && s.chipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Plats-karusell */}
          <ScrollView
            ref={carouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.carouselContent}
            style={s.carouselScroll}
          >
            {carouselPlaces.length === 0 ? (
              <Text style={[s.emptyText, { paddingVertical: 32 }]}>
                Inga platser i denna kategori
              </Text>
            ) : (
              carouselPlaces.map((p) => renderCarouselCard(p))
            )}
          </ScrollView>

          {/* Service-cirklar */}
          <View style={s.servicesRow}>
            {SERVICES.map((svc) => {
              const Icon = svc.Icon;
              return (
                <TouchableOpacity
                  key={svc.id}
                  style={s.serviceItem}
                  activeOpacity={0.75}
                  onPress={() => handleServicePress(svc)}
                >
                  <View style={s.serviceCircle}>
                    <Icon size={24} color={WARM_MUTED} strokeWidth={2} />
                  </View>
                  <Text style={s.serviceLabel}>{svc.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Kategori-grid */}
          <View style={s.gridSection}>
            <Text style={s.gridHeading}>KATEGORIER</Text>
            <View style={s.grid}>
              {GRID.map((cat, idx) => {
                const count = gridCounts[cat.id] ?? 0;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={s.gridTile}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/category/${cat.id}` as any)}
                  >
                    <Svg
                      width="100%"
                      height="100%"
                      style={StyleSheet.absoluteFill}
                      preserveAspectRatio="none"
                    >
                      <Defs>
                        <SvgLinearGradient id={`tile${cat.id}`} x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0%"   stopColor={cat.colors[0]} stopOpacity={1} />
                          <Stop offset="100%" stopColor={cat.colors[1]} stopOpacity={1} />
                        </SvgLinearGradient>
                      </Defs>
                      <SvgRect width="100%" height="100%" fill={`url(#tile${cat.id})`} />
                    </Svg>
                    {/* Svagt svart skärm ovanpå */}
                    <View style={s.gridScrim} />
                    <Text style={s.gridTileText}>{cat.label}</Text>
                    {count > 0 && (
                      <View style={s.countPill}>
                        <Text style={s.countPillText}>
                          {count} {count === 1 ? "plats" : "platser"}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Service bottom sheet ── */}
      <ServiceSheet
        visible={activeSheet !== null}
        service={activeSheet}
        userLocation={userLoc}
        onClose={() => setActiveSheet(null)}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const CAROUSEL_W = Math.min(SW * 0.64, 258);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header
  header: { backgroundColor: BG, zIndex: 30 },
  titleWrap: { paddingHorizontal: 20, paddingBottom: 4 },
  title: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 32,
    lineHeight: 36,
    color: FG,
  },
  searchBarWrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  searchIconWrap: { width: 48, alignItems: "center", justifyContent: "center" },
  searchInput: {
    flex: 1,
    color: FG,
    paddingVertical: 8,
    paddingRight: 12,
  },
  xBtn: { paddingHorizontal: 16, paddingVertical: 8 },

  // Chips
  chipsScroll: { paddingTop: 12, marginBottom: 20 },
  chipsContent: {
    paddingHorizontal: 12,
    gap: 6,
    flexDirection: "row",
    paddingBottom: 8,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 9999,
    backgroundColor: SECONDARY,
  },
  chipActive: { backgroundColor: FG },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13.5,
    color: FG,
  },
  chipTextActive: { color: BG },

  // Karusell
  carouselScroll: { marginBottom: 32 },
  carouselContent: { paddingHorizontal: 12, gap: 12, paddingRight: 12 },
  carouselCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  carouselImgWrap: { aspectRatio: 4 / 3 },
  carouselImg: { width: "100%", height: "100%" },
  carouselGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 96,
  },
  carouselTextWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  carouselName: {
    fontFamily: "PlayfairDisplay_500Medium",
    fontSize: 16,
    color: "rgba(255,255,255,0.9)",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  distRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  distText: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  priceBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priceBadgeText: { fontSize: 11, fontWeight: "600", color: "#fff" },
  crownBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(197,160,89,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Service-cirklar
  servicesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 32,
  },
  serviceItem: { alignItems: "center", gap: 6, flex: 1 },
  serviceCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: WARM_MUTED,
    textAlign: "center",
    maxWidth: 64,
    lineHeight: 14,
  },

  // Kategori-grid
  gridSection: { paddingHorizontal: 12, marginBottom: 0 },
  gridHeading: {
    fontSize: 12,
    fontWeight: "600",
    color: WARM_MUTED,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 16,
    fontFamily: "Inter_500Medium",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridTile: {
    width: (SW - 12 * 2 - 12) / 2,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  gridScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.30)",
  },
  gridTileText: {
    fontFamily: "PlayfairDisplay_500Medium",
    fontSize: 16,
    color: "rgba(255,255,255,0.90)",
    textAlign: "center",
    paddingHorizontal: 8,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  countPill: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countPillText: { fontSize: 10.5, fontWeight: "500", color: "rgba(255,255,255,0.9)" },

  // Sök-resultat
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  resultsTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 18,
    color: FG,
  },
  resultsCount: { fontSize: 14, color: MUTED },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 16,
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 4,
  },
  searchRowPressed: { backgroundColor: SECONDARY },
  searchThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: CARD,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  searchThumbLogo: {
    backgroundColor: "#fff",
    padding: 6,
  },
  crownSmall: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(197,160,89,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchName: { fontSize: 15, fontWeight: "600", color: FG },
  searchCategory: { fontSize: 13, color: MUTED, marginTop: 4 },
  openBadge: {
    backgroundColor: "hsl(150,30%,30%)",
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  openBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.92)" },

  // Historik
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  recentTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 18,
    color: FG,
  },
  clearHistBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearHistText: { fontSize: 12, color: MUTED },
  histDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.04)", marginHorizontal: 12 },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  histThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: CARD,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  histName: { fontSize: 15, fontWeight: "600", color: FG },
  histCategory: { fontSize: 13, color: MUTED, marginTop: 4 },

  // Tom
  emptyText: { color: MUTED, fontSize: 14, textAlign: "center", paddingHorizontal: 24 },
  emptyHistory: {
    alignItems: "center",
    paddingVertical: 64,
  },
  emptyHistoryText: { fontSize: 14, color: MUTED, marginTop: 12 },
});
