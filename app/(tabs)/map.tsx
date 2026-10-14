/**
 * Karta — byggd efter webbappens karta (native-map-full-spec.md), på en svartvit Google-karta i
 * appens tema (mapStyle.ts).
 *
 * - Nålar i kategoriernas färger; den valda platsen blir en guldnål som studsar in. Med en kategori
 *   vald visas platserna som sina loggor. Många platser och skatter nära varandra slås ihop till
 *   klumpar (webbens regler, se lib/mapFilters) — svarta i mörkt läge, vita i ljust.
 * - Filter (MapFilterSheet): kategorier (+ underkategori), praktiskt, Mina, listor, service,
 *   skatter. Aktiva filter syns som piller under rubriken. Navigeringen glider undan medan arket
 *   är uppe.
 * - Platskorten (PlaceCarousel): den valda platsen och de närmaste — svep mellan dem, dra upp =
 *   platssidan, dra ner = stäng. Tärningen blandar fram en slumpad plats bland de som syns.
 * - En vald lista: platserna numreras i listans ordning med en streckad rutt emellan.
 * - Kommer man hit med ?place= (från ett minne) eller ?sticker= (Hem, Mitt Österlen) visas den
 *   platsen/skatten direkt; annars visas kartan runt mig varje gång man går in på fliken.
 *
 * Snabbhet — som de stora kartapparna gör det:
 * - Alla nålar och klumpar är färdiga bilder som Google ritar själv (MapPins, mapIcons).
 * - Klumparna räknas om först när kartan stannat, och bara om det som syns faktiskt ändrats. Nålar
 *   som står kvar byggs aldrig om (de sparas färdiga), så Google behöver inte röra dem.
 * - Kartans nederkant (Googles logga ska alltid synas ovanför korten) glider i takt med korten i
 *   stället för att hoppa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet, Platform, Linking, useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useTypeface } from "@shopify/react-native-skia";
import { Inter_700Bold } from "@expo-google-fonts/inter";
import Reanimated, {
  Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, cancelAnimation,
  useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import Supercluster from "supercluster";
import { ArrowLeft, ChevronDown, Dices, Locate, Navigation, SlidersHorizontal, X } from "lucide-react-native";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { useCollectibles, useCollected, type Collectible } from "@/hooks/useCollectibles";
import { useAllServicePoints, type ServicePoint } from "@/hooks/useServicePoints";
import { useLists, useList } from "@/hooks/useLists";
import { useVisits } from "@/hooks/useVisits";
import { savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { findCategory } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import { distanceMeters } from "@/lib/checkin";
import { setNavHidden } from "@/lib/navVisibility";
import { pushOnce } from "@/lib/navigateOnce";
import {
  CLUSTER, EMPTY_FILTERS, SUBCATEGORIES, clusteringOn, countFilters, filterPlaces, type MapFilters,
} from "@/lib/mapFilters";
import { StickerCard } from "@/components/stickers/StickerCard";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import {
  CENTER_ANCHOR, LogoMarker, PIN_ANCHOR, PIN_COLORS, SELECTED_ANCHOR, SERVICE_TYPES, SelectedPin,
  pinImage, placeLogo, placePinImage, serviceIcon, servicePinImage, treasurePinImage,
} from "@/components/map/MapPins";
import { NUMBER_ANCHOR, clusterIcon, numberPinIcon, systemBoldTypeface } from "@/components/map/mapIcons";
import { PlaceCarousel, PLACE_CARD_H, cardIn, cardOut } from "@/components/map/PlaceCard";
import { MapFilterSheet, activeFilters } from "@/components/map/MapFilterSheet";
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_IS_STYLEABLE, MAP_PROVIDER } from "@/components/map/mapStyle";

const GOLD = "#C5A059";
/** Startläge innan positionen är känd: Österlen */
const INIT_REGION: Region = { latitude: 55.5, longitude: 14.1, latitudeDelta: 0.22, longitudeDelta: 0.22 };
/** Kartnavigeringens överkant (FloatingNav, kartvarianten: 56 hög, 12 över botten) */
const NAV_H = 56 + 12;
/** Service- och skattkortens höjd innan de hunnit mätas (sen följer kartan den riktiga höjden) */
const SMALL_CARD_EST = 240;
/** Så många närliggande platser man kan svepa mellan från en plats */
const NEIGHBORS = 15;
/** Tärningen: antal byten innan den landar */
const SHUFFLE_STEPS = 12;
/** Kartans nederkant glider i samma takt som korten kommer och går */
const PAD_ANIM = { duration: 320, easing: Easing.out(Easing.cubic) };

/** Kartan med en kant (mapPadding) som kan glida, i stället för att hoppa när ett kort öppnas */
const AnimatedMapView = Reanimated.createAnimatedComponent(MapView);

/** En punkt i klumparna: en plats eller en skatt */
type Pt = { k: "p"; id: number } | { k: "t"; id: string };
/** Det som syns på kartan (den valda platsen ritas för sig) */
type Item =
  | { kind: "place"; id: number; key: string }
  | { kind: "treasure"; id: string; key: string }
  | { kind: "cluster"; id: number; count: number; lat: number; lng: number; key: string };

/** Piller in/ut: tonar och växer fram en aning, ovanifrån */
const pillIn: EntryExitAnimationFunction = () => {
  "worklet";
  const cfg = { duration: 200, easing: Easing.bezier(0.16, 1, 0.3, 1) };
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.85 }, { translateY: -4 }] },
    animations: { opacity: withTiming(1, cfg), transform: [{ scale: withTiming(1, cfg) }, { translateY: withTiming(0, cfg) }] },
  };
};
const pillOut: EntryExitAnimationFunction = () => {
  "worklet";
  const cfg = { duration: 160, easing: Easing.bezier(0.16, 1, 0.3, 1) };
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
    animations: { opacity: withTiming(0, cfg), transform: [{ scale: withTiming(0.85, cfg) }, { translateY: withTiming(-4, cfg) }] },
  };
};

export default function MapScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sticker: stickerParam, place: placeParam, from: fromMemoryParam } =
    useLocalSearchParams<{ sticker?: string; place?: string; from?: string }>();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef<Region>(INIT_REGION);
  // Typsnittet som klumparnas siffror ritas med (telefonens eget om Inter inte gick att ladda)
  const [fontFailed, setFontFailed] = useState(false);
  const inter = useTypeface(Inter_700Bold, () => setFontFailed(true));
  const typeface = inter ?? (fontFailed ? systemBoldTypeface() : null);

  const { data: places = [], isFetched: placesFetched } = usePlaces();
  const { data: collectibles = [] } = useCollectibles();
  const { data: collected = new Map<string, string>() } = useCollected();
  const { data: servicePoints = [] } = useAllServicePoints();
  const { data: lists = [] } = useLists();
  const { data: visits = [] } = useVisits();
  const { data: favorites = [] } = useFavorites();

  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const singleListId = filters.listIds.size === 1 ? [...filters.listIds][0] : undefined;
  const { data: listDetail } = useList(singleListId);

  /** Kartans zoomnivå (Google räknar på 256-punktsrutor) ur hur mycket som syns i bredd */
  const zoomOf = useCallback((r: Region) => Math.log2((360 * winW) / (256 * r.longitudeDelta)), [winW]);
  /** Flyg dit. Utan zoom behålls den man har */
  const fly = useCallback((lat: number, lng: number, zoom: number | undefined, duration: number) => {
    const center = { latitude: lat, longitude: lng };
    mapRef.current?.animateCamera(zoom == null ? { center } : { center, zoom }, { duration });
  }, []);

  // ── Min position ──────────────────────────────────────────────────────────
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  // Senaste positionen utan att vara ett beroende någonstans (annars rycker kartan när man panorerar)
  const userLocRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Kommer man hit med ett mål (plats eller skatt) ska första positionen inte flytta kartan till mig
  const locDone = useRef(Boolean(stickerParam || placeParam));
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          setUserLoc({ latitude, longitude });
          userLocRef.current = { latitude, longitude };
          if (!locDone.current) {
            locDone.current = true;
            fly(latitude, longitude, 13, 1500);
          }
        },
      );
    })();
    return () => { sub?.remove(); };
  }, [fly]);

  // ── Sparade platser: hjärtat ändras här direkt, resten av appen får veta när man lämnar kartan
  // (att uppdatera favoriterna överallt mitt i hjärtanimationen gav ett hack)
  const serverSaved = useMemo(() => new Set(favorites.flatMap((f) => (f.place_id != null ? [f.place_id] : []))), [favorites]);
  const [savedOverrides, setSavedOverrides] = useState<Map<number, boolean>>(() => new Map());
  const favoriteIds = useMemo(() => {
    const set = new Set(serverSaved);
    savedOverrides.forEach((on, id) => (on ? set.add(id) : set.delete(id)));
    return set;
  }, [serverSaved, savedOverrides]);
  const favoriteRef = useRef(favoriteIds);
  favoriteRef.current = favoriteIds;
  const toggleSave = useCallback((placeId: number) => {
    const save = !favoriteRef.current.has(placeId);
    setSavedOverrides((prev) => new Map(prev).set(placeId, save));
    savePlaceFavorite(placeId, save).catch(() => setSavedOverrides((prev) => new Map(prev).set(placeId, !save)));
  }, []);
  const overridesRef = useRef(savedOverrides);
  overridesRef.current = savedOverrides;
  const { burst, show: showBurst } = useLikeBurst();

  // ── Det som syns ──────────────────────────────────────────────────────────
  const visitedIds = useMemo(() => new Set(visits.map((v) => v.place_id)), [visits]);
  const listPlaceIds = useMemo(() => {
    const ids = new Set<number>();
    lists.forEach((l) => { if (filters.listIds.has(l.id)) l.placeIds.forEach((id) => ids.add(id)); });
    return ids;
  }, [lists, filters.listIds]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const treasureById = useMemo(() => new Map(collectibles.map((c) => [c.id, c])), [collectibles]);
  const serviceById = useMemo(() => new Map(servicePoints.map((p) => [p.id, p])), [servicePoints]);

  const filtered = useMemo(() => {
    if (filters.treasures === "only") return [];
    // Hjärtan som trycks här ändrar inte vad som syns förrän man lämnat kartan (annars hoppar nålar)
    return filterPlaces(places, filters, { favoriteIds: serverSaved, visitedIds, listPlaceIds });
  }, [places, filters, serverSaved, visitedIds, listPlaceIds]);
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  // En enda vald lista: platserna i listans ordning (bland de som syns med övriga filter)
  const listPlaces = useMemo(() => {
    if (!singleListId || !listDetail) return null;
    const shown = new Set(filtered.map((p) => p.id));
    return listDetail.places
      .map((lp) => placeById.get(lp.place.id))
      .filter((p): p is Place => !!p && shown.has(p.id));
  }, [singleListId, listDetail, placeById, filtered]);
  const listRef = useRef(listPlaces);
  listRef.current = listPlaces;

  const shownTreasures = useMemo(() => {
    if (filters.treasures === "none") return [];
    if (filters.treasures === "unfound") return collectibles.filter((c) => !collected.has(c.id));
    return collectibles;
  }, [collectibles, collected, filters.treasures]);
  // En plats som också är en skatt visas som skattens lila nål
  const treasurePlaceIds = useMemo(
    () => new Set(shownTreasures.map((c) => c.placeId).filter((id): id is number => id != null)),
    [shownTreasures],
  );
  const shownServices = useMemo(
    () => servicePoints.filter((p) => filters.services.has(p.type) && p.lat != null && p.lng != null),
    [servicePoints, filters.services],
  );

  const logoMode = filters.cats.size > 0 && !listPlaces;
  const clusterOn = !listPlaces && clusteringOn(filters, filtered.length);

  // ── Klumpar: platser och skatter tillsammans ──
  const index = useMemo(() => {
    if (!clusterOn) return null;
    const sc = new Supercluster<Pt>({ radius: CLUSTER.radius, minPoints: CLUSTER.minPoints, maxZoom: CLUSTER.maxZoom, extent: 256 });
    const points: Supercluster.PointFeature<Pt>[] = [];
    for (const p of filtered) {
      if (treasurePlaceIds.has(p.id)) continue;
      points.push({ type: "Feature", properties: { k: "p", id: p.id }, geometry: { type: "Point", coordinates: [p.lng!, p.lat!] } });
    }
    for (const c of shownTreasures) {
      points.push({ type: "Feature", properties: { k: "t", id: c.id }, geometry: { type: "Point", coordinates: [c.lng, c.lat] } });
    }
    sc.load(points);
    return sc;
  }, [clusterOn, filtered, treasurePlaceIds, shownTreasures]);
  const indexRef = useRef(index);
  indexRef.current = index;

  // Det som syns räknas om när kartan stannat — men sparas bara om något faktiskt ändrats
  // (samma klumpar och nålar som förut = ingenting behöver ritas om)
  const [clusterItems, setClusterItems] = useState<Item[]>([]);
  const clusterKey = useRef("");
  const recluster = useCallback((r: Region) => {
    const idx = indexRef.current;
    if (!idx) return;
    // En skärm åt varje håll runt det som syns, så små förflyttningar inte behöver något nytt
    const bbox: [number, number, number, number] = [
      r.longitude - r.longitudeDelta, r.latitude - r.latitudeDelta,
      r.longitude + r.longitudeDelta, r.latitude + r.latitudeDelta,
    ];
    const items = idx.getClusters(bbox, Math.floor(zoomOf(r))).map((f): Item => {
      const props = f.properties as Partial<Pt> & { cluster?: boolean; cluster_id?: number; point_count?: number };
      if (props.cluster) {
        const [lng, lat] = f.geometry.coordinates;
        const count = props.point_count ?? 0;
        return { kind: "cluster", id: props.cluster_id!, count, lat, lng, key: `c${props.cluster_id}:${count}` };
      }
      return props.k === "t"
        ? { kind: "treasure", id: props.id as string, key: `t${props.id}` }
        : { kind: "place", id: props.id as number, key: `p${props.id}` };
    });
    // Alltid samma ordning, så nålar som står kvar aldrig flyttas om i listan
    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const key = items.map((i) => i.key).join(",");
    if (key === clusterKey.current) return;
    clusterKey.current = key;
    setClusterItems(items);
  }, [zoomOf]);
  useEffect(() => {
    clusterKey.current = "";
    if (index) recluster(regionRef.current);
    else setClusterItems([]);
  }, [index, recluster]);
  const onRegionChangeComplete = useCallback((r: Region) => {
    regionRef.current = r;
    recluster(r);
  }, [recluster]);

  // Utan klumpar: alla platser som syns (skatterna ritas för sig)
  const plainItems = useMemo<Item[]>(
    () => filtered.filter((p) => !treasurePlaceIds.has(p.id)).map((p) => ({ kind: "place", id: p.id, key: `p${p.id}` })),
    [filtered, treasurePlaceIds],
  );

  // ── Valt ──────────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [neighbors, setNeighbors] = useState<number[]>([]);
  const [selectedService, setSelectedService] = useState<ServicePoint | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<Collectible | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const selectedRef = useRef({ selectedId, selectedService, selectedSticker, shuffling, neighbors });
  selectedRef.current = { selectedId, selectedService, selectedSticker, shuffling, neighbors };
  // Kartans tryck kommer även när en nål trycks — det ska inte stänga kortet nålen just öppnade
  const pinJustPressed = useRef(false);
  const notePinPress = useCallback(() => {
    pinJustPressed.current = true;
    setTimeout(() => { pinJustPressed.current = false; }, 300);
  }, []);

  /**
   * Välj en plats: korten visas och kameran flyger dit (zoom 15, eller närmare om man redan står
   * närmare). Står platsen redan bland korten glider karusellen dit; annars blir korten platsen och
   * de närmaste runt den (i en vald lista: listan i sin ordning).
   */
  const selectPlace = useCallback((place: Place) => {
    const cur = selectedRef.current;
    setSelectedService(null);
    setSelectedSticker(null);
    setSelectedId(place.id);
    if (cur.selectedId == null || !cur.neighbors.includes(place.id)) {
      const inList = listRef.current;
      setNeighbors(inList
        ? inList.map((p) => p.id)
        : filteredRef.current
          .map((p) => ({ id: p.id, d: distanceMeters(place.lat!, place.lng!, p.lat!, p.lng!) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, NEIGHBORS)
          .map((x) => x.id));
    }
    if (place.lat != null && place.lng != null) fly(place.lat, place.lng, Math.min(17, Math.max(15, zoomOf(regionRef.current))), 800);
  }, [fly, zoomOf]);

  const openSticker = useCallback((c: Collectible) => {
    setSelectedId(null);
    setSelectedService(null);
    setSelectedSticker(c);
    fly(c.lat, c.lng, Math.min(17, Math.max(15, zoomOf(regionRef.current))), 800);
  }, [fly, zoomOf]);
  const openService = useCallback((p: ServicePoint) => {
    setSelectedId(null);
    setSelectedSticker(null);
    setSelectedService(p);
    if (p.lat != null && p.lng != null) fly(p.lat, p.lng, Math.min(17, Math.max(15, zoomOf(regionRef.current))), 800);
  }, [fly, zoomOf]);

  /** Stäng kortet; står man inzoomad zoomar kartan ut lite (zoom 12) */
  const deselect = useCallback(() => {
    const cur = selectedRef.current;
    if (cur.shuffling) return;
    const had = cur.selectedId != null || cur.selectedService != null || cur.selectedSticker != null;
    setSelectedId(null);
    setSelectedService(null);
    setSelectedSticker(null);
    if (had && zoomOf(regionRef.current) > 12.5) {
      mapRef.current?.getCamera().then((cam) => {
        mapRef.current?.animateCamera({ center: cam.center, zoom: 12 }, { duration: 600 });
      }).catch(() => {});
    }
  }, [zoomOf]);
  const onMapPress = useCallback(() => {
    if (pinJustPressed.current) return;
    deselect();
  }, [deselect]);

  // Svep i karusellen: kameran glider till platsen (zoomen man har behålls)
  const onCarouselIndex = useCallback((i: number) => {
    const id = selectedRef.current.neighbors[i];
    const place = id != null ? placeById.get(id) : undefined;
    if (!place) return;
    Haptics.selectionAsync().catch(() => {});
    setSelectedId(place.id);
    if (place.lat != null && place.lng != null) fly(place.lat, place.lng, undefined, 600);
  }, [placeById, fly]);

  // Tryck på nålar och klumpar. Markörerna byggs en gång och sparas, så de anropar alltid de
  // senaste versionerna härifrån
  const press = useRef({
    place: (_id: number) => {},
    treasure: (_id: string) => {},
    service: (_id: number) => {},
    cluster: (_id: number, _lat: number, _lng: number) => {},
  });
  press.current = {
    place: (id) => {
      const p = placeById.get(id);
      if (!p) return;
      notePinPress();
      Haptics.selectionAsync().catch(() => {});
      selectPlace(p);
    },
    treasure: (id) => {
      const c = treasureById.get(id);
      if (!c) return;
      notePinPress();
      Haptics.selectionAsync().catch(() => {});
      openSticker(c);
    },
    service: (id) => {
      const p = serviceById.get(id);
      if (!p) return;
      notePinPress();
      Haptics.selectionAsync().catch(() => {});
      openService(p);
    },
    // Klump: zooma in tills den delar på sig
    cluster: (id, lat, lng) => {
      notePinPress();
      Haptics.selectionAsync().catch(() => {});
      let zoom = zoomOf(regionRef.current) + 2;
      try { zoom = indexRef.current?.getClusterExpansionZoom(id) ?? zoom; } catch { /* klumpen hör till gamla filter */ }
      fly(lat, lng, Math.min(zoom, 17), 500);
    },
  };

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
    if (p) selectPlace(p);
  }, [placeParam, places, selectPlace]);

  // Varje gång man går in på fliken: kartan runt mig (om man inte kom hit med ett mål). När man
  // lämnar den: filterarket stängs och resten av appen får veta om hjärtan man tryckt på.
  useFocusEffect(
    useCallback(() => {
      if (!placeParam && !stickerParam) {
        setSelectedId(null);
        setSelectedSticker(null);
        setSelectedService(null);
        if (userLocRef.current) fly(userLocRef.current.latitude, userLocRef.current.longitude, 13, 800);
      }
      return () => {
        setFilterOpen(false);
        if (overridesRef.current.size === 0) return;
        queryClient.invalidateQueries({ queryKey: ["favorites"] }).then(() => setSavedOverrides(new Map()));
      };
    }, [placeParam, stickerParam, queryClient, fly]),
  );

  // Filterarket täcker navigeringen — den glider undan så länge arket är uppe
  useEffect(() => { setNavHidden(filterOpen); }, [filterOpen]);
  useEffect(() => () => setNavHidden(false), []);

  // Nya filter: kortet kan visa en plats som inte längre syns, så det stängs
  // (inte första gången — då kan en plats eller skatt man skickats hit för just ha öppnats)
  const filtersMounted = useRef(false);
  useEffect(() => {
    if (!filtersMounted.current) { filtersMounted.current = true; return; }
    setSelectedId(null);
    setSelectedService(null);
    setSelectedSticker(null);
  }, [filters]);

  // En vald lista: zooma så hela rutten syns (utöver kartans egen kant under rubriken och ovanför navigeringen)
  useEffect(() => {
    if (!listPlaces || listPlaces.length === 0) return;
    const coords = listPlaces.map((p) => ({ latitude: p.lat!, longitude: p.lng! }));
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [listPlaces]);

  // Loggläget: hämta loggorna i förväg så de inte blinkar fram på kartan
  useEffect(() => {
    if (!logoMode) return;
    const uris = filtered.slice(0, 120).map(placeLogo).filter((l): l is NonNullable<typeof l> => !!l).map((l) => l.uri);
    if (uris.length) ExpoImage.prefetch(uris, "memory-disk").catch(() => {});
  }, [logoMode, filtered]);

  // ── Tärningen: blandar fram en slumpad plats bland de som syns ──
  const shuffleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(shuffleTimer.current), []);
  const surprise = useCallback(() => {
    if (selectedRef.current.shuffling) return;
    const pool = filteredRef.current.filter((p) => p.lat != null && p.lng != null);
    if (pool.length === 0) return;
    // Platsen den landar på bestäms direkt; sista bytet visar den, sen väljs den
    const final = pool[Math.floor(Math.random() * pool.length)];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    clearTimeout(shuffleTimer.current);
    setShuffling(true);
    setSelectedId(null);
    setSelectedService(null);
    setSelectedSticker(null);
    let step = 0;
    let last = -1;
    const tick = () => {
      step++;
      if (step >= SHUFFLE_STEPS) {
        setPreviewId(final.id);
        Haptics.selectionAsync().catch(() => {});
        shuffleTimer.current = setTimeout(() => {
          setPreviewId(null);
          setShuffling(false);
          selectPlace(final);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }, 300);
        return;
      }
      let pick = pool[Math.floor(Math.random() * pool.length)];
      if (pool.length > 2 && (pick.id === last || pick.id === final.id)) {
        pick = pool[(pool.indexOf(pick) + 1) % pool.length];
      }
      last = pick.id;
      setPreviewId(pick.id);
      Haptics.selectionAsync().catch(() => {});
      const t = step / SHUFFLE_STEPS;
      shuffleTimer.current = setTimeout(tick, 55 + Math.round(180 * t * t));
    };
    tick();
  }, [selectPlace]);

  // ── Handlingar ────────────────────────────────────────────────────────────
  const locate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (userLoc) fly(userLoc.latitude, userLoc.longitude, 14, 1000);
  };
  const navigateTo = useCallback((lat: number | null, lng: number | null) => {
    if (lat == null || lng == null) return;
    const url = Platform.OS === "ios" ? `maps://?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {}));
  }, []);
  const openPlace = useCallback((p: Place) => pushOnce(router, `/place/${p.id}`), [router]);
  const navigatePlace = useCallback((p: Place) => navigateTo(p.lat, p.lng), [navigateTo]);
  const distanceKm = useCallback((p: Place) => (
    userLoc && p.lat != null && p.lng != null ? distanceMeters(userLoc.latitude, userLoc.longitude, p.lat, p.lng) / 1000 : null
  ), [userLoc]);

  // ── Markörerna ────────────────────────────────────────────────────────────
  // Färdiga markörer sparas: en nål som står kvar är samma markör som förut, så den byggs aldrig
  // om. (Börjar om när platserna laddats om eller temat bytts.)
  const markerCache = useMemo(() => new Map<string, React.ReactElement>(), [places, dark]);
  const markers = useMemo(() => {
    if (!placesFetched) return null;
    const kept = (key: string, make: () => React.ReactElement) => {
      let el = markerCache.get(key);
      if (!el) {
        el = make();
        markerCache.set(key, el);
      }
      return el;
    };
    const treasureMarker = (c: Collectible) => {
      const found = collected.has(c.id);
      const sel = selectedSticker?.id === c.id;
      const key = `t${c.id}:${found ? 1 : 0}:${sel ? 1 : 0}`;
      return kept(key, () => (
        <Marker
          key={key}
          coordinate={{ latitude: c.lat, longitude: c.lng }}
          {...pinImage(treasurePinImage(found, sel))}
          anchor={PIN_ANCHOR}
          zIndex={sel ? 2000 : 4}
          tracksViewChanges={false}
          onPress={() => press.current.treasure(c.id)}
        />
      ));
    };
    const out: React.ReactNode[] = [];

    if (listPlaces) {
      // En vald lista: numrerade nålar i listans ordning och den streckade rutten
      if (listPlaces.length > 1) {
        out.push(
          <Polyline
            key="route"
            coordinates={listPlaces.map((p) => ({ latitude: p.lat!, longitude: p.lng! }))}
            strokeColor={GOLD}
            strokeWidth={2.5}
            lineDashPattern={[8, 7]}
          />,
        );
      }
      if (typeface) {
        listPlaces.forEach((p, i) => {
          const sel = p.id === selectedId;
          const icon = numberPinIcon(i + 1, sel, typeface);
          if (!icon) return;
          const key = `n${p.id}:${i}:${sel ? 1 : 0}`;
          out.push(kept(key, () => (
            <Marker
              key={key}
              coordinate={{ latitude: p.lat!, longitude: p.lng! }}
              {...pinImage(icon)}
              anchor={NUMBER_ANCHOR}
              zIndex={sel ? 30 : 5}
              tracksViewChanges={false}
              onPress={() => press.current.place(p.id)}
            />
          )));
        });
      }
    } else {
      for (const it of index ? clusterItems : plainItems) {
        if (it.kind === "cluster") {
          const icon = typeface ? clusterIcon(it.count, dark, typeface) : null;
          if (!icon) continue;
          out.push(kept(it.key, () => (
            <Marker
              key={it.key}
              coordinate={{ latitude: it.lat, longitude: it.lng }}
              {...pinImage(icon)}
              anchor={CENTER_ANCHOR}
              zIndex={10}
              tracksViewChanges={false}
              onPress={() => press.current.cluster(it.id, it.lat, it.lng)}
            />
          )));
          continue;
        }
        if (it.kind === "treasure") {
          const c = treasureById.get(it.id);
          if (c) out.push(treasureMarker(c));
          continue;
        }
        if (it.id === selectedId) continue;
        const p = placeById.get(it.id);
        if (!p) continue;
        const catId = findCategory(p.category)?.id;
        const logo = logoMode ? placeLogo(p) : null;
        out.push(logo
          ? kept(`l${p.id}`, () => (
            <ViewMarker key={`l${p.id}`} lat={p.lat!} lng={p.lng!} anchor={CENTER_ANCHOR} zIndex={1003} waitForImage onPress={() => press.current.place(p.id)}>
              {(ready) => <LogoMarker logo={logo} color={PIN_COLORS[catId ?? "other"]} onReady={ready} />}
            </ViewMarker>
          ))
          : kept(`p${p.id}`, () => (
            <Marker
              key={`p${p.id}`}
              coordinate={{ latitude: p.lat!, longitude: p.lng! }}
              {...pinImage(placePinImage(catId))}
              anchor={PIN_ANCHOR}
              zIndex={3}
              tracksViewChanges={false}
              onPress={() => press.current.place(p.id)}
            />
          )));
      }

      // Den valda platsen: guldnål som studsar in (eller loggan med guldkant i loggläget)
      const sel = selectedId != null ? placeById.get(selectedId) : undefined;
      if (sel?.lat != null && sel.lng != null) {
        const logo = logoMode ? placeLogo(sel) : null;
        const catId = findCategory(sel.category)?.id;
        out.push(logo ? (
          <ViewMarker key={`sel-l-${sel.id}`} lat={sel.lat} lng={sel.lng} anchor={CENTER_ANCHOR} zIndex={2000} waitForImage onPress={notePinPress}>
            {(ready) => <LogoMarker logo={logo} color={PIN_COLORS[catId ?? "other"]} selected onReady={ready} />}
          </ViewMarker>
        ) : (
          <ViewMarker key={`sel-${sel.id}`} lat={sel.lat} lng={sel.lng} anchor={SELECTED_ANCHOR} zIndex={2000} onPress={notePinPress}>
            <SelectedPin />
          </ViewMarker>
        ));
      }
    }

    // Skatter som inte ingår i klumparna (utan klumpar, eller med en vald lista)
    if (!index) shownTreasures.forEach((c) => out.push(treasureMarker(c)));
    shownServices.forEach((p) => {
      const sel = selectedService?.id === p.id;
      const key = `s${p.id}:${sel ? 1 : 0}`;
      out.push(kept(key, () => (
        <Marker
          key={key}
          coordinate={{ latitude: p.lat!, longitude: p.lng! }}
          {...pinImage(servicePinImage(sel))}
          anchor={PIN_ANCHOR}
          zIndex={sel ? 2000 : 2}
          tracksViewChanges={false}
          onPress={() => press.current.service(p.id)}
        />
      )));
    });
    return out;
  }, [
    placesFetched, markerCache, listPlaces, typeface, selectedId, index, clusterItems, plainItems, dark, treasureById,
    placeById, logoMode, notePinPress, shownTreasures, shownServices, selectedService, selectedSticker, collected,
  ]);

  // ── Korten ────────────────────────────────────────────────────────────────
  // Karusellens kort: under tärningen bara platsen den visar just nu, annars den valda platsen och
  // de närmaste (samma lista så länge man sveper — den byts bara när man väljer något nytt)
  const neighborPlaces = useMemo(
    () => neighbors.map((id) => placeById.get(id)).filter((p): p is Place => !!p),
    [neighbors, placeById],
  );
  const previewPlaces = useMemo(() => {
    const p = previewId != null ? placeById.get(previewId) : undefined;
    return p ? [p] : [];
  }, [previewId, placeById]);
  const carouselPlaces = shuffling ? previewPlaces : selectedId != null ? neighborPlaces : [];
  const carouselIndex = shuffling ? 0 : Math.max(0, neighbors.indexOf(selectedId ?? -1));
  const showCarousel = carouselPlaces.length > 0;
  const smallCard = !!selectedService || !!selectedSticker;
  const [smallCardH, setSmallCardH] = useState(0);
  const onSmallCardLayout = useCallback((e: LayoutChangeEvent) => setSmallCardH(Math.round(e.nativeEvent.layout.height)), []);

  // ── Layout ────────────────────────────────────────────────────────────────
  const headerTop = Math.max(insets.top, 44) + 18;
  const navTop = insets.bottom + NAV_H;
  const cardBottom = navTop + 12;

  // Kartans kant: överst under rubriken, nederst ovanför navigeringen eller kortet som är öppet.
  // Platsen man valt hamnar mitt i den fria ytan, och Googles logga (måste alltid synas) ovanför
  // korten. Kanten glider i takt med korten — ändrades den tvärt hoppade hela kartan.
  const padTop = headerTop + 44;
  const padBottom = showCarousel ? cardBottom + PLACE_CARD_H : smallCard ? cardBottom + (smallCardH || SMALL_CARD_EST) : navTop + 4;
  const padTopSV = useSharedValue(padTop);
  const padBottomSV = useSharedValue(padBottom);
  useEffect(() => { padTopSV.value = padTop; }, [padTop, padTopSV]);
  useEffect(() => { padBottomSV.value = withTiming(padBottom, PAD_ANIM); }, [padBottom, padBottomSV]);
  const mapAnimatedProps = useAnimatedProps(() => ({
    mapPadding: { top: padTopSV.value, right: 0, bottom: padBottomSV.value, left: 0 },
  }));

  const filterCount = countFilters(filters);
  const pills = activeFilters(filters, lists);

  // Ensam vald kategori med underkategorier: dropdown under pillerna
  const onlyCat = filters.cats.size === 1 ? [...filters.cats][0] : null;
  const subs = onlyCat ? SUBCATEGORIES[onlyCat] : undefined;

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <AnimatedMapView
        ref={mapRef as never}
        animatedProps={mapAnimatedProps}
        style={StyleSheet.absoluteFill}
        provider={MAP_PROVIDER}
        customMapStyle={MAP_IS_STYLEABLE ? (dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE) : undefined}
        mapType={MAP_IS_STYLEABLE ? "standard" : "mutedStandard"}
        userInterfaceStyle={dark ? "dark" : "light"}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}
        initialRegion={INIT_REGION}
        minZoomLevel={4}
        maxZoomLevel={18}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        onPress={onMapPress}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {markers}
      </AnimatedMapView>

      {/* Toning överst så rubriken och knapparna alltid syns mot kartan */}
      <LinearGradient
        pointerEvents="none"
        colors={dark
          ? ["rgba(0,0,0,1)", "rgba(0,0,0,0.8)", "rgba(0,0,0,0.4)", "rgba(0,0,0,0)"]
          : ["rgba(244,240,230,1)", "rgba(244,240,230,0.8)", "rgba(244,240,230,0.4)", "rgba(244,240,230,0)"]}
        locations={[0, 0.2, 0.5, 1]}
        style={[s.topFade, { height: headerTop + 120 }]}
      />

      {/* ── Rubrik, filterknapp, aktiva filter, underkategori ── */}
      <View style={[s.header, { paddingTop: headerTop }]} pointerEvents="box-none">
        <View style={s.headerRow} pointerEvents="box-none">
          <FilterButton count={filterCount} dark={dark} onPress={() => { Haptics.selectionAsync().catch(() => {}); setFilterOpen(true); }} />
          <View style={s.titleWrap} pointerEvents="none">
            <Text style={[s.title, { color: dark ? "#FFFFFF" : "#1A1A1A" }]}>KARTA</Text>
            <View style={[s.titleLine, { backgroundColor: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.25)" }]} />
          </View>
        </View>

        {pills.length > 0 && (
          <Reanimated.View layout={LinearTransition.duration(200)} style={s.pills} pointerEvents="box-none">
            {pills.map((p) => (
              <Reanimated.View key={p.key} entering={pillIn} exiting={pillOut} layout={LinearTransition.duration(200)}>
                <Pressable
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setFilters(p.remove(filters)); }}
                  style={[s.pill, { backgroundColor: dark ? "#121212" : "#FFFFFF" }]}
                >
                  <Text style={[s.pillText, { color: dark ? GOLD : "#8A6A2E" }]} numberOfLines={1}>{p.label}</Text>
                  <View style={s.pillX}><X size={10} color={GOLD} strokeWidth={2.5} /></View>
                </Pressable>
              </Reanimated.View>
            ))}
          </Reanimated.View>
        )}

        {subs && (
          <SubcategoryDropdown
            options={subs}
            value={filters.sub}
            dark={dark}
            onChange={(sub) => setFilters((f) => ({ ...f, sub }))}
          />
        )}
      </View>

      {/* ── Tärningen och "hitta mig" (göms när ett kort är öppet) ── */}
      <MapButtons
        visible={!showCarousel && !smallCard}
        locateBottom={navTop + 20}
        dark={dark}
        canSurprise={placesFetched && filtered.length > 0}
        shuffling={shuffling}
        onLocate={locate}
        onSurprise={surprise}
      />

      {/* ── Korten ── */}
      {showCarousel && (
        <>
          {fromMemoryParam && String(selectedId) === placeParam && !shuffling && (
            // Kom man hit från ett minne går det inte att svepa tillbaka dit (kartan är en flik), så
            // en egen väg tillbaka: först profilfliken, sen minnet ovanpå (se memories/[id], viaMap)
            <TouchableOpacity
              style={[s.backToMemory, { bottom: cardBottom + PLACE_CARD_H + 12, backgroundColor: dark ? "#1A1A1D" : "#FFFFFF" }]}
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
            places={carouselPlaces}
            index={carouselIndex}
            bottom={cardBottom}
            interactive={!shuffling}
            savedIds={favoriteIds}
            distanceKm={distanceKm}
            onIndexChange={onCarouselIndex}
            onOpen={openPlace}
            onNavigate={navigatePlace}
            onToggleSave={toggleSave}
            onBurst={showBurst}
            onClose={deselect}
          />
        </>
      )}

      {selectedService && (
        <Reanimated.View
          entering={cardIn}
          exiting={cardOut}
          onLayout={onSmallCardLayout}
          style={[s.serviceCard, { bottom: cardBottom, backgroundColor: dark ? "#141416" : "#FFFFFF", borderColor: colors.border }]}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <ServiceBadge type={selectedService.type} dark={dark} />
            <View style={{ flex: 1 }}>
              <Text style={[s.serviceType, { color: colors.muted }]}>
                {SERVICE_TYPES.find((t) => t.type === selectedService.type)?.label ?? selectedService.type}
              </Text>
              <Text style={[s.serviceName, { color: colors.text }]} numberOfLines={2}>{selectedService.name}</Text>
              {!!selectedService.description && (
                <Text style={[s.serviceDesc, { color: colors.muted }]} numberOfLines={2}>{selectedService.description}</Text>
              )}
            </View>
            <TouchableOpacity onPress={deselect} hitSlop={10}>
              <X size={18} color={colors.muted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[s.serviceNav, { borderColor: colors.borderStrong }]}
            activeOpacity={0.8}
            onPress={() => navigateTo(selectedService.lat, selectedService.lng)}
          >
            <Navigation size={15} color={colors.text} strokeWidth={2.2} />
            <Text style={[s.serviceNavText, { color: colors.text }]}>Navigera</Text>
          </TouchableOpacity>
        </Reanimated.View>
      )}

      {selectedSticker && (
        <StickerCard
          collectible={selectedSticker}
          collectedAt={collected.get(selectedSticker.id)}
          userLoc={userLoc}
          bottom={cardBottom}
          onClose={deselect}
          onLayout={onSmallCardLayout}
        />
      )}

      <MapFilterSheet
        open={filterOpen}
        filters={filters}
        onChange={setFilters}
        lists={lists}
        resultCount={filtered.length}
        onClose={() => setFilterOpen(false)}
      />
      <LikeBurst burst={burst} />
    </View>
  );
}

/**
 * En markör som ritas i appen (logga, vald nål). Google fångar den som bild medan
 * tracksViewChanges är på — en kort stund, eller tills bilden laddats — sen av, så kartan inte
 * ritar om den hela tiden.
 */
function ViewMarker({
  lat, lng, anchor, zIndex, waitForImage = false, onPress, children,
}: {
  lat: number; lng: number; anchor: { x: number; y: number }; zIndex: number; waitForImage?: boolean;
  onPress: () => void;
  children: React.ReactNode | ((ready: () => void) => React.ReactNode);
}) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTrack(false), waitForImage ? 1500 : 600);
    return () => clearTimeout(t);
  }, [waitForImage]);
  const ready = useCallback(() => { setTimeout(() => setTrack(false), 120); }, []);
  return (
    <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={anchor} zIndex={zIndex} tracksViewChanges={track} onPress={onPress}>
      {typeof children === "function" ? children(ready) : children}
    </Marker>
  );
}

/** Filterknappen med antalet valda filter (siffran poppar när den ändras) */
function FilterButton({ count, dark, onPress }: { count: number; dark: boolean; onPress: () => void }) {
  const pop = useSharedValue(1);
  const prev = useRef(count);
  useEffect(() => {
    if (count === prev.current) return;
    prev.current = count;
    pop.value = 0.4;
    pop.value = withSpring(1, { stiffness: 500, damping: 22 });
  }, [count, pop]);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { press.value = withTiming(0.95, { duration: 90 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 14, stiffness: 300 }); }}
      accessibilityLabel="Filter"
    >
      <Reanimated.View style={[s.filterBtn, pressStyle]}>
        <BlurView
          intensity={20}
          tint={dark ? "dark" : "light"}
          style={[
            StyleSheet.absoluteFill, s.filterBlur,
            { backgroundColor: dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)", borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" },
          ]}
        />
        <SlidersHorizontal size={18} color={dark ? "rgba(255,255,255,0.85)" : "#1A1A1A"} strokeWidth={2} />
        {count > 0 && (
          <Reanimated.View style={[s.badge, badgeStyle]}>
            <LinearGradient colors={["#D9B46A", "#B48A3B"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={s.badgeText}>{count}</Text>
          </Reanimated.View>
        )}
      </Reanimated.View>
    </Pressable>
  );
}

/** Tärningen och "hitta mig" nere till höger. Göms när ett kort är öppet */
function MapButtons({
  visible, locateBottom, dark, canSurprise, shuffling, onLocate, onSurprise,
}: {
  visible: boolean; locateBottom: number; dark: boolean; canSurprise: boolean; shuffling: boolean;
  onLocate: () => void; onSurprise: () => void;
}) {
  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => { shown.value = withTiming(visible ? 1 : 0, { duration: 200 }); }, [visible, shown]);
  const wrapStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 12 }] }));

  // Tärningen: snurrar och pulserar medan den blandar
  const spin = useSharedValue(0);
  const pulse = useSharedValue(1);
  const press = useSharedValue(1);
  useEffect(() => {
    if (shuffling) {
      spin.value = 0;
      spin.value = withRepeat(withTiming(360, { duration: 600, easing: Easing.linear }), -1, false);
      pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 400 }), withTiming(1, { duration: 400 })), -1, false);
    } else {
      cancelAnimation(spin);
      cancelAnimation(pulse);
      spin.value = withTiming(0, { duration: 200 });
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [shuffling, spin, pulse]);
  const diceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value * press.value }, { rotate: `${spin.value + (1 - press.value) * -200}deg` }],
    shadowOpacity: shuffling ? 0.7 : 0.45,
  }));
  const locatePress = useSharedValue(1);
  const locateStyle = useAnimatedStyle(() => ({ transform: [{ scale: locatePress.value }] }));

  return (
    <Reanimated.View style={[s.buttons, { bottom: locateBottom }, wrapStyle]} pointerEvents={visible ? "box-none" : "none"}>
      {canSurprise && (
        <Pressable
          onPress={onSurprise}
          disabled={shuffling}
          onPressIn={() => { press.value = withTiming(0.9, { duration: 90 }); }}
          onPressOut={() => { press.value = withSpring(1, { damping: 12, stiffness: 260 }); }}
          accessibilityLabel="Visa mig något"
        >
          <Reanimated.View style={[s.dice, diceStyle]}>
            <LinearGradient colors={["#C5A059", "#A97D33"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} />
            <Dices size={28} color="rgba(0,0,0,0.85)" strokeWidth={2.25} />
          </Reanimated.View>
        </Pressable>
      )}
      <Pressable
        onPress={onLocate}
        onPressIn={() => { locatePress.value = withTiming(0.95, { duration: 90 }); }}
        onPressOut={() => { locatePress.value = withSpring(1, { damping: 14, stiffness: 300 }); }}
        accessibilityLabel="Hitta min position"
      >
        <Reanimated.View style={[s.locate, locateStyle, { borderColor: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.07)" }]}>
          <BlurView intensity={20} tint={dark ? "dark" : "light"} style={[StyleSheet.absoluteFill, { borderRadius: 28, backgroundColor: dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.75)" }]} />
          <Locate size={28} color="#3B82F6" strokeWidth={2} />
        </Reanimated.View>
      </Pressable>
    </Reanimated.View>
  );
}

/** Underkategorierna för den enda valda kategorin. Valet markeras direkt och gäller när menyn stängt */
function SubcategoryDropdown({
  options, value, dark, onChange,
}: { options: { id: string; label: string }[]; value: string | null; dark: boolean; onChange: (sub: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [marked, setMarked] = useState<string | null>(value);
  useEffect(() => { setMarked(value); }, [value]);
  const rotate = useSharedValue(0);
  useEffect(() => { rotate.value = withTiming(open ? 180 : 0, { duration: 200 }); }, [open, rotate]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));
  const current = options.find((o) => o.id === value)?.label ?? "Alla";
  const all = [{ id: null as string | null, label: "Alla" }, ...options];

  const choose = (id: string | null) => {
    Haptics.selectionAsync().catch(() => {});
    setMarked(id);
    setTimeout(() => { setOpen(false); onChange(id); }, 180);
  };

  return (
    <View style={s.subWrap}>
      <Pressable
        onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen((o) => !o); }}
        style={[s.subBtn, { backgroundColor: dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.92)", borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]}
      >
        <Text style={[s.subBtnText, { color: dark ? "rgba(255,255,255,0.8)" : "#1A1A1A" }]}>{current}</Text>
        <Reanimated.View style={chevronStyle}>
          <ChevronDown size={12} color={dark ? "rgba(255,255,255,0.8)" : "#1A1A1A"} strokeWidth={2.4} />
        </Reanimated.View>
      </Pressable>
      {open && (
        <Reanimated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[s.subMenu, { backgroundColor: dark ? "#141416" : "#FFFFFF", borderColor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
        >
          {all.map((o, i) => {
            const on = marked === o.id;
            return (
              <Reanimated.View key={o.id ?? "all"} entering={FadeInDown.delay(i * 30).duration(200)}>
                <Pressable
                  onPress={() => choose(o.id)}
                  style={[s.subRow, i > 0 && { borderTopWidth: 1, borderTopColor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)" }]}
                >
                  {on && (
                    <LinearGradient
                      colors={["rgba(197,160,89,0.2)", "rgba(197,160,89,0.05)"]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text style={[s.subRowText, { color: on ? GOLD : dark ? "rgba(255,255,255,0.8)" : "#1A1A1A" }, on && { fontFamily: "Inter_600SemiBold" }]}>
                    {o.label}
                  </Text>
                  {on && <View style={s.subDot} />}
                </Pressable>
              </Reanimated.View>
            );
          })}
        </Reanimated.View>
      )}
    </View>
  );
}

/** Servicetypens ikon i kortet */
function ServiceBadge({ type, dark }: { type: string; dark: boolean }) {
  const Icon = serviceIcon(type);
  return (
    <View style={[s.serviceBadge, { backgroundColor: dark ? "#F5F1E8" : "#2A2A2A" }]}>
      <Icon size={18} color={dark ? "#1A1A1A" : "#F5F1E8"} strokeWidth={2.2} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topFade: { position: "absolute", top: 0, left: 0, right: 0 },
  header: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  headerRow: { height: 44, flexDirection: "row", alignItems: "center" },
  titleWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 6 },
  title: {
    fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
  },
  titleLine: { width: 40, height: 2, borderRadius: 1 },
  filterBtn: {
    width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  filterBlur: { borderRadius: 16, overflow: "hidden", borderWidth: 1 },
  badge: {
    position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, overflow: "hidden",
    alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#0A0A0A",
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 10.5, color: "#0A0A0A" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 12, paddingRight: 8, paddingVertical: 6,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(197,160,89,0.55)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  pillText: { fontFamily: "Inter_500Medium", fontSize: 12, maxWidth: 200 },
  pillX: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(197,160,89,0.18)" },
  subWrap: { marginTop: 8, alignSelf: "flex-start", zIndex: 5 },
  subBtn: {
    height: 36, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1,
  },
  subBtnText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  subMenu: {
    position: "absolute", top: 44, minWidth: 180, borderRadius: 16, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  subRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  subRowText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  subDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD,
    shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  buttons: { position: "absolute", right: 12, gap: 32, alignItems: "center" },
  dice: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: GOLD, borderWidth: 1, borderColor: "rgba(0,0,0,0.2)",
    shadowColor: GOLD, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, elevation: 10,
  },
  locate: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  backToMemory: {
    position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6,
    height: 36, paddingHorizontal: 14, borderRadius: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  backToMemoryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  serviceCard: {
    position: "absolute", left: 12, right: 12, borderRadius: 22, padding: 16, gap: 14, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
  },
  serviceBadge: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  serviceType: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.3 },
  serviceName: { fontFamily: "Montserrat_700Bold", fontSize: 17, marginTop: 3 },
  serviceDesc: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  serviceNav: {
    height: 44, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  serviceNavText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
