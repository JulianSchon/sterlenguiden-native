/**
 * "Lägg till plats" på en lista — ett mörkt ark, något lägre än skärmen (en skymt av listan
 * bakom syns alltid upptill, till skillnad från Kalenderns evenemangsark som går ända upp).
 * Fast huvud (grepp, listnamn, rubrik, sökfält); bara innehållet under scrollar.
 *
 * Hemsidan ("Rekommenderat", sida 0) visar tre små karuseller som ska inspirera: Rekommenderat
 * för listan, Nära dig, Från dina favoriter. Inga kategori-piller längre — i stället bläddrar
 * man sida för sida genom kategorierna, precis som Förmåner-fliken: en rubrik i mitten med
 * pilar, svep i sidled mellan sidorna, prickar som visar var man är. Kategoriernas ordning och
 * namn kommer från CATEGORIES i theme/categories.ts, appens enda källa för det.
 *
 * Prestanda (det som laggade i en tidigare version): bara den AKTIVA sidan ± en granne har sitt
 * innehåll monterat (övriga sidors behållare finns kvar tomma, bara för att svepet ska se rätt ut
 * geometriskt) — aldrig alla ~300 platser samtidigt. Varje kategorisida visar dessutom bara de
 * första `PAGE_SIZE` träffarna, med en "Visa fler"-knapp i stället för att rendera allt på en
 * gång. Sökning (oberoende av vald sida) fungerar likadant. Övrigt: gradienterna är
 * expo-linear-gradient i stället för SVG per kort, innehållet byggs först när arket glidit upp,
 * söktexten filtreras via useDeferredValue.
 *
 * Urvalet fryses när arket öppnas (vilka som redan fanns + en slumpfrö), så det som lagts till
 * ligger kvar med grön bock och karusellerna inte hoppar runt medan man lägger till flera.
 * Den gröna bocken visas direkt men rullas tillbaka med ett felmeddelande om sparandet misslyckas.
 *
 * Egen Modal + egna gester (inte Sheet.tsx): dra nedåt i huvudet stänger alltid; dra nedåt i
 * innehållet stänger bara när det redan är scrollat högst upp. Sidsvepet (vågrätt) och
 * stäng-draget/scrollen (lodrätt) stör inte varandra eftersom de reagerar på olika axlar — samma
 * uppsättning gester som Förmåner-fliken redan bevisat fungerar.
 */
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, View, Text, TextInput, Image, FlatList, Pressable, Keyboard, Platform,
  ActivityIndicator, StyleSheet, useWindowDimensions,
} from "react-native";
import Reanimated, {
  FadeIn, FadeInUp, FadeOutDown, cancelAnimation, runOnJS, scrollTo, useAnimatedReaction, useAnimatedRef,
  useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring,
  withTiming, Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, MapPin, Plus, Search, X } from "lucide-react-native";
import { usePlaces, firstImageUrl, getTierScore, type Place } from "@/hooks/usePlaces";
import { useFavorites } from "@/hooks/useFavorites";
import { useVisits } from "@/hooks/useVisits";
import { useAddPlaceToList, useRemovePlaceFromListByPlace } from "@/hooks/useLists";
import { distanceMeters } from "@/lib/checkin";
import { CATEGORIES, findCategory, type CategoryId } from "@/theme/categories";
import { PressableScale } from "@/components/PressableScale";

const GOLD = "#C5A059";
const FG = "#FFFFFF";
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;
const BUBBLE_MS = 1600;
const CARD_W = 168;
const CARD_H = 220;
const CARD_GAP = 12;
const PAGE_SIZE = 20;

// Sidorna att svepa mellan: "home" (de tre inspirationskarusellerna) + en per officiell kategori
const PAGE_IDS: ("home" | CategoryId)[] = ["home", ...CATEGORIES.map((c) => c.id)];
const CAT_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

const SIDE_MARGIN = 20;    // samma sidmarginal som resten av arkets huvud
const PAGE_GAP = 16;
const EDGE_ZONE = 24;      // px från kanten där svepet inte tar över (iOS "tillbaka")
const SWIPE_DISTANCE = 70;
const SWIPE_SPEED = 600;

type Bubble = { key: number; text: string; error: boolean };
type Card = { place: Place; note?: string };

const splitCategories = (c: string | null | undefined) =>
  (c ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const imageOf = (p: Place) => firstImageUrl(p.image_url) || p.logo_url || null;
const tier = (p: Place) => getTierScore(p.business_tier);
const firstCat = (p: Place) => splitCategories(p.categories)[0];
const byTierThenName = (a: Place, b: Place) => tier(b) - tier(a) || a.name.localeCompare(b.name, "sv");

/** Deterministisk slump (mulberry32) — samma ordning hela tiden arket är öppet, ny nästa gång. */
function seededRandom(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

export function AddPlaceSheet({
  visible, onClose, listId, listName, existingPlaceIds,
}: { visible: boolean; onClose: () => void; listId: string; listName?: string; existingPlaceIds: number[] }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  // Lägre än Kalenderns evenemangsark med avsikt — en skymt av listan ska synas bakom upptill.
  const sheetH = Math.round(winH * 0.88);
  const reduceMotion = useReducedMotion();

  const { data: places, isLoading, isError } = usePlaces();
  const { data: favorites = [] } = useFavorites();
  const { data: visits = [] } = useVisits();
  const addPlace = useAddPlaceToList();
  const removePlace = useRemovePlaceFromListByPlace();

  const [mounted, setMounted] = useState(visible);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<{ existing: Set<number>; seed: number }>({ existing: new Set(), seed: 1 });
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length > 0;
  const [searchVisible, setSearchVisible] = useState(PAGE_SIZE);
  const [catVisible, setCatVisible] = useState<Record<CategoryId, number>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.id, PAGE_SIZE])) as Record<CategoryId, number>
  );
  const [justAdded, setJustAdded] = useState<Set<number>>(new Set());
  const justAddedRef = useRef(justAdded);
  justAddedRef.current = justAdded;
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [keyboardH, setKeyboardH] = useState(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const translateY = useSharedValue(sheetH);
  const backdrop = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const dragOffset = useSharedValue(0);

  // ── Sidsvep (kategorisidor) ──
  // scrollDrive körs genom en egen withTiming i stället för ScrollView.scrollTo({animated:true}),
  // vars inbyggda animation blev snabbare ju längre ner man scrollat — kändes som att kastas upp.
  // Med en egen shared value blir glidet till toppen alltid samma mjuka 340 ms, oavsett avstånd.
  const scrollRef = useAnimatedRef<Reanimated.ScrollView>();
  const scrollDrive = useSharedValue(0);
  useAnimatedReaction(
    () => scrollDrive.value,
    (val, prev) => { if (val !== prev) scrollTo(scrollRef, 0, val, false); }
  );
  const [active, setActive] = useState(0);
  const offsetX = useSharedValue(0);
  const startX = useSharedValue(0);
  const fromEdge = useSharedValue(false);
  const [heights, setHeights] = useState<number[]>([]);
  const pageW = winW - SIDE_MARGIN * 2;
  const step = pageW + PAGE_GAP;
  const areaH = Math.max(heights[active] ?? 0, 220);

  // ── Öppna ──
  useEffect(() => {
    if (!visible) return;
    clearTimeout(resetTimer.current);
    setSnapshot({ existing: new Set(existingPlaceIds), seed: Math.floor(Math.random() * 1e9) });
    setMounted(true);
    setReady(false);
    translateY.value = sheetH;
    translateY.value = withTiming(0, { duration: reduceMotion ? 0 : 320, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done) runOnJS(setReady)(true);
    });
    backdrop.value = withTiming(1, { duration: reduceMotion ? 0 : 240 });

    // "Nära dig" bara om platsbehörigheten redan finns — arket ska aldrig själv fråga om den
    Location.getForegroundPermissionsAsync()
      .then((perm) => (perm.status === "granted" ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => { if (pos) setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }); })
      .catch(() => {});
  }, [visible]);

  // ── Stäng ──
  function finishClose() {
    setMounted(false);
    setReady(false);
    onClose();
    // Rensa efter att utgångsanimationen hunnit klart, så inget blinkar till på vägen ut
    resetTimer.current = setTimeout(() => {
      setQuery("");
      setActive(0);
      offsetX.value = 0;
      setHeights([]);
      setCatVisible(Object.fromEntries(CATEGORIES.map((c) => [c.id, PAGE_SIZE])) as Record<CategoryId, number>);
      setJustAdded(new Set());
      setBubble(null);
    }, 300);
  }

  function requestClose() {
    Keyboard.dismiss();
    backdrop.value = withTiming(0, { duration: reduceMotion ? 0 : 220 });
    translateY.value = withTiming(sheetH, { duration: reduceMotion ? 0 : 240 }, (done) => {
      if (done) runOnJS(finishClose)();
    });
  }

  useEffect(() => () => { clearTimeout(bubbleTimer.current); clearTimeout(resetTimer.current); }, []);

  // En ny sökning börjar om på en första sida
  useEffect(() => { setSearchVisible(PAGE_SIZE); }, [deferredQuery]);

  // ── Tangentbord: flytta upp innehållets botten och bubblan, arket självt står still ──
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(showEvt, (e) => setKeyboardH(e.endCoordinates.height));
    const b = Keyboard.addListener(hideEvt, () => setKeyboardH(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  // ── Gester: stäng/scroll (lodrätt) ──
  const settle = (velocityY: number) => {
    "worklet";
    if (translateY.value > CLOSE_DISTANCE || (velocityY > CLOSE_VELOCITY && translateY.value > 0)) {
      backdrop.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(sheetH, { duration: 220 }, (done) => {
        if (done) runOnJS(finishClose)();
      });
    } else {
      translateY.value = withSpring(0, { damping: 32, stiffness: 300 });
    }
  };

  const headerPan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-12, 12])
    .onUpdate((e) => { translateY.value = Math.max(0, e.translationY); })
    .onEnd((e) => settle(e.velocityY));

  const nativeScroll = Gesture.Native();
  const bodyPan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-12, 12])
    .simultaneousWithExternalGesture(nativeScroll)
    .onStart(() => { dragOffset.value = 0; })
    .onUpdate((e) => {
      // Så länge listan är nedscrollad är det listan som rör sig; arket följer först när den nått toppen
      if (scrollY.value > 0.5) { dragOffset.value = e.translationY; return; }
      translateY.value = Math.max(0, e.translationY - dragOffset.value);
    })
    .onEnd((e) => settle(e.velocityY));

  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  // ── Gester: sidsvep (vågrätt) — exakt samma modell som Förmåner-flikens kategorisidor ──
  const settleScroll = () => {
    "worklet";
    if (scrollY.value > 0.5) {
      scrollDrive.value = scrollY.value;
      scrollDrive.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
    }
  };
  const arrived = (index: number) => setActive(index);
  const slideTo = (target: number) => {
    if (target < 0 || target >= PAGE_IDS.length) return;
    settleScroll();
    offsetX.value = withTiming(-target * step, { duration: 220 }, (done) => {
      if (done) runOnJS(arrived)(target);
    });
  };

  const catSwipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onStart((e) => {
      cancelAnimation(offsetX);
      startX.value = offsetX.value;
      fromEdge.value = e.absoluteX - e.translationX < EDGE_ZONE;
    })
    .onUpdate((e) => {
      if (fromEdge.value) return;
      const min = -(PAGE_IDS.length - 1) * step;
      const raw = startX.value + e.translationX;
      offsetX.value = raw > 0 ? raw * 0.2 : raw < min ? min + (raw - min) * 0.2 : raw;
    })
    .onEnd((e) => {
      const last = PAGE_IDS.length - 1;
      const startIdx = Math.round(-startX.value / step);
      let target = startIdx;
      if (!fromEdge.value) {
        const projected = offsetX.value + e.velocityX * 0.18;
        target = Math.min(last, Math.max(0, Math.round(-projected / step)));
        const intent = Math.abs(e.translationX) > SWIPE_DISTANCE || Math.abs(e.velocityX) > SWIPE_SPEED;
        if (target === startIdx && intent) {
          target = Math.min(last, Math.max(0, startIdx + (e.translationX < 0 ? 1 : -1)));
        }
      }
      if (target !== startIdx) settleScroll();
      const pagesAway = Math.max(1, Math.abs(Math.round(-offsetX.value / step) - target));
      offsetX.value = withTiming(-target * step, { duration: 150 + 40 * (pagesAway - 1) }, (done) => {
        if (done) runOnJS(arrived)(target);
      });
    });

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offsetX.value }] }));

  // ── Hemsidan: tre karuseller som ska inspirera ──
  const homeData = useMemo(() => {
    if (!places) return { recommended: [] as Card[], nearby: [] as Card[], favorites: [] as Card[], emptyText: "" };
    const { existing, seed } = snapshot;
    const available = places.filter((p) => !existing.has(p.id));
    const rand = seededRandom(seed);
    const jitter = new Map(available.map((p) => [p.id, rand()]));

    const counts = new Map<string, number>();
    places.filter((p) => existing.has(p.id)).forEach((p) =>
      splitCategories(p.categories).forEach((c) => counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1))
    );
    const topCats = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
    const recommended: Card[] = (topCats.length === 0 ? [] : available
      .filter((p) => splitCategories(p.categories).some((c) => topCats.includes(c.toLowerCase())))
      .sort((a, b) => tier(b) - tier(a) || jitter.get(a.id)! - jitter.get(b.id)!)
      .slice(0, 12)).map((place) => ({ place, note: firstCat(place) }));

    const nearby: Card[] = here
      ? available
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({ place: p, m: distanceMeters(here.lat, here.lng, p.lat!, p.lng!) }))
          .sort((a, b) => a.m - b.m)
          .slice(0, 12)
          .map(({ place, m }) => ({ place, note: formatDistance(m) }))
      : [];

    const mine = new Set<number>([
      ...favorites.map((f) => f.place_id).filter((id): id is number => id != null),
      ...visits.map((v) => v.place_id),
    ]);
    const favoriteCards: Card[] = available.filter((p) => mine.has(p.id)).slice(0, 14).map((place) => ({ place, note: firstCat(place) }));

    const hasAny = recommended.length > 0 || nearby.length > 0 || favoriteCards.length > 0;
    const emptyText = hasAny ? "" : available.length === 0 ? t("addPlace.noMore") : t("addPlace.browseHint");

    return { recommended, nearby, favorites: favoriteCards, emptyText };
  }, [places, snapshot, here, favorites, visits, t]);

  // ── Varje kategoris träfflista, A–Ö/tier-sorterad — billigt (ren filter+sort), beräknas för
  // alla kategorier på en gång så sidbyte inte kräver ny filtrering ──
  const categoryMatches = useMemo(() => {
    const map = new Map<CategoryId, Place[]>();
    if (!places) return map;
    const available = places.filter((p) => !snapshot.existing.has(p.id));
    for (const cat of CATEGORIES) {
      map.set(cat.id, available.filter((p) => findCategory(p.categories)?.id === cat.id).sort(byTierThenName));
    }
    return map;
  }, [places, snapshot]);

  // ── Sökning: global, oberoende av vilken sida man står på ──
  const searchMatches = useMemo((): Place[] => {
    if (!places || !searching) return [];
    const available = places.filter((p) => !snapshot.existing.has(p.id));
    const q = deferredQuery.trim().toLowerCase();
    return available
      .filter((p) => p.name.toLowerCase().includes(q) || (p.categories ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(q) ? 1 : 0;
        const bs = b.name.toLowerCase().startsWith(q) ? 1 : 0;
        return as !== bs ? bs - as : byTierThenName(a, b);
      });
  }, [places, snapshot, searching, deferredQuery]);

  const bumpCatVisible = useCallback((id: CategoryId) => {
    setCatVisible((prev) => ({
      ...prev,
      [id]: Math.min((prev[id] ?? PAGE_SIZE) + PAGE_SIZE, categoryMatches.get(id)?.length ?? 0),
    }));
  }, [categoryMatches]);

  // ── Lägg till ──
  const showBubble = useCallback((text: string, error = false) => {
    clearTimeout(bubbleTimer.current);
    setBubble({ key: Date.now(), text, error });
    bubbleTimer.current = setTimeout(() => setBubble(null), BUBBLE_MS);
  }, []);

  // Ett andra tryck på en nyss tillagd plats ångrar tillägget i stället för att ignoreras — bocken
  // går tillbaka till ett guldplus. Optimistiskt åt båda hållen, rullas tillbaka vid fel.
  const handleToggle = useCallback(async (place: Place) => {
    const wasAdded = justAddedRef.current.has(place.id);
    setJustAdded((prev) => {
      const next = new Set(prev);
      if (wasAdded) next.delete(place.id); else next.add(place.id);
      return next;
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (!wasAdded) showBubble(t("addPlace.added", { name: place.name }));
    try {
      if (wasAdded) await removePlace.mutateAsync({ listId, placeId: place.id });
      else await addPlace.mutateAsync({ listId, placeId: place.id });
    } catch {
      setJustAdded((prev) => {
        const next = new Set(prev);
        if (wasAdded) next.add(place.id); else next.delete(place.id);
        return next;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showBubble(t("addPlace.failed", { name: place.name }), true);
    }
  }, [listId, t, showBubble, addPlace.mutateAsync, removePlace.mutateAsync]);

  const savedCount = existingPlaceIds.length;
  const remaining = (places?.length ?? 0) - savedCount;
  const subtitle = [
    t(savedCount === 1 ? "addPlace.savedOne" : "addPlace.savedMany", { count: savedCount }),
    places && remaining > 0 ? t("addPlace.remaining", { count: remaining }) : null,
  ].filter(Boolean).join(" · ");

  const bottomSpace = keyboardH > 0 ? keyboardH : insets.bottom;
  const pageLabels = useMemo(() => [t("addPlace.recommendedShort"), ...CATEGORIES.map((c) => c.label)], [t]);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.8)" }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel={t("addPlace.close")} />
        </Reanimated.View>

        <Reanimated.View style={[s.sheet, { height: sheetH }, sheetStyle]}>
          <LinearGradient colors={["#2A2118", "#121212"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

          {/* ── Fast huvud ── */}
          <GestureDetector gesture={headerPan}>
            <View>
              <View style={s.gripWrap}><View style={s.grip} /></View>
              <View style={s.headRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.eyebrow} numberOfLines={1}>{listName || t("addPlace.listFallback")}</Text>
                  <Text style={s.title}>{t("addPlace.title")}</Text>
                  <Text style={s.subtitle}>{subtitle}</Text>
                </View>
                <PressableScale style={s.closeBtn} scale={0.9} onPress={requestClose} accessibilityLabel={t("addPlace.close")}>
                  <X size={20} color="rgba(255,255,255,0.8)" strokeWidth={2} />
                </PressableScale>
              </View>
              <View style={s.searchWrap}>
                <Search size={16} color="rgba(255,255,255,0.4)" strokeWidth={2} style={s.searchIcon} />
                <TextInput
                  style={s.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t("addPlace.search")}
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {query.length > 0 && (
                  <Pressable style={s.clearBtn} hitSlop={10} onPress={() => setQuery("")}>
                    <X size={14} color="rgba(255,255,255,0.6)" strokeWidth={2.4} />
                  </Pressable>
                )}
              </View>
            </View>
          </GestureDetector>

          {/* ── Scrollande innehåll (byggs först när arket glidit upp) ── */}
          <GestureDetector gesture={bodyPan}>
            <View style={{ flex: 1 }}>
              {!ready || isLoading ? (
                <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
              ) : isError ? (
                <Text style={s.emptyText}>{t("common.error")}</Text>
              ) : (
                <Reanimated.View entering={reduceMotion ? undefined : FadeIn.duration(180)} style={{ flex: 1 }}>
                  <GestureDetector gesture={nativeScroll}>
                    <Reanimated.ScrollView
                      ref={scrollRef}
                      onScroll={onScroll}
                      scrollEventThrottle={16}
                      bounces={false}
                      overScrollMode="never"
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                      contentContainerStyle={{ paddingTop: 10, paddingHorizontal: SIDE_MARGIN, paddingBottom: bottomSpace + 24 }}
                    >
                      {searching ? (
                        <>
                          <Text style={[s.sectionTitle, { marginHorizontal: 0 }]}>{t("addPlace.count", { count: searchMatches.length })}</Text>
                          <PlaceRows
                            places={searchMatches}
                            visibleCount={searchVisible}
                            onShowMore={() => setSearchVisible((v) => Math.min(v + PAGE_SIZE, searchMatches.length))}
                            justAdded={justAdded}
                            onAdd={handleToggle}
                            emptyText={t("addPlace.noMatches")}
                          />
                        </>
                      ) : (
                        <>
                          <CategoryHeader index={active} labels={pageLabels} onStep={(dir) => slideTo(active + dir)} />
                          <GestureDetector gesture={catSwipe}>
                            <Reanimated.View style={[{ height: areaH }, slideStyle]}>
                              {PAGE_IDS.map((id, i) => (
                                <View
                                  key={id}
                                  pointerEvents={i === active ? "auto" : "none"}
                                  style={[s.page, { left: i * step, width: pageW, height: areaH }]}
                                >
                                  <View
                                    onLayout={(e) => {
                                      const h = e.nativeEvent.layout.height;
                                      setHeights((prev) => {
                                        if (prev[i] === h) return prev;
                                        const next = [...prev];
                                        next[i] = h;
                                        return next;
                                      });
                                    }}
                                  >
                                    {Math.abs(i - active) <= 1 ? (
                                      id === "home" ? (
                                        <HomePage data={homeData} justAdded={justAdded} onAdd={handleToggle} />
                                      ) : (
                                        <PlaceRows
                                          places={categoryMatches.get(id) ?? []}
                                          visibleCount={catVisible[id] ?? PAGE_SIZE}
                                          onShowMore={() => bumpCatVisible(id)}
                                          justAdded={justAdded}
                                          onAdd={handleToggle}
                                          emptyText={t("addPlace.noMatches")}
                                        />
                                      )
                                    ) : null}
                                  </View>
                                </View>
                              ))}
                            </Reanimated.View>
                          </GestureDetector>
                        </>
                      )}
                    </Reanimated.ScrollView>
                  </GestureDetector>
                </Reanimated.View>
              )}
            </View>
          </GestureDetector>

          {/* ── Bekräftelsebubbla ── */}
          {bubble && (
            <View pointerEvents="none" style={[s.bubbleWrap, { bottom: bottomSpace + 18 }]}>
              <Reanimated.View
                key={bubble.key}
                entering={reduceMotion ? undefined : FadeInUp.duration(200)}
                exiting={reduceMotion ? undefined : FadeOutDown.duration(180)}
                style={s.bubbleShadow}
              >
                <View style={[s.bubble, bubble.error && { borderColor: "rgba(229,115,115,0.5)" }]}>
                  <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(20,16,10,0.92)" }]} />
                  {bubble.error
                    ? <X size={16} color="#E57373" strokeWidth={2.4} />
                    : <Check size={16} color={GOLD} strokeWidth={2.4} />}
                  <Text style={s.bubbleText} numberOfLines={1}>{bubble.text}</Text>
                </View>
              </Reanimated.View>
            </View>
          )}
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Rubrik i mitten med pilar vänster/höger + prickar — samma komponent-mönster som Förmåner-fliken. */
function CategoryHeader({ index, labels, onStep }: { index: number; labels: string[]; onStep: (dir: 1 | -1) => void }) {
  const arrow = (dir: 1 | -1) => {
    const hidden = index + dir < 0 || index + dir >= labels.length;
    const Icon = dir === 1 ? ChevronRight : ChevronLeft;
    return (
      <Pressable onPress={() => onStep(dir)} disabled={hidden} hitSlop={12} style={[s.arrow, hidden && { opacity: 0 }]}>
        <Icon size={20} color="rgba(255,255,255,0.6)" strokeWidth={2} />
      </Pressable>
    );
  };
  return (
    <View style={s.catHeader}>
      <View style={s.catRow}>
        {arrow(-1)}
        <View style={s.catMiddle}>
          <View style={s.rule} />
          <Text style={s.catTitle} numberOfLines={1}>{labels[index].toUpperCase()}</Text>
          <View style={s.rule} />
        </View>
        {arrow(1)}
      </View>
      <View style={s.dots}>
        {labels.map((label, i) => (
          <View key={label} style={[s.dot, i === index && s.dotActive]} />
        ))}
      </View>
    </View>
  );
}

/** Hemsidans tre inspirationskarseller, eller ett hänvisningsmeddelande om listan/platsen inte ger något. */
const HomePage = memo(function HomePage({
  data, justAdded, onAdd,
}: { data: { recommended: Card[]; nearby: Card[]; favorites: Card[]; emptyText: string }; justAdded: Set<number>; onAdd: (p: Place) => void }) {
  const { t } = useTranslation();
  if (data.emptyText) return <Text style={s.emptyText}>{data.emptyText}</Text>;
  return (
    <View>
      {data.recommended.length > 0 && <Carousel title={t("addPlace.recommended")} cards={data.recommended} justAdded={justAdded} onAdd={onAdd} />}
      {data.nearby.length > 0 && <Carousel title={t("addPlace.nearby")} cards={data.nearby} justAdded={justAdded} onAdd={onAdd} />}
      {data.favorites.length > 0 && <Carousel title={t("addPlace.favorites")} cards={data.favorites} justAdded={justAdded} onAdd={onAdd} />}
    </View>
  );
});

/** En kategoris (eller sökningens) träfflista — kapad till `visibleCount`, "Visa fler" i stället för allt på en gång. */
const PlaceRows = memo(function PlaceRows({
  places, visibleCount, onShowMore, justAdded, onAdd, emptyText,
}: { places: Place[]; visibleCount: number; onShowMore: () => void; justAdded: Set<number>; onAdd: (p: Place) => void; emptyText: string }) {
  const { t } = useTranslation();
  if (places.length === 0) return <Text style={s.emptyText}>{emptyText}</Text>;
  const shown = places.slice(0, visibleCount);
  return (
    <View>
      {shown.map((p) => <PlaceRow key={p.id} place={p} added={justAdded.has(p.id)} onAdd={onAdd} />)}
      {visibleCount < places.length && (
        <Pressable onPress={onShowMore} style={s.showMoreBtn}>
          <Text style={s.showMoreText}>{t("addPlace.showMore")}</Text>
        </Pressable>
      )}
    </View>
  );
});

// ── Karusell: egen virtualiserad FlatList i sidled ──
const Carousel = memo(function Carousel({
  title, cards, justAdded, onAdd,
}: { title: string; cards: Card[]; justAdded: Set<number>; onAdd: (p: Place) => void }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <Text style={[s.sectionTitle, { marginHorizontal: 0 }]}>{title}</Text>
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(c) => String(c.place.id)}
        extraData={justAdded}
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={CardGap}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={3}
        renderItem={({ item }) => (
          <PlaceCard place={item.place} note={item.note} added={justAdded.has(item.place.id)} onAdd={onAdd} />
        )}
      />
    </View>
  );
});

const CardGap = () => <View style={{ width: CARD_GAP }} />;

// ── Stort kort — hela kortet och plusknappen lägger till ──
const PlaceCard = memo(function PlaceCard({
  place, note, added, onAdd,
}: { place: Place; note?: string; added: boolean; onAdd: (p: Place) => void }) {
  const [failed, setFailed] = useState(false);
  const uri = imageOf(place);
  const add = () => onAdd(place);

  return (
    <PressableScale scale={0.97} onPress={add}>
      <View style={s.card}>
        {uri && !failed ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <>
            <LinearGradient colors={["rgba(197,160,89,0.18)", "#121212"]} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
            <View style={s.cardPin}><MapPin size={24} color={GOLD} strokeWidth={2} /></View>
          </>
        )}
        {/* Mörk toning nedåt — gör att texten alltid går att läsa, och ger kortet sin svarta fot */}
        <LinearGradient
          colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.92)"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={s.cardText}>
          <Text style={s.cardName} numberOfLines={2}>{place.name}</Text>
          {note ? <Text style={s.cardNote} numberOfLines={1}>{note}</Text> : null}
        </View>
        <View style={s.cardPlus}><AddButton added={added} onPress={add} /></View>
      </View>
    </PressableScale>
  );
});

// ── Rad i en kategorisida / sökresultat ──
const PlaceRow = memo(function PlaceRow({ place, added, onAdd }: { place: Place; added: boolean; onAdd: (p: Place) => void }) {
  const [failed, setFailed] = useState(false);
  const uri = imageOf(place);
  const meta = [firstCat(place), place.nearest_town].filter(Boolean).join(" · ");
  const add = () => onAdd(place);

  return (
    <Pressable onPress={add}>
      <View style={s.row}>
        {uri && !failed ? (
          <Image source={{ uri }} style={s.rowImg} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <View style={[s.rowImg, s.rowImgFallback]}><MapPin size={20} color="rgba(255,255,255,0.3)" strokeWidth={2} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.rowName} numberOfLines={1}>{place.name}</Text>
          {meta ? <Text style={s.rowMeta} numberOfLines={1}>{meta}</Text> : null}
        </View>
        <AddButton added={added} onPress={add} />
      </View>
    </Pressable>
  );
});

/** Knappen själv studsar vid tillägg, inte hela raden/kortet — mindre yta som animerar håller
 * nere risken för att texturer (gradient, skugga) blir suddiga medan de skalas. En snabb dipp
 * NED följt av samma nästan kritiska fjäder som PressableScale, inte en studs som svänger förbi
 * och vaggar — det var den gamla underdämpade fjädern (damping:14) som såg risig ut. */
function AddButton({ added, onPress }: { added: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (added && !reduceMotion) {
      scale.value = withSequence(withTiming(0.8, { duration: 90 }), withSpring(1, { damping: 34, stiffness: 320 }));
    }
  }, [added]);
  const bounce = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Reanimated.View style={bounce}>
      <PressableScale
        scale={0.88}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={added ? t("addPlace.addedLabel") : t("addPlace.add")}
        style={s.addShadow}
      >
        {added ? (
          <View style={[s.addBtn, { backgroundColor: "rgba(34,197,94,0.95)" }]}>
            <Check size={16} color="#FFFFFF" strokeWidth={2.8} />
          </View>
        ) : (
          <LinearGradient colors={["#D4B574", "#C5A059"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.addBtn}>
            <Plus size={16} color="#121212" strokeWidth={2.8} />
          </LinearGradient>
        )}
      </PressableScale>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden",
    borderWidth: 1, borderBottomWidth: 0, borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#121212",
  },
  gripWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" },

  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2.2, textTransform: "uppercase", color: GOLD },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 25, lineHeight: 29, letterSpacing: -0.3, color: FG, marginTop: 4 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 6 },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },

  searchWrap: { marginHorizontal: 20, marginBottom: 6, height: 48, justifyContent: "center" },
  searchIcon: { position: "absolute", left: 14, zIndex: 1 },
  searchInput: {
    height: 48, borderRadius: 24, paddingLeft: 40, paddingRight: 40,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    fontFamily: "Inter_400Regular", fontSize: 16, color: FG,
  },
  clearBtn: {
    position: "absolute", right: 12, width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center",
  },

  catHeader: { alignItems: "center", gap: 10, paddingTop: 14, paddingBottom: 14 },
  catRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  catMiddle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 6 },
  arrow: { width: 32, alignItems: "center" },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(197,160,89,0.3)" },
  catTitle: { fontFamily: "Montserrat_700Bold", fontSize: 13, letterSpacing: 3, color: FG },
  dots: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  dotActive: { width: 18, backgroundColor: GOLD },

  page: { position: "absolute", top: 0, overflow: "hidden" },

  sectionTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: GOLD,
    marginHorizontal: 20, marginBottom: 10,
  },

  card: { width: CARD_W, height: CARD_H, borderRadius: 16, overflow: "hidden", backgroundColor: "#1A1A1D" },
  cardPin: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  cardText: { position: "absolute", left: 12, right: 0, bottom: 12, paddingRight: 48, gap: 3 },
  cardName: { fontFamily: "Montserrat_700Bold", fontSize: 14.5, lineHeight: 18, letterSpacing: -0.2, color: FG },
  cardNote: { fontFamily: "Inter_500Medium", fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "rgba(255,255,255,0.65)" },
  cardPlus: { position: "absolute", right: 12, bottom: 12 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 16 },
  rowImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)" },
  rowImgFallback: { alignItems: "center", justifyContent: "center" },
  rowName: { fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: -0.2, color: FG },
  rowMeta: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.5)", marginTop: 3 },

  showMoreBtn: { alignItems: "center", paddingVertical: 14 },
  showMoreText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: GOLD },

  // Skuggan på ett yttre lager — overflow:hidden klipper annars bort den på iOS
  addShadow: {
    width: 36, height: 36, borderRadius: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.6, shadowRadius: 9, elevation: 4,
  },
  addBtn: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },

  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.55)", textAlign: "center", marginVertical: 40 },

  bubbleWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bubbleShadow: {
    maxWidth: "86%", borderRadius: 999,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 15,
  },
  bubble: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 999, overflow: "hidden", borderWidth: 1, borderColor: "#C5A05955",
  },
  bubbleText: { flexShrink: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: FG },
});
