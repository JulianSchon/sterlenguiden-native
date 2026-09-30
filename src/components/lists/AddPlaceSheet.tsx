/**
 * "Lägg till plats" på en lista — ett nästan helskärmshögt, varmt mörkt ark. Fast huvud (grepp,
 * listnamn, rubrik, sökfält, kategorichips); bara innehållet under scrollar.
 *
 * Utan sök/kategori: karuseller som ska inspirera (Rekommenderat för listan, Nära dig, Populärt,
 * Från dina favoriter, Upptäck något nytt) och sist Alla platser A–Ö. Med en kategori eller
 * söktext: bara matchande rader.
 *
 * Prestanda (första versionen laggade): allt ligger i EN virtualiserad FlatList (även karusellerna
 * är virtualiserade), så bara det som syns ritas; korten/raderna är memo:ade så ett tillägg bara
 * ritar om det kort som ändrades; gradienterna är expo-linear-gradient (en native-vy) i stället
 * för en SVG per kort; innehållet byggs först NÄR arket glidit upp, inte under animationen;
 * söktexten filtreras via useDeferredValue så tangentbordet aldrig väntar på listan.
 *
 * Urvalet fryses när arket öppnas (vilka som redan fanns + en slumpfrö), så det som lagts till
 * ligger kvar med grön bock och karusellerna inte hoppar runt medan man lägger till flera.
 * Den gröna bocken visas direkt men rullas tillbaka med ett felmeddelande om sparandet misslyckas.
 *
 * Egen Modal + egna gester (inte Sheet.tsx): dra nedåt i huvudet stänger alltid; dra nedåt i
 * innehållet stänger bara när listan redan är högst upp. Karusellerna sveps i sidled utan att
 * arket rör sig (failOffsetX).
 */
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, View, Text, TextInput, Image, FlatList, ScrollView, Pressable, Keyboard, Platform,
  ActivityIndicator, StyleSheet, useWindowDimensions,
} from "react-native";
import Reanimated, {
  FadeIn, FadeInUp, FadeOutDown, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion,
  useSharedValue, withSequence, withSpring, withTiming, Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { Check, MapPin, Plus, Search, X } from "lucide-react-native";
import { usePlaces, firstImageUrl, getTierScore, type Place } from "@/hooks/usePlaces";
import { useFavorites } from "@/hooks/useFavorites";
import { useVisits } from "@/hooks/useVisits";
import { useAddPlaceToList } from "@/hooks/useLists";
import { distanceMeters } from "@/lib/checkin";
import { PressableScale } from "@/components/PressableScale";

const GOLD = "#C5A059";
const FG = "#FFFFFF";
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;
const BUBBLE_MS = 1600;
const CARD_W = 168;
const CARD_H = 220;
const CARD_GAP = 12;
const MAX_CHIPS = 10;

type Bubble = { key: number; text: string; error: boolean };
type Card = { place: Place; note?: string };
type Block =
  | { kind: "carousel"; key: string; title: string; cards: Card[] }
  | { kind: "title"; key: string; title: string }
  | { kind: "row"; key: string; place: Place }
  | { kind: "empty"; key: string; text: string };

const splitCategories = (c: string | null | undefined) =>
  (c ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const imageOf = (p: Place) => firstImageUrl(p.image_url) || p.logo_url || null;
const tier = (p: Place) => getTierScore(p.business_tier);

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
  const { height: winH } = useWindowDimensions();
  const sheetH = Math.round(winH * 0.94);
  const reduceMotion = useReducedMotion();

  const { data: places, isLoading, isError } = usePlaces();
  const { data: favorites = [] } = useFavorites();
  const { data: visits = [] } = useVisits();
  const addPlace = useAddPlaceToList();

  const [mounted, setMounted] = useState(visible);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<{ existing: Set<number>; seed: number }>({ existing: new Set(), seed: 1 });
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<string | null>(null);
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
      setCategory(null);
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

  // ── Tangentbord: flytta upp innehållets botten och bubblan, arket självt står still ──
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(showEvt, (e) => setKeyboardH(e.endCoordinates.height));
    const b = Keyboard.addListener(hideEvt, () => setKeyboardH(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  // ── Gester ──
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

  // ── Kategorichips: de vanligaste kategorierna bland alla platser ──
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    (places ?? []).forEach((p) => splitCategories(p.categories).forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CHIPS).map(([c]) => c);
  }, [places]);

  // ── Urval ──
  const blocks = useMemo((): Block[] => {
    if (!places) return [];
    const { existing, seed } = snapshot;
    const available = places.filter((p) => !existing.has(p.id));
    const rand = seededRandom(seed);
    const jitter = new Map(available.map((p) => [p.id, rand()]));
    const q = deferredQuery.trim().toLowerCase();

    // Kategori och/eller sök → bara rader
    if (q || category) {
      const cat = category?.toLowerCase();
      const matches = available
        .filter((p) => !cat || splitCategories(p.categories).some((c) => c.toLowerCase() === cat))
        .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.categories ?? "").toLowerCase().includes(q))
        .sort((a, b) => {
          if (q) {
            const as = a.name.toLowerCase().startsWith(q) ? 1 : 0;
            const bs = b.name.toLowerCase().startsWith(q) ? 1 : 0;
            if (as !== bs) return bs - as;
          }
          return tier(b) - tier(a) || a.name.localeCompare(b.name, "sv");
        });
      const heading = [category, t("addPlace.count", { count: matches.length })].filter(Boolean).join(" · ");
      return matches.length === 0
        ? [{ kind: "empty", key: "empty", text: t("addPlace.noMatches") }]
        : [{ kind: "title", key: "t-filter", title: heading }, ...matches.map((p): Block => ({ kind: "row", key: `r${p.id}`, place: p }))];
    }

    const out: Block[] = [];
    const carousel = (key: string, title: string, cards: Card[]) => {
      if (cards.length > 0) out.push({ kind: "carousel", key, title, cards });
    };
    const firstCat = (p: Place) => splitCategories(p.categories)[0];

    // Rekommenderat: de fyra vanligaste kategorierna bland listans platser
    const counts = new Map<string, number>();
    places.filter((p) => existing.has(p.id)).forEach((p) =>
      splitCategories(p.categories).forEach((c) => counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1))
    );
    const topCats = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
    const recommended = topCats.length === 0 ? [] : available
      .filter((p) => splitCategories(p.categories).some((c) => topCats.includes(c.toLowerCase())))
      .sort((a, b) => tier(b) - tier(a) || jitter.get(a.id)! - jitter.get(b.id)!)
      .slice(0, 12);
    carousel("recommended", t("addPlace.recommended"), recommended.map((place) => ({ place, note: firstCat(place) })));

    if (here) {
      const nearby = available
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ place: p, m: distanceMeters(here.lat, here.lng, p.lat!, p.lng!) }))
        .sort((a, b) => a.m - b.m)
        .slice(0, 12);
      carousel("nearby", t("addPlace.nearby"), nearby.map(({ place, m }) => ({ place, note: formatDistance(m) })));
    }

    // Populärt: premium/partner först, inbördes i slumpordning så det inte är samma kort varje gång
    const popular = [...available].sort((a, b) => tier(b) - tier(a) || jitter.get(a.id)! - jitter.get(b.id)!).slice(0, 14);
    carousel("popular", t("addPlace.popular"), popular.map((place) => ({ place, note: firstCat(place) })));

    const mine = new Set<number>([
      ...favorites.map((f) => f.place_id).filter((id): id is number => id != null),
      ...visits.map((v) => v.place_id),
    ]);
    carousel("favorites", t("addPlace.favorites"), available.filter((p) => mine.has(p.id)).slice(0, 14).map((place) => ({ place, note: firstCat(place) })));

    // Upptäck: slumpat bland de som inte redan syns i Populärt — en ny blandning varje gång
    const shown = new Set(popular.map((p) => p.id));
    const discover = available.filter((p) => !shown.has(p.id) && imageOf(p))
      .sort((a, b) => jitter.get(a.id)! - jitter.get(b.id)!)
      .slice(0, 12);
    carousel("discover", t("addPlace.discover"), discover.map((place) => ({ place, note: place.nearest_town ?? firstCat(place) })));

    out.push({ kind: "title", key: "t-all", title: t("addPlace.all") });
    if (available.length === 0) out.push({ kind: "empty", key: "empty", text: t("addPlace.noMore") });
    else available.forEach((p) => out.push({ kind: "row", key: `r${p.id}`, place: p }));
    return out;
  }, [places, snapshot, here, favorites, visits, deferredQuery, category, t]);

  // ── Lägg till ──
  const showBubble = useCallback((text: string, error = false) => {
    clearTimeout(bubbleTimer.current);
    setBubble({ key: Date.now(), text, error });
    bubbleTimer.current = setTimeout(() => setBubble(null), BUBBLE_MS);
  }, []);

  const handleAdd = useCallback(async (place: Place) => {
    if (justAddedRef.current.has(place.id)) return;
    setJustAdded((prev) => new Set(prev).add(place.id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showBubble(t("addPlace.added", { name: place.name }));
    try {
      await addPlace.mutateAsync({ listId, placeId: place.id });
    } catch {
      setJustAdded((prev) => { const next = new Set(prev); next.delete(place.id); return next; });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showBubble(t("addPlace.failed", { name: place.name }), true);
    }
  }, [listId, t, showBubble, addPlace.mutateAsync]);

  const savedCount = existingPlaceIds.length;
  const remaining = (places?.length ?? 0) - savedCount;
  const subtitle = [
    t(savedCount === 1 ? "addPlace.savedOne" : "addPlace.savedMany", { count: savedCount }),
    places && remaining > 0 ? t("addPlace.remaining", { count: remaining }) : null,
  ].filter(Boolean).join(" · ");

  const bottomSpace = keyboardH > 0 ? keyboardH : insets.bottom;

  const renderBlock = ({ item }: { item: Block }) => {
    switch (item.kind) {
      case "carousel":
        return <Carousel title={item.title} cards={item.cards} justAdded={justAdded} onAdd={handleAdd} />;
      case "title":
        return <Text style={[s.sectionTitle, { marginTop: 4 }]}>{item.title}</Text>;
      case "row":
        return <PlaceRow place={item.place} added={justAdded.has(item.place.id)} onAdd={handleAdd} />;
      case "empty":
        return <Text style={s.emptyText}>{item.text}</Text>;
    }
  };

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.chips}
              >
                <Chip label={t("addPlace.chipAll")} active={category === null} onPress={() => setCategory(null)} />
                {chips.map((c) => (
                  <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? null : c)} />
                ))}
              </ScrollView>
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
                    <Reanimated.FlatList
                      data={blocks}
                      keyExtractor={(b) => b.key}
                      renderItem={renderBlock}
                      extraData={justAdded}
                      onScroll={onScroll}
                      scrollEventThrottle={16}
                      bounces={false}
                      overScrollMode="never"
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                      initialNumToRender={5}
                      maxToRenderPerBatch={8}
                      windowSize={7}
                      removeClippedSubviews={Platform.OS === "android"}
                      contentContainerStyle={{ paddingTop: 6, paddingBottom: bottomSpace + 24 }}
                    />
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

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Karusell: egen virtualiserad FlatList i sidled ──
const Carousel = memo(function Carousel({
  title, cards, justAdded, onAdd,
}: { title: string; cards: Card[]; justAdded: Set<number>; onAdd: (p: Place) => void }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(c) => String(c.place.id)}
        extraData={justAdded}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
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
  const bounce = useBounce(added, 1.04);
  const add = () => onAdd(place);

  return (
    <PressableScale scale={0.97} onPress={add}>
      <Reanimated.View style={[s.card, bounce]}>
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
      </Reanimated.View>
    </PressableScale>
  );
});

// ── Rad i Alla platser / kategori / sök ──
const PlaceRow = memo(function PlaceRow({ place, added, onAdd }: { place: Place; added: boolean; onAdd: (p: Place) => void }) {
  const [failed, setFailed] = useState(false);
  const uri = imageOf(place);
  const bounce = useBounce(added, 1.015);
  const category = splitCategories(place.categories)[0];
  const meta = [category, place.nearest_town].filter(Boolean).join(" · ");
  const add = () => onAdd(place);

  return (
    <Pressable onPress={add}>
      <Reanimated.View style={[s.row, bounce]}>
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
      </Reanimated.View>
    </Pressable>
  );
});

function AddButton({ added, onPress }: { added: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  return (
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
        <LinearGradient colors={["#D4B574", "#C5A059"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.addBtn}>
          <Plus size={16} color="#121212" strokeWidth={2.8} />
        </LinearGradient>
      )}
    </PressableScale>
  );
}

/** Kort studs (1 → peak → 1) när en plats precis lagts till. */
function useBounce(active: boolean, peak: number) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (active && !reduceMotion) {
      scale.value = withSequence(withTiming(peak, { duration: 140 }), withSpring(1, { damping: 14, stiffness: 220 }));
    }
  }, [active]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
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
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, lineHeight: 30, color: FG, marginTop: 4 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 6 },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },

  searchWrap: { marginHorizontal: 20, height: 48, justifyContent: "center" },
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

  chips: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, gap: 8 },
  chip: {
    paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  chipActive: { backgroundColor: "rgba(197,160,89,0.16)", borderColor: GOLD },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.75)" },
  chipTextActive: { color: GOLD },

  sectionTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: GOLD,
    marginHorizontal: 20, marginBottom: 10,
  },

  card: { width: CARD_W, height: CARD_H, borderRadius: 16, overflow: "hidden", backgroundColor: "#1A1A1D" },
  cardPin: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  cardText: { position: "absolute", left: 12, right: 0, bottom: 12, paddingRight: 48, gap: 3 },
  cardName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 15, lineHeight: 19, color: FG },
  cardNote: { fontFamily: "Inter_500Medium", fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "rgba(255,255,255,0.65)" },
  cardPlus: { position: "absolute", right: 12, bottom: 12 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 16 },
  rowImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)" },
  rowImgFallback: { alignItems: "center", justifyContent: "center" },
  rowName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 15.5, color: FG },
  rowMeta: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.5)", marginTop: 3 },

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
