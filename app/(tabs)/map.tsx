/**
 * Kartan – fullscreen map med mörkt glass-UI ovanpå.
 * Spec: native-map-spec.md
 *
 * Kartan är ljus (mutedStandard), allt UI ovanpå är mörkt glas.
 * Gradienter via SVG (expo-linear-gradient ej tillgänglig i dev-client).
 */
import React, {
  useState, useMemo, useRef, useEffect, useCallback,
} from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  Modal, ScrollView, Image, Linking, Platform,
  Dimensions, Animated,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import {
  SlidersHorizontal, X, Navigation, ArrowRight, Locate,
  Clock, MapPin, UtensilsCrossed, Coffee, Trees, Landmark,
  BedDouble, Zap, ShoppingBag, Palette, Layers,
  ParkingSquare, Wifi, Dog, Sun, Accessibility,
  Baby, Leaf, CalendarCheck,
} from "lucide-react-native";
import Svg, {
  Defs, LinearGradient as SvgGrad, Stop,
  Rect as SvgRect, Circle, Path,
} from "react-native-svg";
import { usePlaces, isPlaceOpen, type Place } from "@/hooks/usePlaces";

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Design tokens ──────────────────────────────────────────────────────────
const BG   = "#121212";
const GOLD = "#C5A059";
const FG   = "#F5F2EA";
const MUTED = "rgba(255,255,255,0.45)";

// ─── Karta-startläge ────────────────────────────────────────────────────────
const INIT_REGION = {
  latitude: 55.5,
  longitude: 14.1,
  latitudeDelta: 0.22,
  longitudeDelta: 0.22,
};

// ─── Kategorier ─────────────────────────────────────────────────────────────
const CAT_FILTERS = [
  { id: "all",                  label: "Alla",               Icon: Layers         },
  { id: "Mat & Dryck",          label: "Mat & Dryck",        Icon: UtensilsCrossed },
  { id: "Café & Bageri",        label: "Café & Bageri",      Icon: Coffee         },
  { id: "Natur",                label: "Natur & Upplevelser",Icon: Trees          },
  { id: "Sevärdhet",            label: "Sevärdheter",        Icon: Landmark       },
  { id: "Hotell",               label: "Hotell & B&B",       Icon: BedDouble      },
  { id: "Aktiviteter",          label: "Aktiviteter",        Icon: Zap            },
  { id: "Butiker",              label: "Butiker",            Icon: ShoppingBag    },
  { id: "Design",               label: "Design & Hantverk",  Icon: Palette        },
] as const;

// ─── Praktiska filter ────────────────────────────────────────────────────────
const PRACTICAL = [
  { id: "open_now",        label: "Öppet nu",       Icon: Clock          },
  { id: "parking",         label: "Parkering",       Icon: ParkingSquare  },
  { id: "wifi",            label: "Wifi",            Icon: Wifi           },
  { id: "pets",            label: "Hundvänligt",     Icon: Dog            },
  { id: "outdoor",         label: "Uteservering",    Icon: Sun            },
  { id: "accessible",      label: "Tillgänglighet",  Icon: Accessibility  },
  { id: "family",          label: "Barnvänligt",     Icon: Baby           },
  { id: "vegetarian",      label: "Vegetariskt",     Icon: Leaf           },
  { id: "ev_charging",     label: "Laddstolpe",      Icon: Zap            },
  { id: "booking_required",label: "Bokning krävs",   Icon: CalendarCheck  },
] as const;

// ─── Hjälpare ────────────────────────────────────────────────────────────────
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

function drivingStr(raw: number): string {
  const km = raw * 1.3 + 1;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function parseAmenities(raw: unknown): Record<string, boolean> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, boolean>;
  try { return JSON.parse(raw as string); } catch { return {}; }
}

// ─── Custom SVG-pins ─────────────────────────────────────────────────────────
function StandardPin() {
  return (
    <Svg width={24} height={32} viewBox="0 0 24 32">
      <Path
        d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z"
        fill="hsl(150,30%,28%)"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={1}
      />
      <Circle cx={12} cy={11} r={4} fill="white" />
    </Svg>
  );
}

function SelectedPin() {
  return (
    <Svg width={36} height={44} viewBox="0 0 36 44">
      <Path
        d="M18 0C8.059 0 0 8.059 0 18c0 12.75 18 26 18 26S36 30.75 36 18C36 8.059 27.941 0 18 0z"
        fill="hsl(38,70%,55%)"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={1}
      />
      <Circle cx={18} cy={16} r={7} fill="white" />
    </Svg>
  );
}

// ─── Huvud-komponent ─────────────────────────────────────────────────────────
export default function MapScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const mapRef  = useRef<MapView>(null);

  const [selectedPlace, setSelectedPlace]         = useState<Place | null>(null);
  const [selectedCats, setSelectedCats]           = useState<Set<string>>(new Set());
  const [practicalFilters, setPracticalFilters]   = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen]               = useState(false);
  const [userLoc, setUserLoc]                     = useState<{ latitude: number; longitude: number } | null>(null);
  const locDone       = useRef(false);
  // Förhindrar att MapView.onPress nollställer kortet direkt efter marker-press
  const markerJustPressed = useRef(false);

  const cardAnim = useRef(new Animated.Value(0)).current;

  const { data: places = [] } = usePlaces();

  // ── Användarposition ────────────────────────────────────────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          setUserLoc({ latitude, longitude });
          if (!locDone.current) {
            locDone.current = true;
            mapRef.current?.animateToRegion(
              { latitude, longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 },
              1500,
            );
          }
        },
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // ── Kort-animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.spring(cardAnim, {
      toValue: selectedPlace ? 1 : 0,
      useNativeDriver: true,
      stiffness: 400,
      damping: 30,
    }).start();
  }, [selectedPlace]);

  // ── Filtrering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return places.filter((p) => {
      if (!p.lat || !p.lng) return false;

      if (selectedCats.size > 0) {
        const cat = (p.category ?? "").toLowerCase();
        const ok = Array.from(selectedCats).some((f) => {
          const fl = f.toLowerCase();
          return (
            cat.includes(fl) ||
            cat.includes(fl.replace("é", "e")) ||
            fl.includes(cat.split(",")[0].trim())
          );
        });
        if (!ok) return false;
      }

      if (practicalFilters.has("open_now")) {
        if (!isPlaceOpen(p.opening_hours as Record<string, string> | null)) return false;
      }

      const amenityKeys = Array.from(practicalFilters).filter((k) => k !== "open_now");
      if (amenityKeys.length > 0) {
        const am = parseAmenities(p.amenities);
        if (!amenityKeys.every((k) => am[k])) return false;
      }

      return true;
    });
  }, [places, selectedCats, practicalFilters]);

  // ── Aktiva filterpiller ────────────────────────────────────────────────────
  const activePills = useMemo(() => {
    const out: { id: string; label: string; type: "cat" | "prac" }[] = [];
    selectedCats.forEach((id) => {
      const c = CAT_FILTERS.find((x) => x.id === id);
      if (c) out.push({ id, label: c.label, type: "cat" });
    });
    practicalFilters.forEach((id) => {
      const p = PRACTICAL.find((x) => x.id === id);
      if (p) out.push({ id, label: p.label, type: "prac" });
    });
    return out;
  }, [selectedCats, practicalFilters]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleMarkerPress = useCallback((place: Place) => {
    markerJustPressed.current = true;
    setTimeout(() => { markerJustPressed.current = false; }, 300);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedPlace(place);
    if (place.lat && place.lng) {
      mapRef.current?.animateToRegion(
        { latitude: place.lat - 0.006, longitude: place.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 },
        800,
      );
    }
  }, []);

  const handleMapPress = useCallback(() => {
    if (markerJustPressed.current) return; // ignorera tap som hörde till marker
    setSelectedPlace(null);
  }, []);

  const handleLocate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (userLoc) {
      mapRef.current?.animateToRegion(
        { ...userLoc, latitudeDelta: 0.08, longitudeDelta: 0.08 },
        1000,
      );
    }
  }, [userLoc]);

  const handleNavigate = useCallback((place: Place) => {
    if (!place.lat || !place.lng) return;
    const url =
      Platform.OS === "ios"
        ? `maps://?daddr=${place.lat},${place.lng}`
        : `google.navigation:q=${place.lat},${place.lng}`;
    Linking.openURL(url);
  }, []);

  const toggleCat = useCallback((id: string) => {
    if (id === "all") { setSelectedCats(new Set()); return; }
    setSelectedCats((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const togglePractical = useCallback((id: string) => {
    setPracticalFilters((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const removePill = useCallback(
    (pill: { id: string; type: "cat" | "prac" }) => {
      if (pill.type === "cat") {
        setSelectedCats((prev) => { const n = new Set(prev); n.delete(pill.id); return n; });
      } else {
        setPracticalFilters((prev) => { const n = new Set(prev); n.delete(pill.id); return n; });
      }
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setSelectedCats(new Set());
    setPracticalFilters(new Set());
  }, []);

  // ── Avstånd till vald plats ────────────────────────────────────────────────
  const distanceStr = useMemo(() => {
    if (!userLoc || !selectedPlace?.lat || !selectedPlace?.lng) return null;
    const raw = haversineKm(userLoc.latitude, userLoc.longitude, selectedPlace.lat, selectedPlace.lng);
    return drivingStr(raw);
  }, [userLoc, selectedPlace]);

  // ── Öppet/stängt ──────────────────────────────────────────────────────────
  const getOpenStatus = (place: Place): boolean | null => {
    if (!place.opening_hours) return null;
    const cat = (place.category ?? "").toLowerCase();
    const skipWords = ["hotell", "b&b", "natur", "upplevelse", "sevärdhet"];
    if (skipWords.some((w) => cat.includes(w))) return null;
    return isPlaceOpen(place.opening_hours as Record<string, string> | null);
  };

  const headerTop = Math.max(insets.top, 44);

  return (
    <View style={s.root}>

      {/* ── Karta ─────────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="mutedStandard"
        userInterfaceStyle="light"
        provider={PROVIDER_DEFAULT}
        initialRegion={INIT_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        // Apple Maps-loggan positioneras precis ovanför navbaren (måste vara synlig per ToS)
        legalLabelInsets={{ bottom: 56 + insets.bottom + 4, left: 8, right: 0, top: 0 }}
        onPress={handleMapPress}
      >
        {filtered.map((place) => {
          const isSelected = selectedPlace?.id === place.id;
          return (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.lat!, longitude: place.lng! }}
              onPress={() => handleMarkerPress(place)}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={isSelected}
            >
              {isSelected ? <SelectedPin /> : <StandardPin />}
            </Marker>
          );
        })}
      </MapView>

      {/* ── Mörk gradient-fade (top 160px) ───────────────────────────────── */}
      <View style={s.topFade} pointerEvents="none">
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
          <Defs>
            <SvgGrad id="mapfade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor="#000" stopOpacity={1}   />
              <Stop offset="20%"  stopColor="#000" stopOpacity={0.8} />
              <Stop offset="50%"  stopColor="#000" stopOpacity={0.4} />
              <Stop offset="100%" stopColor="#000" stopOpacity={0}   />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#mapfade)" />
        </Svg>
      </View>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View
        style={[s.header, { paddingTop: headerTop + 16 }]}
        pointerEvents="box-none"
      >
        {/* Filterknapp */}
        <TouchableOpacity
          style={s.filterBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setFilterOpen(true);
          }}
          activeOpacity={0.8}
        >
          <SlidersHorizontal size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
          {activePills.length > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{activePills.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Titel */}
        <View style={s.titleWrap} pointerEvents="none">
          <Text style={s.titleText}>Karta</Text>
          <View style={s.titleLine} />
        </View>

        {/* Balansyta höger */}
        <View style={{ width: 44 }} />
      </View>

      {/* ── Aktiva filterpiller ───────────────────────────────────────────── */}
      {activePills.length > 0 && (
        <View style={[s.pillsRow, { top: headerTop + 16 + 56 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.pillsContent}
          >
            {activePills.map((pill) => (
              <TouchableOpacity
                key={pill.id}
                style={s.pill}
                onPress={() => removePill(pill)}
                activeOpacity={0.8}
              >
                <Text style={s.pillText}>{pill.label}</Text>
                <View style={s.pillXWrap}>
                  <X size={10} color={GOLD} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Hitta mig ─────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[s.locateBtn, { bottom: 56 + insets.bottom + 88 }]}
        onPress={handleLocate}
        activeOpacity={0.85}
      >
        <Locate size={26} color="#3B82F6" strokeWidth={2} />
      </TouchableOpacity>

      {/* ── Platskort ─────────────────────────────────────────────────────── */}
      {selectedPlace && (
        <Animated.View
          style={[
            s.card,
            { bottom: 56 + insets.bottom + 16 },
            {
              opacity: cardAnim,
              transform: [{
                translateY: cardAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [120, 0],
                }),
              }],
            },
          ]}
        >
          {/* Bild + text */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={s.cardImg}
            onPress={() => router.push(`/place/${selectedPlace.id}` as any)}
          >
            {selectedPlace.image_url ? (
              <Image
                source={{ uri: selectedPlace.image_url.split(",")[0].trim() }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1E1E1E" }]} />
            )}

            {/* Gradient på bild */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
                <Defs>
                  <SvgGrad id="cg" x1="0" y1="1" x2="0" y2="0">
                    <Stop offset="0%"   stopColor="#000" stopOpacity={0.92} />
                    <Stop offset="50%"  stopColor="#000" stopOpacity={0.35} />
                    <Stop offset="100%" stopColor="#000" stopOpacity={0.05} />
                  </SvgGrad>
                </Defs>
                <SvgRect width="100%" height="100%" fill="url(#cg)" />
              </Svg>
            </View>

            {/* Text på bild */}
            <View style={s.cardOverlay}>
              <Text style={s.cardName} numberOfLines={2}>{selectedPlace.name}</Text>
              <View style={s.cardMeta}>
                {selectedPlace.category && (
                  <View style={s.metaItem}>
                    <UtensilsCrossed size={12} color={GOLD} strokeWidth={2} />
                    <Text style={s.metaCat} numberOfLines={1}>
                      {selectedPlace.category.split(",")[0].trim()}
                    </Text>
                  </View>
                )}
                {(() => {
                  const open = getOpenStatus(selectedPlace);
                  if (open === null) return null;
                  return (
                    <View style={s.metaItem}>
                      <Clock size={12} color={open ? "#4ADE80" : "#F87171"} strokeWidth={2} />
                      <Text style={[s.metaOpen, { color: open ? "#4ADE80" : "#F87171" }]}>
                        {open ? "Öppet" : "Stängt"}
                      </Text>
                    </View>
                  );
                })()}
                {distanceStr && (
                  <View style={s.metaItem}>
                    <MapPin size={12} color="rgba(255,255,255,0.75)" strokeWidth={2} />
                    <Text style={s.metaDist}>{distanceStr}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* Åtgärdsknappar */}
          <View style={s.cardActions}>
            <TouchableOpacity
              style={s.btnNav}
              onPress={() => handleNavigate(selectedPlace)}
              activeOpacity={0.8}
            >
              <Navigation size={15} color="rgba(255,255,255,0.9)" strokeWidth={2} />
              <Text style={s.btnNavText}>Navigera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.btnView}
              onPress={() => router.push(`/place/${selectedPlace.id}` as any)}
              activeOpacity={0.85}
            >
              <Text style={s.btnViewText}>Visa plats</Text>
              <ArrowRight size={15} color="#000" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Filtersheet ───────────────────────────────────────────────────── */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable style={s.overlay} onPress={() => setFilterOpen(false)} />

        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          {/* Handtag */}
          <View style={s.handle} />

          {/* Rubrikrad */}
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Filter</Text>
            <TouchableOpacity style={s.sheetClose} onPress={() => setFilterOpen(false)}>
              <X size={16} color={FG} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            {/* Kategorier */}
            <Text style={s.sheetSection}>KATEGORIER</Text>
            <View style={s.chipWrap}>
              {CAT_FILTERS.map(({ id, label, Icon }) => {
                const active = id === "all"
                  ? selectedCats.size === 0
                  : selectedCats.has(id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => toggleCat(id)}
                    activeOpacity={0.8}
                  >
                    <Icon
                      size={14}
                      color={active ? GOLD : "rgba(255,255,255,0.7)"}
                      strokeWidth={2}
                    />
                    <Text style={[s.chipText, active && s.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Praktiskt */}
            <Text style={[s.sheetSection, { marginTop: 28 }]}>PRAKTISKT</Text>
            <View style={s.chipWrap}>
              {PRACTICAL.map(({ id, label, Icon }) => {
                const active = practicalFilters.has(id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => togglePractical(id)}
                    activeOpacity={0.8}
                  >
                    <Icon
                      size={14}
                      color={active ? GOLD : "rgba(255,255,255,0.7)"}
                      strokeWidth={2}
                    />
                    <Text style={[s.chipText, active && s.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Sidfot */}
          <View style={s.sheetFoot}>
            <TouchableOpacity onPress={resetFilters} activeOpacity={0.7}>
              <Text style={s.resetText}>Återställ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.applyBtn}
              onPress={() => setFilterOpen(false)}
              activeOpacity={0.85}
            >
              {/* Guldgradient via SVG */}
              <Svg
                width="100%"
                height="100%"
                style={StyleSheet.absoluteFill}
                preserveAspectRatio="none"
              >
                <Defs>
                  <SvgGrad id="gbtn" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%"   stopColor={GOLD}              />
                    <Stop offset="100%" stopColor="hsl(38,65%,45%)"   />
                  </SvgGrad>
                </Defs>
                <SvgRect width="100%" height="100%" fill="url(#gbtn)" rx={16} />
              </Svg>
              <Text style={s.applyText}>Visa {filtered.length} platser</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Fade-gradient top
  topFade: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 160,
    zIndex: 5,
  },

  // Header
  header: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#1A1A1A",
  },
  badgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#000",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
  },
  titleText: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  titleLine: {
    width: 40,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 1,
    marginTop: 4,
  },

  // Filter-piller
  pillsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9,
  },
  pillsContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(18,18,18,0.85)",
    borderWidth: 0.5,
    borderColor: `${GOLD}90`,
  },
  pillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: GOLD,
  },
  pillXWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: `${GOLD}30`,
    alignItems: "center",
    justifyContent: "center",
  },

  // Hitta mig
  locateBtn: {
    position: "absolute",
    right: 12,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },

  // Platskort
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 22,
    backgroundColor: "rgba(18,18,18,0.96)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  cardImg: {
    height: 190,
    overflow: "hidden",
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
  },
  cardName: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginBottom: 6,
  },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaCat: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11.5,
    color: GOLD,
  },
  metaOpen: {
    fontFamily: "Inter_500Medium",
    fontSize: 11.5,
  },
  metaDist: {
    fontFamily: "Inter_400Regular",
    fontSize: 11.5,
    color: "rgba(255,255,255,0.8)",
  },

  // Knappar
  cardActions: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  btnNav: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
  },
  btnNavText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
  },
  btnView: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: 12,
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  btnViewText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#000",
  },

  // Filtersheet
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    height: SH * 0.88,
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.6,
    shadowRadius: 60,
    elevation: 30,
  },
  handle: {
    width: 48,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 3,
    alignSelf: "center",
    marginTop: 12,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sheetTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: FG,
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sheetSection: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: {
    backgroundColor: `${GOLD}35`,
    borderColor: `${GOLD}7A`,
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
  chipTextActive: { color: GOLD },

  // Sidfot
  sheetFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  resetText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
  },
  applyBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  applyText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#000",
  },
});
