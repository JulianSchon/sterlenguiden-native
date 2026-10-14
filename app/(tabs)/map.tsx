/**
 * Karta — byggd efter webbappens karta (native-map-full-spec.md), på en svartvit Google-karta i
 * appens tema (mapStyle.ts).
 *
 * - Nålar i kategoriernas färger; den valda platsen blir en guldnål som studsar in. Med en kategori
 *   vald visas platserna som sina loggor. Många platser nära varandra slås ihop till klumpar
 *   (webbens regler, se lib/mapFilters).
 * - Filter (MapFilterSheet): kategorier (+ underkategori), praktiskt, Mina, listor, service,
 *   skatter. Aktiva filter syns som piller under rubriken.
 * - Platskortet (PlaceCard): dra upp = platssidan, dra ner = stäng, svep åt sidan = nästa
 *   närmaste plats. Tärningen blandar fram en slumpad plats bland de som syns.
 * - En vald lista: platserna numreras i listans ordning med en streckad rutt emellan.
 * - Kommer man hit med ?place= (från ett minne) eller ?sticker= (Hem, Mitt Österlen) visas den
 *   platsen/skatten direkt; annars visas kartan runt mig varje gång man går in på fliken.
 *
 * Snabbhet: vanliga nålar är färdiga bilder som Google Kartor ritar själv; markörerna räknas om
 * bara när filter, val eller (med klumpar) kartans läge ändras — inte när min position uppdateras.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet, Platform, Linking, useWindowDimensions,
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
import Reanimated, {
  Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition, cancelAnimation,
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
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
import {
  CLUSTER, EMPTY_FILTERS, SUBCATEGORIES, clusteringOn, countFilters, filterPlaces, type MapFilters,
} from "@/lib/mapFilters";
import { StickerCard } from "@/components/stickers/StickerCard";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import {
  ClusterMarker, LogoClusterMarker, LogoMarker, NUMBER_ANCHOR, NumberPin, PIN_ANCHOR, PIN_COLORS,
  SELECTED_ANCHOR, SERVICE_TYPES, SelectedPin, placeLogo, placePinImage, serviceIcon, servicePinImage,
  treasurePinImage,
} from "@/components/map/MapPins";
import { PlaceCard, PLACE_CARD_H } from "@/components/map/PlaceCard";
import { MapFilterSheet, activeFilters } from "@/components/map/MapFilterSheet";
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_IS_STYLEABLE, MAP_PROVIDER } from "@/components/map/mapStyle";

const GOLD = "#C5A059";
/** Startläge innan positionen är känd: Österlen */
const INIT_REGION: Region = { latitude: 55.5, longitude: 14.1, latitudeDelta: 0.22, longitudeDelta: 0.22 };
/** Kartnavigeringens överkant (FloatingNav, kartvarianten: 56 hög, 12 över botten) */
const NAV_H = 56 + 12;
/** Ungefärlig höjd på service- och skattkorten (kartans logga ligger ovanför dem) */
const SMALL_CARD_H = 200;
/** Så många närliggande platser man kan svepa mellan från en plats */
const NEIGHBORS = 15;
/** Tärningen: antal byten innan den landar */
const SHUFFLE_STEPS = 12;
/** Där den osynliga rutten står när ingen lista är vald */
const PARK = { latitude: INIT_REGION.latitude, longitude: INIT_REGION.longitude };

type PlacePoint = Supercluster.PointFeature<{ id: number }>;

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
  const fly = useCallback((lat: number, lng: number, zoom: number, duration: number) => {
    mapRef.current?.animateCamera({ center: { latitude: lat, longitude: lng }, zoom }, { duration });
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

  // ── Klumpar (räknas om när kartan stannat, bara när klumpar används) ──
  const [clusterRegion, setClusterRegion] = useState<Region>(INIT_REGION);
  const clusterOnRef = useRef(clusterOn);
  clusterOnRef.current = clusterOn;
  const index = useMemo(() => {
    if (!clusterOn) return null;
    const sc = new Supercluster<{ id: number }>({ radius: CLUSTER.radius, minPoints: CLUSTER.minPoints, maxZoom: CLUSTER.maxZoom, extent: 256 });
    const points: PlacePoint[] = filtered
      .filter((p) => !treasurePlaceIds.has(p.id))
      .map((p) => ({ type: "Feature", properties: { id: p.id }, geometry: { type: "Point", coordinates: [p.lng!, p.lat!] } }));
    sc.load(points);
    return sc;
  }, [clusterOn, filtered, treasurePlaceIds]);

  // ── Valt ──────────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [neighbors, setNeighbors] = useState<number[]>([]);
  const [selectedService, setSelectedService] = useState<ServicePoint | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<Collectible | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const selectedRef = useRef({ selectedId, selectedService, selectedSticker, shuffling });
  selectedRef.current = { selectedId, selectedService, selectedSticker, shuffling };
  // Kartans tryck kommer även när en nål trycks — det ska inte stänga kortet nålen just öppnade
  const pinJustPressed = useRef(false);
  const notePinPress = useCallback(() => {
    pinJustPressed.current = true;
    setTimeout(() => { pinJustPressed.current = false; }, 300);
  }, []);

  /** Välj en plats: kortet visas, kameran flyger dit (zoom 15). Närliggande platser att svepa mellan */
  const selectPlace = useCallback((place: Place, keepNeighbors = false) => {
    setSelectedService(null);
    setSelectedSticker(null);
    setSelectedId(place.id);
    if (!keepNeighbors) {
      const inList = listRef.current;
      setNeighbors(inList
        ? inList.map((p) => p.id)
        : filteredRef.current
          .map((p) => ({ id: p.id, d: distanceMeters(place.lat!, place.lng!, p.lat!, p.lng!) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, NEIGHBORS)
          .map((x) => x.id));
    }
    if (place.lat != null && place.lng != null) fly(place.lat, place.lng, 15, 800);
  }, [fly]);

  const openSticker = useCallback((c: Collectible) => {
    setSelectedId(null);
    setSelectedService(null);
    setSelectedSticker(c);
    fly(c.lat, c.lng, 15, 800);
  }, [fly]);
  const openService = useCallback((p: ServicePoint) => {
    setSelectedId(null);
    setSelectedSticker(null);
    setSelectedService(p);
    if (p.lat != null && p.lng != null) fly(p.lat, p.lng, 15, 800);
  }, [fly]);

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

  // Svep på kortet: nästa/föregående närmaste plats
  const stepPlace = useCallback((dir: 1 | -1) => {
    const i = neighbors.indexOf(selectedRef.current.selectedId ?? -1);
    const next = placeById.get(neighbors[i + dir]);
    if (!next) return;
    Haptics.selectionAsync().catch(() => {});
    selectPlace(next, true);
  }, [neighbors, placeById, selectPlace]);

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
  // lämnar den: resten av appen får veta om hjärtan man tryckt på.
  useFocusEffect(
    useCallback(() => {
      if (!placeParam && !stickerParam) {
        setSelectedId(null);
        setSelectedSticker(null);
        setSelectedService(null);
        if (userLocRef.current) fly(userLocRef.current.latitude, userLocRef.current.longitude, 13, 800);
      }
      return () => {
        if (overridesRef.current.size === 0) return;
        queryClient.invalidateQueries({ queryKey: ["favorites"] }).then(() => setSavedOverrides(new Map()));
      };
    }, [placeParam, stickerParam, queryClient, fly]),
  );

  // Nya filter: kortet kan visa en plats som inte längre syns, så det stängs
  // (inte första gången — då kan en plats eller skatt man skickats hit för just ha öppnats)
  const filtersMounted = useRef(false);
  useEffect(() => {
    if (!filtersMounted.current) { filtersMounted.current = true; return; }
    setSelectedId(null);
    setSelectedService(null);
    setSelectedSticker(null);
  }, [filters]);

  // En vald lista: zooma så hela rutten syns
  useEffect(() => {
    if (!listPlaces || listPlaces.length === 0) return;
    const coords = listPlaces.map((p) => ({ latitude: p.lat!, longitude: p.lng! }));
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: insets.top + 160, right: 60, bottom: NAV_H + insets.bottom + 80, left: 60 },
        animated: true,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [listPlaces, insets.top, insets.bottom]);

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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    clearTimeout(shuffleTimer.current);
    setShuffling(true);
    setSelectedId(null);
    setSelectedService(null);
    setSelectedSticker(null);
    let step = 0;
    const tick = () => {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      step++;
      if (step >= SHUFFLE_STEPS) {
        setPreviewId(null);
        setShuffling(false);
        selectPlace(pick);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return;
      }
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
  const birdKm = (lat: number | null, lng: number | null) =>
    userLoc && lat != null && lng != null ? distanceMeters(userLoc.latitude, userLoc.longitude, lat, lng) / 1000 : null;

  // ── Markörerna (räknas bara om när något i dem ändras) ──
  const markers = useMemo(() => {
    if (!placesFetched) return null;
    const out: React.ReactNode[] = [];

    if (listPlaces) {
      out.push(
        <Polyline
          key="route"
          coordinates={listPlaces.length > 1 ? listPlaces.map((p) => ({ latitude: p.lat!, longitude: p.lng! })) : [PARK, PARK]}
          strokeColor={listPlaces.length > 1 ? GOLD : "transparent"}
          strokeWidth={2.5}
          lineDashPattern={[8, 7]}
        />,
      );
      listPlaces.forEach((p, i) => out.push(
        <ViewMarker
          key={`n-${p.id}-${p.id === selectedId}`}
          lat={p.lat!}
          lng={p.lng!}
          anchor={NUMBER_ANCHOR}
          zIndex={p.id === selectedId ? 30 : 5}
          onPress={() => { notePinPress(); selectPlace(p); }}
        >
          <NumberPin n={i + 1} selected={p.id === selectedId} />
        </ViewMarker>,
      ));
    } else {
      // Platser: klumpar och/eller enskilda (den valda ritas för sig nedan)
      type Item = { kind: "place"; place: Place } | { kind: "cluster"; id: number; count: number; lat: number; lng: number };
      let items: Item[];
      if (index) {
        const r = clusterRegion;
        const bbox: [number, number, number, number] = [
          r.longitude - r.longitudeDelta, r.latitude - r.latitudeDelta,
          r.longitude + r.longitudeDelta, r.latitude + r.latitudeDelta,
        ];
        items = index.getClusters(bbox, Math.floor(zoomOf(r))).flatMap((f): Item[] => {
          const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: number };
          const [lng, lat] = f.geometry.coordinates;
          if (props.cluster) return [{ kind: "cluster", id: props.cluster_id!, count: props.point_count ?? 0, lat, lng }];
          const place = placeById.get(props.id!);
          return place ? [{ kind: "place", place }] : [];
        });
      } else {
        items = filtered.filter((p) => !treasurePlaceIds.has(p.id)).map((place) => ({ kind: "place", place }));
      }

      for (const item of items) {
        if (item.kind === "cluster") {
          const first = logoMode && index ? placeById.get((index.getLeaves(item.id, 1)[0]?.properties as { id: number })?.id) : undefined;
          const logo = first ? placeLogo(first) : null;
          const onPress = () => {
            notePinPress();
            Haptics.selectionAsync().catch(() => {});
            const zoom = Math.min(index!.getClusterExpansionZoom(item.id), 18);
            fly(item.lat, item.lng, zoom, 500);
          };
          out.push(logo ? (
            <ViewMarker key={`lc-${item.id}`} lat={item.lat} lng={item.lng} anchor={{ x: 0.5, y: 0.5 }} zIndex={1010} waitForImage onPress={onPress}>
              {(ready) => <LogoClusterMarker logo={logo} count={item.count} onReady={ready} />}
            </ViewMarker>
          ) : (
            <ViewMarker key={`c-${item.id}`} lat={item.lat} lng={item.lng} anchor={{ x: 0.5, y: 0.5 }} zIndex={10} onPress={onPress}>
              <ClusterMarker count={item.count} />
            </ViewMarker>
          ));
          continue;
        }
        const p = item.place;
        if (p.id === selectedId) continue;
        const catId = findCategory(p.category)?.id;
        const logo = logoMode ? placeLogo(p) : null;
        const onPress = () => { notePinPress(); selectPlace(p); };
        out.push(logo ? (
          <ViewMarker key={`l-${p.id}`} lat={p.lat!} lng={p.lng!} anchor={{ x: 0.5, y: 0.5 }} zIndex={1003} waitForImage onPress={onPress}>
            {(ready) => <LogoMarker logo={logo} color={PIN_COLORS[catId ?? "other"]} onReady={ready} />}
          </ViewMarker>
        ) : (
          <Marker
            key={`p-${p.id}`}
            coordinate={{ latitude: p.lat!, longitude: p.lng! }}
            image={placePinImage(catId)}
            anchor={PIN_ANCHOR}
            zIndex={3}
            tracksViewChanges={false}
            onPress={onPress}
          />
        ));
      }

      // Den valda platsen: guldnål som studsar in (eller loggan med guldkant i loggläget)
      const sel = selectedId != null ? placeById.get(selectedId) : undefined;
      if (sel?.lat != null && sel.lng != null) {
        const logo = logoMode ? placeLogo(sel) : null;
        const catId = findCategory(sel.category)?.id;
        out.push(logo ? (
          <ViewMarker key={`sel-l-${sel.id}`} lat={sel.lat} lng={sel.lng} anchor={{ x: 0.5, y: 0.5 }} zIndex={2000} waitForImage onPress={notePinPress}>
            {(ready) => <LogoMarker logo={logo} color={PIN_COLORS[catId ?? "other"]} selected onReady={ready} />}
          </ViewMarker>
        ) : (
          <ViewMarker key={`sel-${sel.id}`} lat={sel.lat} lng={sel.lng} anchor={SELECTED_ANCHOR} zIndex={2000} onPress={notePinPress}>
            <SelectedPin />
          </ViewMarker>
        ));
      }
    }

    shownServices.forEach((p) => out.push(
      <Marker
        key={`s-${p.id}-${selectedService?.id === p.id}`}
        coordinate={{ latitude: p.lat!, longitude: p.lng! }}
        image={servicePinImage(selectedService?.id === p.id)}
        anchor={PIN_ANCHOR}
        zIndex={selectedService?.id === p.id ? 2000 : 2}
        tracksViewChanges={false}
        onPress={() => { notePinPress(); openService(p); }}
      />,
    ));
    shownTreasures.forEach((c) => out.push(
      <Marker
        key={`t-${c.id}-${collected.has(c.id)}-${selectedSticker?.id === c.id}`}
        coordinate={{ latitude: c.lat, longitude: c.lng }}
        image={treasurePinImage(collected.has(c.id), selectedSticker?.id === c.id)}
        anchor={PIN_ANCHOR}
        zIndex={selectedSticker?.id === c.id ? 2000 : 4}
        tracksViewChanges={false}
        onPress={() => { notePinPress(); openSticker(c); }}
      />,
    ));
    return out;
  }, [
    placesFetched, listPlaces, index, clusterRegion, zoomOf, placeById, filtered, treasurePlaceIds, logoMode, selectedId,
    shownServices, selectedService, shownTreasures, collected, selectedSticker, notePinPress, selectPlace, openService,
    openSticker, fly,
  ]);

  // ── Layout ────────────────────────────────────────────────────────────────
  const headerTop = Math.max(insets.top, 44) + 18;
  const navTop = insets.bottom + NAV_H;
  const cardBottom = navTop + 12;
  const cardPlace = shuffling
    ? (previewId != null ? placeById.get(previewId) : undefined)
    : (selectedId != null ? placeById.get(selectedId) : undefined);
  const anyCard = !!cardPlace || !!selectedService || !!selectedSticker;
  const mapBottom = cardPlace ? cardBottom + PLACE_CARD_H : anyCard ? cardBottom + SMALL_CARD_H : navTop + 4;
  const filterCount = countFilters(filters);
  const pills = activeFilters(filters, lists);
  const neighborIndex = selectedId != null ? neighbors.indexOf(selectedId) : -1;

  // Ensam vald kategori med underkategorier: dropdown under pillerna
  const onlyCat = filters.cats.size === 1 ? [...filters.cats][0] : null;
  const subs = onlyCat ? SUBCATEGORIES[onlyCat] : undefined;

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <MapView
        ref={mapRef}
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
        // Googles logga måste alltid synas helt (villkoren): kartans nederkant ligger ovanför
        // navigeringen, och ovanför kortet när ett kort är öppet
        mapPadding={{ top: 0, right: 0, left: 0, bottom: mapBottom }}
        onPress={onMapPress}
        onRegionChangeComplete={(r) => {
          regionRef.current = r;
          if (clusterOnRef.current) setClusterRegion(r);
        }}
      >
        {markers}
      </MapView>

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
                  style={[s.pill, { backgroundColor: dark ? "rgba(18,18,18,0.88)" : "rgba(255,255,255,0.94)" }]}
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
        visible={!anyCard}
        locateBottom={navTop + 20}
        dark={dark}
        canSurprise={placesFetched && filtered.length > 0}
        shuffling={shuffling}
        onLocate={locate}
        onSurprise={surprise}
      />

      {/* ── Korten ── */}
      {cardPlace && (
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
          <PlaceCard
            place={cardPlace}
            bottom={cardBottom}
            birdKm={birdKm(cardPlace.lat, cardPlace.lng)}
            saved={favoriteIds.has(cardPlace.id)}
            interactive={!shuffling}
            canPrev={neighborIndex > 0}
            canNext={neighborIndex >= 0 && neighborIndex < neighbors.length - 1}
            onOpen={() => router.push(`/place/${cardPlace.id}` as any)}
            onNavigate={() => navigateTo(cardPlace.lat, cardPlace.lng)}
            onToggleSave={() => toggleSave(cardPlace.id)}
            onBurst={showBurst}
            onClose={deselect}
            onStep={stepPlace}
          />
        </>
      )}

      {selectedService && (
        <Reanimated.View
          entering={FadeInDown.duration(260)}
          exiting={FadeOutDown.duration(180)}
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
 * En markör som ritas i appen (logga, klump, vald nål, listnummer). Google fångar den som bild
 * medan tracksViewChanges är på — en kort stund, eller tills bilden laddats — sen av, så kartan
 * inte ritar om den hela tiden.
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
    const t = setTimeout(() => setTrack(false), waitForImage ? 2500 : 600);
    return () => clearTimeout(t);
  }, [waitForImage]);
  const ready = useCallback(() => { setTimeout(() => setTrack(false), 150); }, []);
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
        <BlurView intensity={20} tint={dark ? "dark" : "light"} style={[StyleSheet.absoluteFill, s.filterBlur, { backgroundColor: dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)" }]} />
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
        <Reanimated.View style={[s.locate, locateStyle]}>
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
  filterBlur: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
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
    borderWidth: 1, borderColor: "rgba(0,0,0,0.2)",
    shadowColor: GOLD, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, elevation: 10,
  },
  locate: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
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
