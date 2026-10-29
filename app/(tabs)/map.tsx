/**
 * Karta — byggd efter webbappens karta (native-map-full-spec.md), på en svartvit Google-karta i
 * appens tema (mapStyle.ts).
 *
 * - Nålar i temats färg (svarta i mörkt läge, vita i ljust) med kategorins färg som prick; skatterna
 *   kryss som på en skattkarta (grått = ej hittad, grönt = hittad). Den valda platsen blir en guldnål som studsar in. Med en kategori vald visas
 *   platserna som sina loggor. Nålar som skulle hamna nästan ovanpå varandra slås ihop till
 *   klumpar i samma färger (se lib/mapFilters). En klump som inte går att zooma isär (platserna
 *   ligger på samma ställe) visar platsernas kort direkt.
 * - Filter (MapFilterSheet): kategorier (+ underkategori), praktiskt, Mina, listor, skatter.
 *   Aktiva filter syns som piller under rubriken. Navigeringen glider undan medan arket är uppe.
 * - Serviceläget: väljer man en servicetyp (toaletter, laddning …) visar kartan bara den, och
 *   kameran visar de närmaste. En servicepunkt har ett eget infokort, inga platskort.
 * - Platskorten (PlaceCarousel): den valda platsen och de närmaste — svep mellan dem, dra upp =
 *   platssidan, dra ner = stäng. Tärningen blandar fram en slumpad plats bland de som syns.
 * - En vald lista: platserna numreras i listans ordning med rutten emellan.
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
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useTypeface } from "@shopify/react-native-skia";
import { Inter_700Bold } from "@expo-google-fonts/inter";
import Reanimated, {
  Easing, LinearTransition, cancelAnimation,
  useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import Supercluster from "supercluster";
import { ArrowLeft, ChevronDown, Dices, Locate, Navigation, Phone, SlidersHorizontal, X } from "lucide-react-native";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { useCollectibles, useCollected, type Collectible } from "@/hooks/useCollectibles";
import { useAllServicePoints, type ServicePoint } from "@/hooks/useServicePoints";
import { useLists, useList } from "@/hooks/useLists";
import { useVisits } from "@/hooks/useVisits";
import { savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { useTheme } from "@/theme/ThemeProvider";
import { distanceMeters } from "@/lib/checkin";
import { setNavHidden } from "@/lib/navVisibility";
import { careHours, splitRange } from "@/lib/serviceHours";
import { pushOnce } from "@/lib/navigateOnce";
import {
  CLUSTER, EMPTY_FILTERS, countFilters, distanceLabel, filterPlaces, type MapFilters,
} from "@/lib/mapFilters";
import { TreasureCards } from "@/components/stickers/StickerCard";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import {
  CENTER_ANCHOR, LogoMarker, PIN_ANCHOR, PIN_COLORS, SELECTED_ANCHOR, SelectedPin,
  pinImage, placeLogo, placePinImage, serviceIcon, servicePinImage, serviceType, treasurePinImage,
} from "@/components/map/MapPins";
import { NUMBER_ANCHOR, clusterIcon, numberPinIcon, shuffleDotIcon, systemBoldTypeface } from "@/components/map/mapIcons";
import { PlaceCarousel, PLACE_CARD_H, cardIn, cardOut } from "@/components/map/PlaceCard";
import { MapFilterSheet, activeFilters } from "@/components/map/MapFilterSheet";
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_IS_STYLEABLE, MAP_PROVIDER } from "@/components/map/mapStyle";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { SUBCATEGORIES, findCategory, subcategoryLabel } from "@/theme/categories";

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
const NONE: never[] = [];
const NO_COLLECTED = new Map<string, string>();

const AnimatedMapView = Reanimated.createAnimatedComponent(MapView);

/** En punkt i klumparna: en plats, en skatt eller en servicepunkt */
type Pt = { k: "p"; id: number } | { k: "t"; id: string } | { k: "s"; id: string };
/** Det som syns på kartan (det valda ritas för sig) */
type Item =
  | { kind: "place"; id: number; key: string }
  | { kind: "treasure"; id: string; key: string }
  | { kind: "service"; id: string; key: string }
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
  useTranslation(); // ritas om när språket byts
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sticker: stickerParam, place: placeParam, from: fromMemoryParam, at: targetAt } =
    useLocalSearchParams<{ sticker?: string; place?: string; from?: string; at?: string }>();
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

  // Tomt medan något laddas: alltid samma tomma lista (en ny vid varje uppritning fick klumparna
  // att räknas om, sidan att ritas om, och så vidare i en oändlig loop)
  const { data: places = NONE as Place[], isFetched: placesFetched } = usePlaces();
  const { data: collectibles = NONE as Collectible[] } = useCollectibles();
  const { data: collected = NO_COLLECTED } = useCollected();
  const { data: servicePoints = NONE as ServicePoint[] } = useAllServicePoints();
  const { data: lists = NONE as NonNullable<ReturnType<typeof useLists>["data"]> } = useLists();
  const { data: visits = NONE as NonNullable<ReturnType<typeof useVisits>["data"]> } = useVisits();
  const { data: favorites = NONE as NonNullable<ReturnType<typeof useFavorites>["data"]> } = useFavorites();

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

  // Serviceläget: bara den valda servicetypen syns — inga platser, inga skatter
  const serviceMode = filters.service != null;

  const filtered = useMemo(() => {
    if (filters.service) return [];
    // Hjärtan som trycks här ändrar inte vad som syns förrän man lämnat kartan (annars hoppar nålar)
    return filterPlaces(places, filters, { favoriteIds: serverSaved, visitedIds, listPlaceIds });
  }, [places, filters, serverSaved, visitedIds, listPlaceIds]);
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  // En enda vald lista: platserna i listans ordning (bland de som syns med övriga filter)
  const listPlaces = useMemo(() => {
    if (!singleListId || !listDetail || filters.service) return null;
    const shown = new Set(filtered.map((p) => p.id));
    return listDetail.places
      .map((lp) => placeById.get(lp.place.id))
      .filter((p): p is Place => !!p && shown.has(p.id));
  }, [singleListId, listDetail, placeById, filtered, filters.service]);
  const listRef = useRef(listPlaces);
  listRef.current = listPlaces;

  const shownTreasures = useMemo(() => {
    if (filters.service || !filters.treasures) return [];
    return collectibles;
  }, [collectibles, filters.treasures]);
  // En plats som också är en skatt visas som skattens kryss
  const treasurePlaceIds = useMemo(
    () => new Set(shownTreasures.map((c) => c.placeId).filter((id): id is number => id != null)),
    [shownTreasures],
  );
  const shownTreasuresRef = useRef(shownTreasures);
  shownTreasuresRef.current = shownTreasures;
  const shownServices = useMemo(() => {
    const type = filters.service?.toLowerCase();
    if (!type) return [];
    return servicePoints.filter((p) => p.type.trim().toLowerCase() === type && p.lat != null && p.lng != null);
  }, [servicePoints, filters.service]);
  const serviceRef = useRef(shownServices);
  serviceRef.current = shownServices;

  const logoMode = filters.cats.size > 0 && !listPlaces && !serviceMode;

  // ── Klumpar: platser och servicepunkter (aldrig skatterna) — inte med en vald lista ──
  const index = useMemo(() => {
    if (listPlaces) return null;
    const sc = new Supercluster<Pt>({
      radius: logoMode ? CLUSTER.logoRadius : CLUSTER.radius,
      minPoints: CLUSTER.minPoints,
      maxZoom: CLUSTER.maxZoom,
      extent: 256,
    });
    const points: Supercluster.PointFeature<Pt>[] = [];
    for (const p of filtered) {
      if (treasurePlaceIds.has(p.id)) continue;
      points.push({ type: "Feature", properties: { k: "p", id: p.id }, geometry: { type: "Point", coordinates: [p.lng!, p.lat!] } });
    }
    for (const p of shownServices) {
      points.push({ type: "Feature", properties: { k: "s", id: p.id }, geometry: { type: "Point", coordinates: [p.lng!, p.lat!] } });
    }
    sc.load(points);
    return sc;
  }, [listPlaces, logoMode, filtered, treasurePlaceIds, shownServices]);
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
        // Platsen ingår i nyckeln: samma klump-id kan betyda en annan klump när filtren ändrats
        return { kind: "cluster", id: props.cluster_id!, count, lat, lng, key: `c${props.cluster_id}:${count}:${lat.toFixed(5)}:${lng.toFixed(5)}` };
      }
      if (props.k === "t") return { kind: "treasure", id: props.id as string, key: `t${props.id}` };
      if (props.k === "s") return { kind: "service", id: props.id as string, key: `s${props.id}` };
      return { kind: "place", id: props.id as number, key: `p${props.id}` };
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

  // Skatterna man kan svepa mellan från en öppnad skatt: de närmaste runt den
  const [treasureNeighbors, setTreasureNeighbors] = useState<string[]>([]);
  const openSticker = useCallback((c: Collectible, keepNeighbors = false) => {
    setSelectedId(null);
    setSelectedService(null);
    setSelectedSticker(c);
    const cardsOpen = selectedRef.current.selectedSticker != null;
    if (!keepNeighbors) {
      setTreasureNeighbors((prev) => (cardsOpen && prev.includes(c.id) ? prev : shownTreasuresRef.current
        .map((t) => ({ id: t.id, d: distanceMeters(c.lat, c.lng, t.lat, t.lng) }))
        .sort((a, b) => a.d - b.d)
        .map((t) => t.id)));
    }
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
    service: (_id: string) => {},
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
    // Klump: zooma in tills den delar på sig. Ligger platserna i stort sett på samma ställe (går
    // inte att zooma isär) visas deras kort direkt, så man kan svepa mellan dem
    cluster: (id, lat, lng) => {
      notePinPress();
      Haptics.selectionAsync().catch(() => {});
      const idx = indexRef.current;
      let zoom = zoomOf(regionRef.current) + 2;
      try { zoom = idx?.getClusterExpansionZoom(id) ?? zoom; } catch { return; /* klumpen hör till gamla filter */ }
      if (idx && zoom > CLUSTER.maxZoom) {
        const ids = idx.getLeaves(id, Infinity)
          .map((leaf) => leaf.properties as Pt)
          .flatMap((pt) => (pt.k === "p" ? [pt.id] : []));
        const first = ids.length > 0 ? placeById.get(ids[0]) : undefined;
        if (first) {
          setSelectedService(null);
          setSelectedSticker(null);
          setNeighbors(ids);
          setSelectedId(first.id);
        }
      }
      fly(lat, lng, Math.min(zoom, 18), 500);
    },
  };

  // Kommer man hit med ett mål (en skatt från Mitt Österlen, en plats från ett minne) väljs det och
  // kartan flyger dit och zoomar in. Kameran tar inte emot något förrän kartan är redo (onMapReady),
  // så målet väntar in den — annars valdes platsen men kartan stod kvar där den var.
  const mapReady = useRef(false);
  const pendingTarget = useRef<(() => void) | null>(null);
  const goToTarget = useCallback(() => {
    const target = stickerParam
      ? collectibles.find((x) => x.id === stickerParam)
      : placeParam ? places.find((x) => String(x.id) === placeParam) : undefined;
    if (!target) return;
    const run = () => (stickerParam ? openSticker(target as Collectible) : selectPlace(target as Place));
    if (mapReady.current) run();
    else pendingTarget.current = run;
  // targetAt: när man tryckte (samma mål två gånger i rad är då ändå ett nytt mål)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickerParam, placeParam, targetAt, collectibles, places, openSticker, selectPlace]);
  useEffect(() => { goToTarget(); }, [goToTarget]);
  const onMapReady = useCallback(() => {
    mapReady.current = true;
    const run = pendingTarget.current;
    pendingTarget.current = null;
    // En bildruta så att kartans första läge hunnit sättas innan den flyger
    if (run) requestAnimationFrame(run);
  }, []);

  // Varje gång man går in på fliken: kartan runt mig (om man inte kom hit med ett mål). När man
  // lämnar den: filterarket stängs och resten av appen får veta om hjärtan man tryckt på.
  // Kommer man TILLBAKA från en sida som öppnats ovanpå kartan (en plats via kortet, Mitt
  // Österlen …) står allt kvar som det var: vald plats, kortet och var kartan tittar. Det märks
  // på att kartan fortfarande var den valda fliken när den lämnades.
  const tabNavigation = useNavigation();
  const route = useRoute();
  const keepOnReturn = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (keepOnReturn.current) {
        keepOnReturn.current = false;
      } else if (!placeParam && !stickerParam) {
        setSelectedId(null);
        setSelectedSticker(null);
        setSelectedService(null);
        if (userLocRef.current) fly(userLocRef.current.latitude, userLocRef.current.longitude, 13, 800);
      }
      return () => {
        const tabs = tabNavigation.getState();
        keepOnReturn.current = !!tabs && tabs.routes[tabs.index]?.key === route.key;
        setFilterOpen(false);
        if (overridesRef.current.size === 0) return;
        queryClient.invalidateQueries({ queryKey: ["favorites"] }).then(() => setSavedOverrides(new Map()));
      };
    }, [placeParam, stickerParam, queryClient, fly, tabNavigation, route.key]),
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

  // En vald lista: zooma så hela rutten syns (utöver kartans egen kant under rubriken och ovanför
  // navigeringen). Bara när listans platser faktiskt ändrats — inte varje gång sidan ritas om
  const listKey = listPlaces?.map((p) => p.id).join(",") ?? "";
  useEffect(() => {
    const list = listRef.current;
    if (!listKey || !list) return;
    const coords = list.map((p) => ({ latitude: p.lat!, longitude: p.lng! }));
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [listKey]);

  // Serviceläget: kameran visar de närmaste punkterna och var jag är (vet appen inte var jag är:
  // alla punkterna). En gång per vald typ
  const fittedService = useRef<string | null>(null);
  useEffect(() => {
    const type = filters.service;
    if (!type) { fittedService.current = null; return; }
    if (fittedService.current === type || shownServices.length === 0) return;
    const t = setTimeout(() => {
      fittedService.current = type;
      const me = userLocRef.current;
      const points = shownServices.map((p) => ({ latitude: p.lat!, longitude: p.lng! }));
      const coords = me
        ? [...points]
          .sort((a, b) => distanceMeters(me.latitude, me.longitude, a.latitude, a.longitude)
            - distanceMeters(me.latitude, me.longitude, b.latitude, b.longitude))
          .slice(0, 3)
          .concat(me)
        : points;
      if (coords.length === 1) fly(coords[0].latitude, coords[0].longitude, 14, 800);
      else mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 70, right: 60, bottom: 60, left: 60 }, animated: true });
    }, 250);
    return () => clearTimeout(t);
  }, [filters.service, shownServices, fly]);

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
  const openPlace = useCallback((p: Place) => pushOnce(router, `/place/${p.id}?from=map`), [router]);
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
          {...pinImage(treasurePinImage(found, sel, dark))}
          anchor={CENTER_ANCHOR}
          zIndex={sel ? 2000 : 4}
          tracksViewChanges={false}
          onPress={() => press.current.treasure(c.id)}
        />
      ));
    };
    const out: React.ReactNode[] = [];

    if (listPlaces) {
      // En vald lista: numrerade nålar i listans ordning och rutten emellan. Hel linje: en streckad
      // linje mäts i meter på iPhone (8 m streck) — tusentals små streck som fick kartan att lagga
      if (listPlaces.length > 1) {
        out.push(
          <Polyline
            key="route"
            coordinates={listPlaces.map((p) => ({ latitude: p.lat!, longitude: p.lng! }))}
            strokeColor={GOLD}
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
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
      for (const it of clusterItems) {
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
        if (it.kind === "service") {
          const p = serviceById.get(it.id);
          if (!p || p.id === selectedService?.id) continue;
          out.push(kept(it.key, () => (
            <Marker
              key={it.key}
              coordinate={{ latitude: p.lat!, longitude: p.lng! }}
              {...pinImage(servicePinImage(p.type, dark))}
              anchor={PIN_ANCHOR}
              zIndex={3}
              tracksViewChanges={false}
              onPress={() => press.current.service(p.id)}
            />
          )));
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
              {...pinImage(placePinImage(catId, dark))}
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

    // Tärningen blandar: en lysande prick hoppar mellan platserna den visar (kameran står still)
    const preview = shuffling && previewId != null ? placeById.get(previewId) : undefined;
    const dot = preview?.lat != null && preview.lng != null ? shuffleDotIcon() : null;
    if (preview && dot) {
      out.push(
        <Marker
          key="shuffle-dot"
          coordinate={{ latitude: preview.lat!, longitude: preview.lng! }}
          {...pinImage(dot)}
          anchor={CENTER_ANCHOR}
          zIndex={2500}
          tracksViewChanges={false}
        />,
      );
    }
    // Skatterna ingår aldrig i klumparna — de syns alltid var för sig
    shownTreasures.forEach((c) => out.push(treasureMarker(c)));
    // Den valda servicepunkten: guldnålen, som en vald plats
    if (selectedService?.lat != null && selectedService.lng != null) {
      out.push(
        <ViewMarker key={`sel-s-${selectedService.id}`} lat={selectedService.lat} lng={selectedService.lng} anchor={SELECTED_ANCHOR} zIndex={2000} onPress={notePinPress}>
          <SelectedPin />
        </ViewMarker>,
      );
    }
    return out;
  }, [
    placesFetched, markerCache, listPlaces, typeface, selectedId, index, clusterItems, dark, treasureById, serviceById,
    placeById, logoMode, notePinPress, shownTreasures, selectedService, selectedSticker, collected, shuffling, previewId,
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
  const onTreasureHeight = useCallback((h: number) => setSmallCardH(Math.round(h)), []);
  const treasureCards = useMemo(
    () => treasureNeighbors.map((id) => treasureById.get(id)).filter((c): c is Collectible => !!c),
    [treasureNeighbors, treasureById],
  );
  const onTreasureIndex = useCallback((i: number) => {
    const next = treasureCards[i];
    if (next) openSticker(next, true);
  }, [treasureCards, openSticker]);
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
  // Filterarkets knapp: det som syns just nu
  const chosenService = filters.service ? serviceType(filters.service) : undefined;
  const applyLabel = chosenService
    ? i18n.t("map.showServices", { count: shownServices.length, what: shownServices.length === 1 ? chosenService.one : chosenService.many })
    : i18n.t(filtered.length === 1 ? "map.showPlacesOne" : "map.showPlacesOther", { count: filtered.length });
  const pills = activeFilters(filters, lists);

  // Ensam vald kategori med underkategorier: dropdown under pillerna
  const onlyCat = filters.cats.size === 1 && !serviceMode ? [...filters.cats][0] : null;
  const subs = onlyCat ? SUBCATEGORIES[onlyCat].map((v) => ({ id: v, label: subcategoryLabel(v) })) : undefined;

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <AnimatedMapView
        ref={mapRef as never}
        onMapReady={onMapReady}
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
            <Text style={[s.title, { color: dark ? "#FFFFFF" : "#1A1A1A" }]}>{i18n.t("map.title")}</Text>
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
                router.push("/(tabs)/profile");
                router.push({ pathname: "/memories/[id]", params: { id: fromMemoryParam, viaMap: "1" } });
              }}
            >
              <ArrowLeft size={14} color={colors.text} strokeWidth={2.2} />
              <Text style={[s.backToMemoryText, { color: colors.text }]}>{i18n.t("map.backToMemory")}</Text>
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
        <ServiceCard
          point={selectedService}
          bottom={cardBottom}
          dark={dark}
          birdKm={userLoc && selectedService.lat != null && selectedService.lng != null
            ? distanceMeters(userLoc.latitude, userLoc.longitude, selectedService.lat, selectedService.lng) / 1000
            : null}
          onNavigate={() => navigateTo(selectedService.lat, selectedService.lng)}
          onClose={deselect}
          onLayout={onSmallCardLayout}
        />
      )}

      {selectedSticker && treasureCards.length > 0 && (
        <TreasureCards
          treasures={treasureCards}
          index={Math.max(0, treasureNeighbors.indexOf(selectedSticker.id))}
          bottom={cardBottom}
          userLoc={userLoc}
          collected={collected}
          onIndexChange={onTreasureIndex}
          onClose={deselect}
          onHeight={onTreasureHeight}
        />
      )}

      <MapFilterSheet
        open={filterOpen}
        filters={filters}
        onChange={setFilters}
        lists={lists}
        applyLabel={applyLabel}
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
      accessibilityLabel={i18n.t("map.filter")}
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
    shadowOpacity: shuffling ? 0.4 : 0.22,
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
          accessibilityLabel={i18n.t("map.surprise")}
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
        accessibilityLabel={i18n.t("map.locate")}
      >
        <Reanimated.View style={[s.locate, locateStyle, { borderColor: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.07)" }]}>
          <BlurView intensity={20} tint={dark ? "dark" : "light"} style={[StyleSheet.absoluteFill, { borderRadius: 28, backgroundColor: dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.75)" }]} />
          <Locate size={28} color="#3B82F6" strokeWidth={2} />
        </Reanimated.View>
      </Pressable>
    </Reanimated.View>
  );
}

/**
 * Underkategorierna för den enda valda kategorin. Knappen är av frostat glas som filterknappen.
 * Menyn finns hela tiden (byggs inte om vid varje tryck) och glider bara fram och tillbaka. Valet
 * markeras direkt och gäller när menyn stängt.
 */
function SubcategoryDropdown({
  options, value, dark, onChange,
}: { options: { id: string; label: string }[]; value: string | null; dark: boolean; onChange: (sub: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [marked, setMarked] = useState<string | null>(value);
  useEffect(() => { setMarked(value); }, [value]);
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(open ? 1 : 0, { duration: open ? 200 : 150, easing: Easing.out(Easing.cubic) });
  }, [open, shown]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${shown.value * 180}deg` }] }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * -6 }, { scale: 0.97 + shown.value * 0.03 }],
  }));
  const current = options.find((o) => o.id === value)?.label ?? i18n.t("map.all");
  const all = [{ id: null as string | null, label: i18n.t("map.all") }, ...options];
  const fg = dark ? "rgba(255,255,255,0.85)" : "#1A1A1A";

  const choose = (id: string | null) => {
    Haptics.selectionAsync().catch(() => {});
    setMarked(id);
    setTimeout(() => { setOpen(false); onChange(id); }, 180);
  };

  return (
    <View style={s.subWrap}>
      <Pressable
        onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen((o) => !o); }}
        style={[s.subBtn, { borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" }]}
      >
        <BlurView
          intensity={20}
          tint={dark ? "dark" : "light"}
          style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)" }]}
        />
        <Text style={[s.subBtnText, { color: fg }]}>{current}</Text>
        <Reanimated.View style={chevronStyle}>
          <ChevronDown size={12} color={fg} strokeWidth={2.4} />
        </Reanimated.View>
      </Pressable>
      <Reanimated.View
        pointerEvents={open ? "auto" : "none"}
        style={[s.subMenu, menuStyle, { backgroundColor: dark ? "#141416" : "#FFFFFF", borderColor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}
      >
        {all.map((o, i) => {
          const on = marked === o.id;
          return (
            <Pressable
              key={o.id ?? "all"}
              onPress={() => choose(o.id)}
              style={[
                s.subRow,
                on && { backgroundColor: "rgba(197,160,89,0.14)" },
                i > 0 && { borderTopWidth: 1, borderTopColor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)" },
              ]}
            >
              <Text style={[s.subRowText, { color: on ? GOLD : fg }, on && { fontFamily: "Inter_600SemiBold" }]}>
                {o.label}
              </Text>
              {on && <View style={s.subDot} />}
            </Pressable>
          );
        })}
      </Reanimated.View>
    </View>
  );
}

/**
 * En servicepunkts infokort (inga platskort — en toalett eller laddstation har ingen platssida):
 * typ och avstånd, namn, adress, beskrivning, och knapparna Ring (om det finns ett nummer) och
 * Navigera.
 */
function ServiceCard({
  point, bottom, dark, birdKm, onNavigate, onClose, onLayout,
}: {
  point: ServicePoint; bottom: number; dark: boolean; birdKm: number | null;
  onNavigate: () => void; onClose: () => void; onLayout: (e: LayoutChangeEvent) => void;
}) {
  const { colors } = useTheme();
  const type = serviceType(point.type);
  const Icon = serviceIcon(point.type);
  const iconColor = dark ? GOLD : "#8A6A2E";
  // Laddstationernas beskrivningar har kommatecken mellan allt (samma städning som Sök gör)
  const raw = point.description ?? point.short_description;
  const description = raw && type?.key === "laddning" ? raw.replace(/,/g, "") : raw;
  const phone = point.phone?.trim();
  return (
    <Reanimated.View
      entering={cardIn}
      exiting={cardOut}
      onLayout={onLayout}
      style={[s.serviceCard, { bottom, backgroundColor: dark ? "#141416" : "#FFFFFF", borderColor: colors.border }]}
    >
      <View style={s.serviceHead}>
        <View style={[s.serviceBadge, { backgroundColor: dark ? "rgba(197,160,89,0.16)" : "rgba(138,106,46,0.12)" }]}>
          <Icon size={20} color={iconColor} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.serviceType, { color: iconColor }]}>
            {(type?.one ?? point.type).toUpperCase()}{birdKm != null ? `  ·  ${distanceLabel(birdKm)}` : ""}
          </Text>
          <Text style={[s.serviceName, { color: colors.text }]} numberOfLines={2}>{point.name}</Text>
          {!!point.address && <Text style={[s.serviceAddr, { color: colors.muted }]} numberOfLines={1}>{point.address}</Text>}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel={i18n.t("map.close")}>
          <X size={18} color={colors.muted} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      {!!description && <ServiceText typeKey={type?.key} text={description} />}
      <View style={s.serviceActions}>
        {!!phone && (
          <TouchableOpacity
            style={[s.serviceBtn, { backgroundColor: colors.fill, borderColor: colors.borderStrong }]}
            activeOpacity={0.8}
            onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, "")}`).catch(() => {})}
          >
            <Phone size={16} color={colors.text} strokeWidth={2.2} />
            <Text style={[s.serviceBtnText, { color: colors.text }]}>{i18n.t("map.call")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.serviceBtn, s.serviceGo]} activeOpacity={0.85} onPress={onNavigate}>
          <LinearGradient colors={["#C5A059", "#B08A3E"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
          <Navigation size={16} color="#121212" strokeWidth={2.4} />
          <Text style={[s.serviceBtnText, { color: "#121212", fontFamily: "Inter_700Bold" }]}>{i18n.t("map.navigate")}</Text>
        </TouchableOpacity>
      </View>
    </Reanimated.View>
  );
}

const OPEN = "#4ADE80";
const CLOSED = "#F87171";

/**
 * Servicepunktens text. AutoMat: tiden ("05-23") grön när det är öppet, röd när det är stängt.
 * Vård ("08-15, stängt, (Stängt)" = vardagar, lördag, söndag): de tre dagarna på var sin rad, och
 * dagens rad tydlig — grön om det är öppet just nu, röd annars.
 */
function ServiceText({ typeKey, text }: { typeKey: string | undefined; text: string }) {
  const { colors } = useTheme();
  if (typeKey === "vard") {
    const days = careHours(text);
    if (days) {
      return (
        <View style={s.hours}>
          {days.map((d) => {
            const tint = d.today ? (d.open ? OPEN : CLOSED) : colors.muted;
            return (
              <View key={d.label} style={s.hoursRow}>
                <Text style={[s.hoursDay, { color: d.today ? colors.text : colors.muted }, d.today && s.hoursToday]}>
                  {d.label}{d.today ? ` ${i18n.t("map.today")}` : ""}
                </Text>
                <Text style={[s.hoursTime, { color: tint }, d.today && s.hoursToday]}>
                  {d.text === "stängt" ? i18n.t("map.closed") : d.text}
                </Text>
              </View>
            );
          })}
        </View>
      );
    }
  }
  if (typeKey === "automat") {
    const parts = splitRange(text);
    if (parts) {
      return (
        <Text style={[s.serviceDesc, { color: colors.muted }]} numberOfLines={3}>
          {parts.before}
          <Text style={[s.hoursToday, { color: parts.open ? OPEN : CLOSED }]}>{parts.range}</Text>
          {parts.after}
          <Text style={[s.hoursToday, { color: parts.open ? OPEN : CLOSED }]}>{`  · ${i18n.t(parts.open ? "map.openNow" : "map.closedNow")}`}</Text>
        </Text>
      );
    }
  }
  return <Text style={[s.serviceDesc, { color: colors.muted }]} numberOfLines={3}>{text}</Text>;
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
  // Inget zIndex: det lyfte menyn ovanför filterarket
  subWrap: { marginTop: 8, alignSelf: "flex-start" },
  subBtn: {
    height: 36, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1,
    overflow: "hidden",
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
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 5,
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
  serviceHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  serviceBadge: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  serviceType: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2 },
  serviceName: { fontFamily: "Montserrat_700Bold", fontSize: 17, marginTop: 4 },
  serviceAddr: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 3 },
  serviceDesc: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 19 },
  serviceActions: { flexDirection: "row", gap: 8 },
  hours: { gap: 6 },
  hoursRow: { flexDirection: "row", justifyContent: "space-between" },
  hoursDay: { fontFamily: "Inter_400Regular", fontSize: 13.5 },
  hoursTime: { fontFamily: "Inter_500Medium", fontSize: 13.5, fontVariant: ["tabular-nums"] },
  hoursToday: { fontFamily: "Inter_700Bold" },
  serviceBtn: {
    flex: 1, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  serviceGo: { borderWidth: 0, overflow: "hidden" },
  serviceBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
