/**
 * "Lägg till plats" på en lista — ett nästan helskärmshögt, varmt mörkt ark (kopia av Lovables
 * trips/AddPlaceSheet, listvarianten). Fast huvud (grepp, listnamn, rubrik, sökfält); bara
 * innehållet under sökfältet scrollar. Utan söktext: Rekommenderat → Populärt → Från dina
 * favoriter → Alla platser. Med söktext: enbart sökrader.
 *
 * Arket stängs inte när man lägger till, så man kan lägga till flera i rad. Den gröna bocken
 * visas direkt (innan databasen svarat) men rullas tillbaka med ett felmeddelande om skrivningen
 * misslyckas — man ska inte tro att något sparats när nätet är nere.
 *
 * Egen Modal + egna gester (inte Sheet.tsx): dra nedåt i huvudet stänger alltid; dra nedåt i
 * innehållet stänger bara när listan redan är scrollad högst upp. Karusellerna sveps i sidled
 * utan att arket rör sig (failOffsetX).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Modal, View, Text, TextInput, Image, FlatList, Pressable, Keyboard, Platform, ActivityIndicator,
  StyleSheet, useWindowDimensions,
} from "react-native";
import Reanimated, {
  FadeInUp, FadeOutDown, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion,
  useSharedValue, withSequence, withSpring, withTiming, Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient as SvgGrad, Rect as SvgRect, Stop } from "react-native-svg";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Check, MapPin, Plus, Search, X } from "lucide-react-native";
import { usePlaces, firstImageUrl, getTierScore, type Place } from "@/hooks/usePlaces";
import { useFavorites } from "@/hooks/useFavorites";
import { useVisits } from "@/hooks/useVisits";
import { useAddPlaceToList } from "@/hooks/useLists";
import { PressableScale } from "@/components/PressableScale";

const GOLD = "#C5A059";
const FG = "#FFFFFF";
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;
const BUBBLE_MS = 1600;

type Bubble = { key: number; text: string; error: boolean };

const splitCategories = (c: string | null | undefined) =>
  (c ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const imageOf = (p: Place) => firstImageUrl(p.image_url) || p.logo_url || null;
const byTier = (a: Place, b: Place) => getTierScore(b.business_tier) - getTierScore(a.business_tier);

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
  const [query, setQuery] = useState("");
  const [justAdded, setJustAdded] = useState<Set<number>>(new Set());
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [keyboardH, setKeyboardH] = useState(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const translateY = useSharedValue(sheetH);
  const backdrop = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const dragOffset = useSharedValue(0);

  // ── Öppna/stäng ──
  useEffect(() => {
    if (visible) {
      clearTimeout(resetTimer.current);
      setMounted(true);
      translateY.value = sheetH;
      translateY.value = withTiming(0, { duration: reduceMotion ? 0 : 320, easing: Easing.out(Easing.cubic) });
      backdrop.value = withTiming(1, { duration: reduceMotion ? 0 : 240 });
    }
  }, [visible]);

  function finishClose() {
    setMounted(false);
    onClose();
    // Rensa efter att utgångsanimationen hunnit klart, så inget blinkar till på vägen ut
    resetTimer.current = setTimeout(() => {
      setQuery("");
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

  // ── Urval, exakt samma logik som webbappen ──
  const sections = useMemo(() => {
    const all = places ?? [];
    const existing = new Set(existingPlaceIds);
    // Nyss tillagda ligger kvar (med grön bock) tills arket stängs, i stället för att försvinna
    // ur karusellen mitt framför en när listdatan uppdateras
    const available = all.filter((p) => !existing.has(p.id) || justAdded.has(p.id));

    const counts = new Map<string, number>();
    all.filter((p) => existing.has(p.id)).forEach((p) =>
      splitCategories(p.categories).forEach((c) => counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1))
    );
    const topCats = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
    const recommended = topCats.length === 0 ? [] : available
      .filter((p) => splitCategories(p.categories).some((c) => topCats.includes(c.toLowerCase())))
      .sort(byTier)
      .slice(0, 12);

    const popular = [...available].sort(byTier).slice(0, 14);

    const mine = new Set<number>([
      ...favorites.map((f) => f.place_id).filter((id): id is number => id != null),
      ...visits.map((v) => v.place_id),
    ]);
    const fromFavorites = available.filter((p) => mine.has(p.id)).slice(0, 14);

    const q = query.trim().toLowerCase();
    const results = q
      ? available.filter((p) => p.name.toLowerCase().includes(q) || (p.categories ?? "").toLowerCase().includes(q)).slice(0, 60)
      : [];

    return {
      recommended, popular, fromFavorites, allPlaces: available.slice(0, 80), results,
      searching: q.length > 0, total: all.length,
    };
  }, [places, existingPlaceIds, justAdded, favorites, visits, query]);

  // ── Lägg till ──
  function showBubble(text: string, error = false) {
    clearTimeout(bubbleTimer.current);
    setBubble({ key: Date.now(), text, error });
    bubbleTimer.current = setTimeout(() => setBubble(null), BUBBLE_MS);
  }

  async function handleAdd(place: Place) {
    if (justAdded.has(place.id)) return;
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
  }

  const savedCount = existingPlaceIds.length;
  const remaining = sections.total - savedCount;
  const subtitle = [
    t(savedCount === 1 ? "addPlace.savedOne" : "addPlace.savedMany", { count: savedCount }),
    places && remaining > 0 ? t("addPlace.remaining", { count: remaining }) : null,
  ].filter(Boolean).join(" · ");

  const bottomSpace = keyboardH > 0 ? keyboardH : insets.bottom;

  const carousel = (title: string, data: Place[]) =>
    data.length === 0 ? null : (
      <View style={{ marginBottom: 24 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        <FlatList
          horizontal
          data={data}
          keyExtractor={(p) => String(p.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          renderItem={({ item }) => (
            <PlaceCard place={item} added={justAdded.has(item.id)} onAdd={() => handleAdd(item)} />
          )}
        />
      </View>
    );

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.8)" }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel={t("addPlace.close")} />
        </Reanimated.View>

        <Reanimated.View style={[s.sheet, { height: sheetH }, sheetStyle]}>
          <GradientFill id="sheet" stops={[["#2A2118", 1], ["#121212", 1]]} />

          {/* ── Fast huvud: grepp, rubrik, sökfält ── */}
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
              </View>
            </View>
          </GestureDetector>

          {/* ── Scrollande innehåll ── */}
          <GestureDetector gesture={bodyPan}>
            <View style={{ flex: 1 }}>
              <GestureDetector gesture={nativeScroll}>
                <Reanimated.ScrollView
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                  bounces={false}
                  overScrollMode="never"
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomSpace + 24 }}
                >
                  {isLoading ? (
                    <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
                  ) : isError ? (
                    <Text style={s.emptyText}>{t("common.error")}</Text>
                  ) : sections.searching ? (
                    sections.results.length === 0 ? (
                      <Text style={s.emptyText}>{t("addPlace.noMatches")}</Text>
                    ) : (
                      <View style={s.rows}>
                        {sections.results.map((p) => (
                          <PlaceListRow key={p.id} place={p} added={justAdded.has(p.id)} onAdd={() => handleAdd(p)} />
                        ))}
                      </View>
                    )
                  ) : (
                    <>
                      {carousel(t("addPlace.recommended"), sections.recommended)}
                      {carousel(t("addPlace.popular"), sections.popular)}
                      {carousel(t("addPlace.favorites"), sections.fromFavorites)}
                      <Text style={s.sectionTitle}>{t("addPlace.all")}</Text>
                      {sections.allPlaces.length === 0 ? (
                        <Text style={[s.emptyText, { marginTop: 0, textAlign: "left", paddingHorizontal: 20 }]}>{t("addPlace.noMore")}</Text>
                      ) : (
                        <View style={s.rows}>
                          {sections.allPlaces.map((p) => (
                            <PlaceListRow key={p.id} place={p} added={justAdded.has(p.id)} onAdd={() => handleAdd(p)} />
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </Reanimated.ScrollView>
              </GestureDetector>
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

// ── Stort kort i en karusell ──
function PlaceCard({ place, added, onAdd }: { place: Place; added: boolean; onAdd: () => void }) {
  const [failed, setFailed] = useState(false);
  const uri = imageOf(place);
  const bounce = useBounce(added, 1.04);
  const category = splitCategories(place.categories)[0];

  return (
    <PressableScale scale={0.97}>
      <Reanimated.View style={[s.card, bounce]}>
        {uri && !failed ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <>
            <GradientFill id={`fb${place.id}`} stops={[["#C5A059", 0.18], ["#121212", 1, 0.7]]} vertical />
            <View style={s.cardPin}><MapPin size={24} color={GOLD} strokeWidth={2} /></View>
          </>
        )}
        {/* Mörk toning nedåt — det som gör att texten alltid går att läsa, och kortets svarta fot */}
        <GradientFill id={`sh${place.id}`} stops={[["#000000", 0.05], ["#000000", 0.35, 0.5], ["#000000", 0.92, 1]]} vertical />
        <View style={s.cardText}>
          <Text style={s.cardName} numberOfLines={2}>{place.name}</Text>
          {category ? <Text style={s.cardCategory} numberOfLines={1}>{category}</Text> : null}
        </View>
        <View style={s.cardPlus}><AddButton added={added} onPress={onAdd} /></View>
      </Reanimated.View>
    </PressableScale>
  );
}

// ── Rad i "Alla platser" och sökresultat ──
function PlaceListRow({ place, added, onAdd }: { place: Place; added: boolean; onAdd: () => void }) {
  const [failed, setFailed] = useState(false);
  const uri = imageOf(place);
  const bounce = useBounce(added, 1.015);
  const category = splitCategories(place.categories)[0];

  return (
    <Reanimated.View style={[s.row, bounce]}>
      {uri && !failed ? (
        <Image source={{ uri }} style={s.rowImg} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <View style={[s.rowImg, s.rowImgFallback]}><MapPin size={20} color="rgba(255,255,255,0.3)" strokeWidth={2} /></View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.rowName} numberOfLines={1}>{place.name}</Text>
        {category ? <Text style={s.rowCategory} numberOfLines={1}>{category}</Text> : null}
      </View>
      <AddButton added={added} onPress={onAdd} />
    </Reanimated.View>
  );
}

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
      <View style={s.addBtn}>
        {added ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(34,197,94,0.95)" }]} />
        ) : (
          <GradientFill id="plus" stops={[["#D4B574", 1], ["#C5A059", 1]]} />
        )}
        {added
          ? <Check size={16} color="#FFFFFF" strokeWidth={2.8} />
          : <Plus size={16} color="#121212" strokeWidth={2.8} />}
      </View>
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

/**
 * SVG-gradient som fyller sin förälder (appens standard i stället för expo-linear-gradient).
 * stops: [färg, opacitet, position?]; utan position sprids de jämnt. Diagonal (135°) som
 * standard, vertical = uppifrån och ned.
 */
function GradientFill({ id, stops, vertical = false }: { id: string; stops: [string, number, number?][]; vertical?: boolean }) {
  const gid = `${id}${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgGrad id={gid} x1="0" y1="0" x2={vertical ? "0" : "1"} y2="1">
          {stops.map(([color, opacity, offset], i) => (
            <Stop key={i} offset={offset ?? i / Math.max(1, stops.length - 1)} stopColor={color} stopOpacity={opacity} />
          ))}
        </SvgGrad>
      </Defs>
      <SvgRect width="100%" height="100%" fill={`url(#${gid})`} />
    </Svg>
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
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, lineHeight: 30, color: FG, marginTop: 4 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 6 },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },

  searchWrap: { marginHorizontal: 20, marginBottom: 12, height: 48, justifyContent: "center" },
  searchIcon: { position: "absolute", left: 14, zIndex: 1 },
  searchInput: {
    height: 48, borderRadius: 24, paddingLeft: 40, paddingRight: 16,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    fontFamily: "Inter_400Regular", fontSize: 16, color: FG,
  },

  sectionTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: GOLD,
    marginHorizontal: 20, marginBottom: 10,
  },

  card: { width: 180, height: 240, borderRadius: 16, overflow: "hidden", backgroundColor: "#121212" },
  cardPin: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  cardText: { position: "absolute", left: 12, right: 0, bottom: 12, paddingRight: 48, gap: 3 },
  cardName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 15, lineHeight: 19, color: FG },
  cardCategory: { fontFamily: "Inter_500Medium", fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "rgba(255,255,255,0.65)" },
  cardPlus: { position: "absolute", right: 12, bottom: 12 },

  rows: { marginHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 16 },
  rowImg: { width: 64, height: 64, borderRadius: 12 },
  rowImgFallback: { backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" },
  rowName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 15.5, color: FG },
  rowCategory: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 },

  // Skuggan på ett yttre lager — overflow:hidden (som gradienten behöver) klipper annars bort den på iOS
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
