/**
 * Karta — svartvit karta i appens tema (mapStyle.ts), där Österlens platser är det enda som har
 * färg: runda medaljonger i kategoriernas färger (MapPins.tsx). Utzoomat slås närliggande platser
 * ihop till en klump med antalet (supercluster).
 *
 * - Trycker man på en nål glider korten upp (PlaceCarousel); man sveper mellan närliggande platser
 *   och kartan följer med.
 * - Filter (MapFilterSheet): kategorier (en vald = platsernas loggor i stället för nålar),
 *   praktiskt, service (toaletter, laddning …), en av mina listor (numrerad, med en streckad rutt
 *   i listans ordning) och skatter.
 * - Kommer man hit med ?place= (från ett minne) eller ?sticker= (Hem, Mitt Österlen) visas den
 *   platsen/skatten direkt; annars centreras kartan på mig varje gång man går in på fliken.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Linking,
} from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, { FadeIn, FadeInDown, FadeOutDown } from "react-native-reanimated";
import Supercluster from "supercluster";
import { ArrowLeft, Locate, Navigation, SlidersHorizontal, X } from "lucide-react-native";
import { usePlaces, isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { useCollectibles, useCollected, type Collectible } from "@/hooks/useCollectibles";
import { useAllServicePoints, type ServicePoint } from "@/hooks/useServicePoints";
import { useLists, useList } from "@/hooks/useLists";
import { useVisits } from "@/hooks/useVisits";
import { savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { findCategory, CATEGORIES } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import { distanceMeters } from "@/lib/checkin";
import { StickerPin } from "@/components/stickers/StickerPin";
import { StickerCard } from "@/components/stickers/StickerCard";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import { ClusterPin, LogoPin, NumberPin, PlacePin, ServicePin, SERVICE_TYPES } from "@/components/map/MapPins";
import { PlaceCarousel, travelLabel, type CarouselItem } from "@/components/map/PlaceCarousel";
import {
  MapFilterSheet, EMPTY_FILTERS, AMENITIES, countFilters, type MapFilters,
} from "@/components/map/MapFilterSheet";
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_IS_STYLEABLE, MAP_PROVIDER } from "@/components/map/mapStyle";

const GOLD = "#C5A059";
/** Startläge innan positionen är känd: hela Österlen */
const INIT_REGION: Region = { latitude: 55.5, longitude: 14.1, latitudeDelta: 0.22, longitudeDelta: 0.22 };
/** Så många närliggande platser man kan svepa mellan från en nål */
const CAROUSEL_SIZE = 15;
/** Kartnavigeringens höjd längst ner (FloatingNav, kartvarianten) */
const NAV_H = 56 + 12;

/** Kartans zoomnivå (som kartleverantörerna räknar den) ur hur mycket som syns */
const zoomOf = (r: Region) => Math.round(Math.log2(360 / r.longitudeDelta));

function parseAmenities(raw: unknown): Record<string, boolean> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, boolean>;
  try { return JSON.parse(raw as string); } catch { return {}; }
}

type PlacePoint = Supercluster.PointFeature<{ id: number }>;

export default function MapScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sticker: stickerParam, place: placeParam, from: fromMemoryParam } =
    useLocalSearchParams<{ sticker?: string; place?: string; from?: string }>();
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef<Region>(INIT_REGION);
  const [region, setRegion] = useState<Region>(INIT_REGION);

  const { data: places = [] } = usePlaces();
  const { data: collectibles = [] } = useCollectibles();
  const { data: collected = new Map<string, string>() } = useCollected();
  const { data: servicePoints = [] } = useAllServicePoints();
  const { data: lists = [] } = useLists();
  const { data: visits = [] } = useVisits();
  const { data: favorites = [] } = useFavorites();

  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const { data: listDetail } = useList(filters.listId ?? undefined);

  // ── Min position ──────────────────────────────────────────────────────────
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  // Senaste positionen, för fokusåterställningen — utan userLoc-statet i beroendena, annars hade
  // kartan ryckt tillbaka till mig varje gång positionen uppdateras medan man panorerar
  const userLocRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Kommer man hit med ett mål (plats eller skatt) ska första GPS-fixet inte centrera om till mig
  const locDone = useRef(Boolean(stickerParam || placeParam));
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
          userLocRef.current = { latitude, longitude };
          if (!locDone.current) {
            locDone.current = true;
            mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 1200);
          }
        },
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // ── Sparade platser: hjärtat ändras här direkt, resten av appen får veta när man lämnar kartan
  // (att uppdatera favoriterna överallt mitt i hjärtanimationen gav ett hack)
  const serverSaved = useMemo(() => new Set(favorites.flatMap((f) => (f.place_id != null ? [f.place_id] : []))), [favorites]);
  const [savedOverrides, setSavedOverrides] = useState<Map<number, boolean>>(() => new Map());
  const savedIds = useMemo(() => {
    const set = new Set(serverSaved);
    savedOverrides.forEach((on, id) => (on ? set.add(id) : set.delete(id)));
    return set;
  }, [serverSaved, savedOverrides]);
  const savedRef = useRef(savedIds);
  savedRef.current = savedIds;
  const toggleSave = useCallback((placeId: number) => {
    const save = !savedRef.current.has(placeId);
    setSavedOverrides((prev) => new Map(prev).set(placeId, save));
    savePlaceFavorite(placeId, save).catch(() => setSavedOverrides((prev) => new Map(prev).set(placeId, !save)));
  }, []);
  const overridesRef = useRef(savedOverrides);
  overridesRef.current = savedOverrides;
  const { burst, show: showBurst } = useLikeBurst();

  // ── Det som syns ──────────────────────────────────────────────────────────
  const visitedIds = useMemo(() => new Set(visits.map((v) => v.place_id)), [visits]);
  // En plats som också är en skatt visas bara som skattens lila nål
  const stickerPlaceIds = useMemo(
    () => new Set(collectibles.map((c) => c.placeId).filter((id): id is number => id != null)),
    [collectibles],
  );
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  // En vald lista: dess platser i listans ordning
  const listPlaces = useMemo(() => {
    if (!filters.listId || !listDetail) return null;
    return listDetail.places
      .map((lp) => placeById.get(lp.place.id))
      .filter((p): p is Place => !!p && p.lat != null && p.lng != null);
  }, [filters.listId, listDetail, placeById]);

  const shownPlaces = useMemo(() => {
    if (filters.treasures === "only") return [];
    if (listPlaces) return listPlaces;
    const amenityKeys = [...filters.amenities].filter((k) => k !== "open_now");
    return places.filter((p) => {
      if (p.lat == null || p.lng == null || stickerPlaceIds.has(p.id)) return false;
      if (filters.cats.size > 0) {
        const cat = findCategory(p.category)?.id;
        if (!cat || !filters.cats.has(cat)) return false;
      }
      if (filters.amenities.has("open_now") && !isPlaceOpen(p.opening_hours as Record<string, string> | null)) return false;
      if (amenityKeys.length > 0) {
        const am = parseAmenities((p as Place & { amenities?: unknown }).amenities);
        if (!amenityKeys.every((k) => am[k])) return false;
      }
      return true;
    });
  }, [places, filters, listPlaces, stickerPlaceIds]);

  const shownTreasures = useMemo(() => {
    if (filters.treasures === "none") return [];
    if (filters.treasures === "unfound") return collectibles.filter((c) => !collected.has(c.id));
    return collectibles;
  }, [collectibles, collected, filters.treasures]);

  const shownServices = useMemo(
    () => servicePoints.filter((p) => filters.services.has(p.type) && p.lat != null && p.lng != null),
    [servicePoints, filters.services],
  );

  // En kategori vald (och ingen lista): platsernas loggor i stället för nålar
  const logoMode = filters.cats.size === 1 && !listPlaces;

  // ── Klumpar när man zoomat ut (inte för en lista — där syns alla med sina nummer) ──
  const cluster = useMemo(() => {
    const index = new Supercluster<{ id: number }>({ radius: 54, maxZoom: 13, minPoints: 3 });
    const points: PlacePoint[] = shownPlaces.map((p) => ({
      type: "Feature",
      properties: { id: p.id },
      geometry: { type: "Point", coordinates: [p.lng!, p.lat!] },
    }));
    index.load(points);
    return index;
  }, [shownPlaces]);
  const clusters = useMemo(() => {
    if (listPlaces) return [];
    const r = region;
    const bbox: [number, number, number, number] = [
      r.longitude - r.longitudeDelta, r.latitude - r.latitudeDelta,
      r.longitude + r.longitudeDelta, r.latitude + r.latitudeDelta,
    ];
    return cluster.getClusters(bbox, zoomOf(r));
  }, [cluster, region, listPlaces]);

  // ── Valt ──────────────────────────────────────────────────────────────────
  const [carousel, setCarousel] = useState<{ ids: number[]; index: number; key: number } | null>(null);
  const [selectedService, setSelectedService] = useState<ServicePoint | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<Collectible | null>(null);
  const selectedPlaceId = carousel ? carousel.ids[carousel.index] : null;
  // Kartans tryck kommer även när en nål trycks — det ska inte stänga kortet nålen just öppnade
  const pinJustPressed = useRef(false);
  const notePinPress = () => {
    pinJustPressed.current = true;
    setTimeout(() => { pinJustPressed.current = false; }, 300);
  };

  /** Flytta kartan så platsen hamnar ovanför korten (och zooma in om man står långt ut) */
  const focusOn = useCallback((lat: number, lng: number) => {
    const r = regionRef.current;
    const delta = r.longitudeDelta > 0.12 ? 0.05 : r.longitudeDelta;
    const latDelta = r.longitudeDelta > 0.12 ? 0.05 : r.latitudeDelta;
    mapRef.current?.animateToRegion(
      { latitude: lat - latDelta * 0.2, longitude: lng, latitudeDelta: latDelta, longitudeDelta: delta },
      450,
    );
  }, []);

  const shownRef = useRef({ shownPlaces, listPlaces });
  shownRef.current = { shownPlaces, listPlaces };
  const openPlace = useCallback((place: Place) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedService(null);
    setSelectedSticker(null);
    setCarousel((prev) => {
      // Finns platsen redan bland korten: svep dit
      if (prev && prev.ids.includes(place.id)) return { ...prev, index: prev.ids.indexOf(place.id) };
      const { shownPlaces: shown, listPlaces: inList } = shownRef.current;
      const ids = inList
        ? inList.map((p) => p.id)
        // Annars: de närmaste platserna runt den man tryckte på, den själv först
        : shown
          .map((p) => ({ id: p.id, d: distanceMeters(place.lat!, place.lng!, p.lat!, p.lng!) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, CAROUSEL_SIZE)
          .map((x) => x.id);
      if (!ids.includes(place.id)) ids.unshift(place.id);
      return { ids, index: ids.indexOf(place.id), key: Date.now() };
    });
    if (place.lat != null && place.lng != null) focusOn(place.lat, place.lng);
  }, [focusOn]);

  const carouselRef = useRef(carousel);
  carouselRef.current = carousel;
  const onCarouselIndex = useCallback((index: number) => {
    Haptics.selectionAsync().catch(() => {});
    setCarousel((prev) => (prev ? { ...prev, index } : prev));
    const id = carouselRef.current?.ids[index];
    const p = id != null ? placeById.get(id) : undefined;
    if (p?.lat != null && p.lng != null) focusOn(p.lat, p.lng);
  }, [placeById, focusOn]);

  const openSticker = useCallback((c: Collectible) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCarousel(null);
    setSelectedService(null);
    setSelectedSticker(c);
    focusOn(c.lat, c.lng);
  }, [focusOn]);

  const openService = useCallback((p: ServicePoint) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCarousel(null);
    setSelectedSticker(null);
    setSelectedService(p);
    if (p.lat != null && p.lng != null) focusOn(p.lat, p.lng);
  }, [focusOn]);

  const closeAll = useCallback(() => {
    if (pinJustPressed.current) return;
    setCarousel(null);
    setSelectedService(null);
    setSelectedSticker(null);
  }, []);

  // Från Hem eller Mitt Österlen: en viss skatt direkt
  useEffect(() => {
    if (!stickerParam) return;
    const c = collectibles.find((x) => x.id === stickerParam);
    if (c) openSticker(c);
  }, [stickerParam, collectibles, openSticker]);
  // Från ett minne ("Visa plats på kartan"): en viss plats direkt
  useEffect(() => {
    if (!placeParam) return;
    const p = places.find((x) => String(x.id) === placeParam);
    if (p) openPlace(p);
  }, [placeParam, places, openPlace]);

  // Varje gång man går in på fliken: tillbaka till där jag är (om man inte kom hit med ett mål).
  // När man lämnar den: resten av appen får veta om hjärtan man tryckt på.
  useFocusEffect(
    useCallback(() => {
      if (!placeParam && !stickerParam) {
        setCarousel(null);
        setSelectedSticker(null);
        setSelectedService(null);
        if (userLocRef.current) {
          mapRef.current?.animateToRegion({ ...userLocRef.current, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 800);
        }
      }
      return () => {
        if (overridesRef.current.size === 0) return;
        queryClient.invalidateQueries({ queryKey: ["favorites"] }).then(() => setSavedOverrides(new Map()));
      };
    }, [placeParam, stickerParam, queryClient]),
  );

  // Nya filter: korten kan visa platser som inte längre syns, så de stängs
  // (inte första gången — då kan en plats eller skatt man skickats hit för just ha öppnats)
  const filtersMounted = useRef(false);
  useEffect(() => {
    if (!filtersMounted.current) { filtersMounted.current = true; return; }
    setCarousel(null);
    setSelectedService(null);
    setSelectedSticker(null);
  }, [filters]);

  // En vald lista: zooma så hela rutten syns
  useEffect(() => {
    if (!listPlaces || listPlaces.length === 0) return;
    setCarousel(null);
    const coords = listPlaces.map((p) => ({ latitude: p.lat!, longitude: p.lng! }));
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: insets.top + 140, right: 60, bottom: NAV_H + insets.bottom + 80, left: 60 },
        animated: true,
      });
    }, 350);
  }, [listPlaces, insets.top, insets.bottom]);

  // ── Handlingar ────────────────────────────────────────────────────────────
  const locate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (userLoc) mapRef.current?.animateToRegion({ ...userLoc, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 900);
  };
  const navigateTo = useCallback((lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) return;
    Linking.openURL(Platform.OS === "ios" ? `maps://?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`).catch(() => {});
  }, []);
  const openPlacePage = useCallback((p: Place) => router.push(`/place/${p.id}` as any), [router]);
  const distanceKm = useCallback((p: Place) => {
    if (!userLoc || p.lat == null || p.lng == null) return null;
    return distanceMeters(userLoc.latitude, userLoc.longitude, p.lat, p.lng) / 1000;
  }, [userLoc]);

  const carouselItems: CarouselItem[] = useMemo(() => {
    if (!carousel) return [];
    const numbers = listPlaces ? new Map(listPlaces.map((p, i) => [p.id, i + 1])) : null;
    return carousel.ids.flatMap((id) => {
      const place = placeById.get(id);
      if (!place) return [];
      return [{ place, category: findCategory(place.category), saved: savedIds.has(id), listNumber: numbers?.get(id) }];
    });
  }, [carousel, placeById, savedIds, listPlaces]);

  // Filtrets aktiva val som små rutor överst på kartan (tryck = ta bort)
  const activeChips = useMemo(() => {
    const out: { key: string; label: string; remove: () => void }[] = [];
    if (filters.listId) {
      const name = lists.find((l) => l.id === filters.listId)?.name ?? "Lista";
      out.push({ key: "list", label: name, remove: () => setFilters((f) => ({ ...f, listId: null })) });
    }
    filters.cats.forEach((id) => {
      const label = CATEGORIES.find((c) => c.id === id)?.label ?? id;
      out.push({ key: `c-${id}`, label, remove: () => setFilters((f) => { const cats = new Set(f.cats); cats.delete(id); return { ...f, cats }; }) });
    });
    filters.amenities.forEach((id) => {
      const label = AMENITIES.find((a) => a.id === id)?.label ?? id;
      out.push({ key: `a-${id}`, label, remove: () => setFilters((f) => { const amenities = new Set(f.amenities); amenities.delete(id); return { ...f, amenities }; }) });
    });
    filters.services.forEach((type) => {
      const label = SERVICE_TYPES.find((t) => t.type === type)?.label ?? type;
      out.push({ key: `s-${type}`, label, remove: () => setFilters((f) => { const services = new Set(f.services); services.delete(type); return { ...f, services }; }) });
    });
    if (filters.treasures !== "all") {
      const label = { unfound: "Ej hittade skatter", only: "Bara skatter", none: "Inga skatter" }[filters.treasures];
      out.push({ key: "t", label, remove: () => setFilters((f) => ({ ...f, treasures: "all" })) });
    }
    return out;
  }, [filters, lists]);

  const resultLabel = filters.treasures === "only"
    ? `Visa ${shownTreasures.length} skatter`
    : shownPlaces.length === 1 ? "Visa 1 plats" : `Visa ${shownPlaces.length} platser`;

  const headerTop = Math.max(insets.top, 44);
  const cardsBottom = insets.bottom + NAV_H + 14;
  const filterCount = countFilters(filters);

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={MAP_PROVIDER}
        customMapStyle={MAP_IS_STYLEABLE ? (dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE) : undefined}
        mapType={MAP_IS_STYLEABLE ? "standard" : "mutedStandard"}
        userInterfaceStyle={dark ? "dark" : "light"}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}
        initialRegion={INIT_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        // Kartleverantörens logga precis ovanför navigeringen (måste synas enligt villkoren)
        legalLabelInsets={{ bottom: insets.bottom + 2, left: 8, right: 0, top: 0 }}
        onPress={closeAll}
        onRegionChangeComplete={(r) => { regionRef.current = r; setRegion(r); }}
      >
        {/* En lista: streckad rutt i listans ordning, under nålarna */}
        {listPlaces && listPlaces.length > 1 && (
          <Polyline
            coordinates={listPlaces.map((p) => ({ latitude: p.lat!, longitude: p.lng! }))}
            strokeColor={GOLD}
            strokeWidth={2.5}
            lineDashPattern={[8, 7]}
          />
        )}

        {listPlaces
          ? listPlaces.map((p, i) => (
            <TrackedMarker
              key={`n-${p.id}-${p.id === selectedPlaceId}`}
              lat={p.lat!}
              lng={p.lng!}
              zIndex={p.id === selectedPlaceId ? 20 : 2}
              onPress={() => { notePinPress(); openPlace(p); }}
            >
              <NumberPin n={i + 1} selected={p.id === selectedPlaceId} />
            </TrackedMarker>
          ))
          : clusters.map((feature) => {
            const [lng, lat] = feature.geometry.coordinates;
            const props = feature.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: number };
            if (props.cluster) {
              return (
                <TrackedMarker
                  key={`c-${props.cluster_id}`}
                  lat={lat}
                  lng={lng}
                  zIndex={1}
                  onPress={() => {
                    notePinPress();
                    Haptics.selectionAsync().catch(() => {});
                    const zoom = Math.min(cluster.getClusterExpansionZoom(props.cluster_id!), 16);
                    const delta = 360 / 2 ** zoom;
                    mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta }, 450);
                  }}
                >
                  <ClusterPin count={props.point_count ?? 0} dark={dark} />
                </TrackedMarker>
              );
            }
            const place = placeById.get(props.id!);
            if (!place) return null;
            const selected = place.id === selectedPlaceId;
            const category = findCategory(place.category);
            const useLogo = logoMode && !!place.logo_url;
            return (
              <TrackedMarker
                key={`p-${place.id}-${selected}-${useLogo}-${savedIds.has(place.id)}`}
                lat={lat}
                lng={lng}
                zIndex={selected ? 20 : 3}
                waitForImage={useLogo}
                onPress={() => { notePinPress(); openPlace(place); }}
              >
                {(onReady) => (useLogo
                  ? <LogoPin uri={place.logo_url!} category={category} selected={selected} onReady={onReady} />
                  : <PlacePin category={category} selected={selected} visited={visitedIds.has(place.id)} saved={savedIds.has(place.id)} />)}
              </TrackedMarker>
            );
          })}

        {shownServices.map((p) => (
          <TrackedMarker
            key={`s-${p.id}-${selectedService?.id === p.id}`}
            lat={p.lat!}
            lng={p.lng!}
            zIndex={selectedService?.id === p.id ? 20 : 1}
            onPress={() => { notePinPress(); openService(p); }}
          >
            <ServicePin type={p.type} dark={dark} selected={selectedService?.id === p.id} />
          </TrackedMarker>
        ))}

        {shownTreasures.map((c) => {
          const selected = selectedSticker?.id === c.id;
          const has = collected.has(c.id);
          return (
            <TrackedMarker
              key={`t-${c.id}-${has}-${selected}`}
              lat={c.lat}
              lng={c.lng}
              anchorBottom
              zIndex={selected ? 20 : 4}
              onPress={() => { notePinPress(); openSticker(c); }}
            >
              <StickerPin collected={has} selected={selected} />
            </TrackedMarker>
          );
        })}
      </MapView>

      {/* Toning överst så statusraden och knapparna alltid syns mot kartan */}
      <LinearGradient
        pointerEvents="none"
        colors={dark ? ["rgba(18,18,18,0.92)", "rgba(18,18,18,0)"] : ["rgba(244,240,230,0.92)", "rgba(244,240,230,0)"]}
        style={[s.topFade, { height: headerTop + 110 }]}
      />

      {/* ── Filter och "hitta mig" ── */}
      <View style={[s.header, { top: headerTop + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={[s.filterBtn, s.raised, { backgroundColor: dark ? "#1A1A1D" : "#FFFFFF", borderColor: colors.border }]}
          activeOpacity={0.85}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setFilterOpen(true); }}
        >
          <SlidersHorizontal size={18} color={colors.text} strokeWidth={2} />
          <Text style={[s.filterText, { color: colors.text }]}>Filter</Text>
          {filterCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.roundBtn, s.raised, { backgroundColor: dark ? "#1A1A1D" : "#FFFFFF", borderColor: colors.border }]}
          activeOpacity={0.85}
          onPress={locate}
          accessibilityLabel="Visa var jag är"
        >
          <Locate size={21} color={dark ? "#F5F1E8" : "#1A1A1A"} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {activeChips.length > 0 && (
        <Reanimated.View entering={FadeIn.duration(200)} style={[s.chipsRow, { top: headerTop + 8 + 52 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsContent}>
            {activeChips.map((c) => (
              <TouchableOpacity
                key={c.key}
                activeOpacity={0.8}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); c.remove(); }}
                style={[s.activeChip, s.raised, { backgroundColor: dark ? "#1A1A1D" : "#FFFFFF", borderColor: "rgba(197,160,89,0.55)" }]}
              >
                <Text style={[s.activeChipText, { color: colors.text }]}>{c.label}</Text>
                <X size={12} color={GOLD} strokeWidth={2.6} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Reanimated.View>
      )}

      {/* ── Korten ── */}
      {carousel && carouselItems.length > 0 && (
        <>
          {fromMemoryParam && String(selectedPlaceId) === placeParam && (
            // Kom man hit från ett minne går det inte att svepa tillbaka dit (kartan är en flik), så
            // en egen väg tillbaka: först profilfliken, sen minnet ovanpå (se memories/[id], viaMap)
            <TouchableOpacity
              style={[s.backToMemory, s.raised, { bottom: cardsBottom + 200, backgroundColor: dark ? "#1A1A1D" : "#FFFFFF" }]}
              activeOpacity={0.85}
              onPress={() => {
                router.push("/(tabs)/profile" as any);
                router.push({ pathname: `/memories/${fromMemoryParam}`, params: { viaMap: "1" } } as any);
              }}
            >
              <ArrowLeft size={14} color={colors.text} strokeWidth={2.2} />
              <Text style={[s.backToMemoryText, { color: colors.text }]}>Tillbaka till minnet</Text>
            </TouchableOpacity>
          )}
          <PlaceCarousel
            key={carousel.key}
            items={carouselItems}
            index={carousel.index}
            distanceKm={distanceKm}
            onIndexChange={onCarouselIndex}
            onOpen={openPlacePage}
            onNavigate={(p) => navigateTo(p.lat, p.lng)}
            onToggleSave={toggleSave}
            onBurst={showBurst}
            bottom={cardsBottom}
          />
        </>
      )}

      {selectedService && (
        <Reanimated.View
          entering={FadeInDown.duration(260)}
          exiting={FadeOutDown.duration(180)}
          style={[s.serviceCard, s.raised, { bottom: cardsBottom, backgroundColor: dark ? "#1A1A1D" : "#FFFFFF", borderColor: colors.border }]}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <ServicePin type={selectedService.type} dark={dark} />
            <View style={{ flex: 1 }}>
              <Text style={[s.serviceType, { color: colors.muted }]}>
                {SERVICE_TYPES.find((t) => t.type === selectedService.type)?.label ?? selectedService.type}
              </Text>
              <Text style={[s.serviceName, { color: colors.text }]} numberOfLines={2}>{selectedService.name}</Text>
              {!!selectedService.description && (
                <Text style={[s.serviceDesc, { color: colors.muted }]} numberOfLines={2}>{selectedService.description}</Text>
              )}
              {userLoc && selectedService.lat != null && selectedService.lng != null && (
                <Text style={[s.serviceDesc, { color: colors.muted }]}>
                  {travelLabel(distanceMeters(userLoc.latitude, userLoc.longitude, selectedService.lat, selectedService.lng) / 1000)}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setSelectedService(null)} hitSlop={10}>
              <X size={18} color={colors.muted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[s.serviceNav, { borderColor: colors.borderStrong }]}
            activeOpacity={0.8}
            onPress={() => navigateTo(selectedService.lat, selectedService.lng)}
          >
            <Navigation size={15} color={colors.text} strokeWidth={2.2} />
            <Text style={[s.serviceNavText, { color: colors.text }]}>Vägbeskrivning</Text>
          </TouchableOpacity>
        </Reanimated.View>
      )}

      {selectedSticker && (
        <StickerCard
          collectible={selectedSticker}
          collectedAt={collected.get(selectedSticker.id)}
          userLoc={userLoc}
          bottom={cardsBottom}
          onClose={() => setSelectedSticker(null)}
        />
      )}

      <MapFilterSheet
        open={filterOpen}
        filters={filters}
        onChange={setFilters}
        lists={lists}
        resultLabel={resultLabel}
        onClose={() => setFilterOpen(false)}
      />
      <LikeBurst burst={burst} />
    </View>
  );
}

/**
 * En nål. Kartan ritar om en egen nåls innehåll bara medan tracksViewChanges är på — den stängs av
 * så fort nålen är ritad (eller loggan laddad), annars ritas alla nålar om hela tiden och kartan
 * blir trög. En nål som ändras (vald, sparad) får en ny key och ritas därmed om.
 */
function TrackedMarker({
  lat, lng, zIndex, anchorBottom = false, waitForImage = false, onPress, children,
}: {
  lat: number; lng: number; zIndex: number; anchorBottom?: boolean; waitForImage?: boolean;
  onPress: () => void;
  children: React.ReactNode | ((onReady: () => void) => React.ReactNode);
}) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    // Utan bild: ritad efter en kort stund. Med bild: vänta på den, men högst två sekunder
    const t = setTimeout(() => setTrack(false), waitForImage ? 2000 : 500);
    return () => clearTimeout(t);
  }, [waitForImage]);
  const onReady = useCallback(() => setTimeout(() => setTrack(false), 120), []);
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={anchorBottom ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
      zIndex={zIndex}
      tracksViewChanges={track}
      onPress={onPress}
    >
      {typeof children === "function" ? children(onReady) : children}
    </Marker>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topFade: { position: "absolute", top: 0, left: 0, right: 0 },
  header: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  raised: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  filterBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 16, borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center",
    backgroundColor: GOLD,
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, color: "#121212" },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  chipsRow: { position: "absolute", left: 0, right: 0 },
  chipsContent: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  activeChip: {
    flexDirection: "row", alignItems: "center", gap: 7, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1,
  },
  activeChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },
  backToMemory: {
    position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6,
    height: 36, paddingHorizontal: 14, borderRadius: 18,
  },
  backToMemoryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  serviceCard: {
    position: "absolute", left: 20, right: 20, borderRadius: 24, padding: 16, gap: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  serviceType: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.3 },
  serviceName: { fontFamily: "Montserrat_700Bold", fontSize: 17, marginTop: 3 },
  serviceDesc: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  serviceNav: {
    height: 46, borderRadius: 23, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  serviceNavText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5 },
});
