/**
 * Sök.
 *
 * Innan man skriver: "Vad vill du göra?" (Äta nu, Fika, Sova i natt …, med hur många som finns
 * just nu), det som har öppet nära mig, och orterna med ett foto därifrån. Trycker man i
 * sökfältet: senaste sökningarna (det man öppnat via söket och det man sökt på, som i Spotify).
 *
 * När man skriver söks allt i telefonen (lib/search), så svaret kommer på första bokstaven. Överst
 * ett svarskort med det viktigaste direkt: "Bästa träff" (platsen själv: öppet, avstånd, karta,
 * vägbeskrivning), eller en sammanfattning av vad söket förstått ("Fika i Kivik — 6 ställen,
 * 3 öppna nu, närmast 1,2 km") med chips som tar bort en del av frågan. Sen platser, evenemang
 * och orter, med det man sökt på markerat. Inga träffar: "Menade du …?". Förslagen på vad man
 * kan söka tas ur det som faktiskt finns i appen.
 *
 * Snabbhet: bläddrandet och söket ligger båda kvar och tonar bara över. Bläddrandet ritas inte om
 * när man skriver. Söket visar de första raderna direkt och resten när övergången är klar, och
 * övergången börjar först när innehållet hunnit ritas — annars hackade det när man tryckte.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import Reanimated, {
  Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming, FadeInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import i18n from "i18next";
import { Trans, useTranslation } from "react-i18next";
import { Image as ExpoImage } from "expo-image";
import { CalendarDays, Check, Clock, MapPin, Moon, Search, UtensilsCrossed, X, type LucideIcon } from "lucide-react-native";
import { firstImageUrl, usePlaces, type Place } from "@/hooks/usePlaces";
import { useEvents, type Event } from "@/hooks/useEvents";
import { savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { useKnownLocation } from "@/hooks/useUserLocation";
import { useTheme } from "@/theme/ThemeProvider";
import { CATEGORIES, findCategory, withAlpha, type CategoryId } from "@/theme/categories";
import { PRACTICAL, distanceLabel } from "@/lib/mapFilters";
import {
  TASTES, atLabel, atPhrase, buildIndex, buildTowns, didYouMean, norm, openInfo, openLate, parseQuery, placeCategories, searchEvents,
  practicalLabel, searchPlaces, searchTowns, whenWord, withoutIntent, type IndexedPlace, type Intent, type Parsed, type PlaceHit, type Town,
} from "@/lib/search";
import { distanceMeters } from "@/lib/checkin";
import { useSearchHistory, type HistoryEntry } from "@/lib/searchHistory";
import { eventWhen } from "@/lib/events";
import { openEvent } from "@/lib/eventSheet";
import { pushOnce } from "@/lib/navigateOnce";
import { openDirections } from "@/lib/placeLinks";
import { registerScrollCallback } from "@/lib/scrollRefs";
import { TILES, TINT, type Tint } from "@/lib/searchShortcuts";
import { FLOATING_NAV_HEIGHT } from "@/components/navigation/FloatingNav";
import { Skeleton } from "@/components/Skeleton";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import {
  CATEGORY_DOT, CategoryDots, CategoryLine, ChipView, EventResultRow, HistoryRow, PlaceAnswer, PlaceResultRow, SectionHeader,
  SummaryAnswer, TownRow, useOpenColors, type Chip,
} from "@/components/search/SearchParts";

/** Tomt medan något laddas: alltid samma tomma lista (en ny vid varje uppritning räknar om allt) */
const NONE: never[] = [];

/** Snabb inglidning för de första delarna, kort efter varandra (som Kalender) */
const enterAt = (index: number) => (index < 8 ? FadeInDown.delay(index * 45).duration(300) : undefined);

/** Platser som visas innan "Visa alla" */
const FIRST_PLACES = 20;
/** Rader som ritas direkt när söket öppnas — resten när övergången är klar */
const FIRST_ROWS = 6;
/** Orter som syns innan "Visa alla" */
const FIRST_TOWNS = 8;

/** Under så här många visar rutorna på Sök en beskrivning i stället för siffran */
const FEW = 5;

/** "1 öppet nu", "3 öppna nu" */
const openNowText = (n: number) => i18n.t(n === 1 ? "search.count.openOne" : "search.count.openOther", { count: n });
/** "1 plats", "12 platser" */
const placesText = (n: number) => i18n.t(n === 1 ? "search.count.placeOne" : "search.count.placeOther", { count: n });

/** Färgen för något söket förstått (svarskortets ring och chipsens ikoner) */
function intentTint(x: Intent, scheme: "dark" | "light"): string {
  if (x.kind === "category") return CATEGORY_DOT[scheme][x.value];
  if (x.kind === "practical") return (x.value === "family" ? TINT.kids : x.value === "pets" ? TINT.dog : TINT.gold)[scheme];
  if (x.kind === "open" || x.kind === "at") return TINT.open[scheme];
  if (x.kind === "taste") { const cat = TASTES[x.value].category; return cat ? CATEGORY_DOT[scheme][cat] : TINT.gold[scheme]; }
  if (x.kind === "late") return TINT.late[scheme];
  if (x.kind === "events" || x.kind === "when") return TINT.events[scheme];
  return TINT.gold[scheme];
}

/** Rubriken i sammanfattningen per kategori ("Fika"), och ordet en kategori-chip söker med ("fika") */
const catTitle = (id: CategoryId) => i18n.t(`search.catTitle.${id}`);
const catQuery = (id: CategoryId) => i18n.t(`search.words.cat.${id}`);
/** Vad en kategori kallas i sammanfattningen ("6 caféer · 4 boenden") */
const catNoun = (id: CategoryId, n: number) => i18n.t(n === 1 ? `search.catNounOne.${id}` : `search.catNounOther.${id}`);
/** Ord som föreslås bara om de faktiskt finns hos minst två platser (på svenska, som beskrivningarna) */
const MAYBE_WORDS = ["konst", "glass", "vin", "keramik", "loppis", "gårdsbutik"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const catIcon = (id: CategoryId): LucideIcon => CATEGORIES.find((c) => c.id === id)?.icon ?? MapPin;
const practicalIcon = (id: string): LucideIcon => PRACTICAL.find((p) => p.id === id)?.Icon ?? Check;

/** En ort med det sidan visar om den: vad som finns där (kategorierna, flest först), hur långt bort, öppet nu */
interface TownCard extends Town { cats: CategoryId[]; km: number | null; open: number }

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, scheme } = useTheme();
  const { t, i18n: lang } = useTranslation();
  const inputRef = useRef<TextInput>(null);

  const { data: places = NONE as Place[], isFetched: placesFetched } = usePlaces();
  const { data: events = NONE as Event[] } = useEvents();
  const { data: favorites = NONE as NonNullable<ReturnType<typeof useFavorites>["data"]> } = useFavorites();
  const loc = useKnownLocation();
  const history = useSearchHistory();
  const addHistory = history.add;

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Har man en gång gått in i söket står det kvar tills Avbryt: när tangentbordet åker ner (man
  // scrollar i historiken) eller man kommer tillbaka från en plats (som i Spotify)
  const [stay, setStay] = useState(false);
  const searching = focused || query.length > 0 || stay;
  const changeQuery = useCallback((q: string) => {
    setQuery(q);
    setShowAll(false);
  }, []);
  const ask = useCallback((q: string) => {
    Haptics.selectionAsync().catch(() => {});
    changeQuery(q);
  }, [changeQuery]);

  // En genväg på Hem ("Äta nu", "Fika" …) öppnar Sök med frågan redan ställd
  const params = useLocalSearchParams<{ ask?: string; n?: string }>();
  useEffect(() => {
    if (params.ask) changeQuery(params.ask);
  }, [params.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Öppet nu (och siffrorna i rutorna) räknas om när man kommer tillbaka till sidan — om klockan
  // hunnit slå om en minut sedan sist (samma minut ger samma svar, och då räknas inget i onödan)
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 60_000));
  useFocusEffect(useCallback(() => { setTick(Math.floor(Date.now() / 60_000)); }, []));

  const index = useMemo(() => buildIndex(places), [places]);
  const towns = useMemo(() => buildTowns(places), [places]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // ── Orterna: vad som finns där, avstånd till mitten av orten, öppet nu ──
  const townCards = useMemo<TownCard[]>(() => {
    const byTown = new Map<string, IndexedPlace[]>();
    index.forEach((p) => {
      if (!p.town) return;
      const list = byTown.get(p.town);
      if (list) list.push(p); else byTown.set(p.town, [p]);
    });
    const cards = towns.map((t) => {
      const list = byTown.get(t.key) ?? [];
      // Kategorierna i orten, flest först
      const perCat = new Map<CategoryId, number>();
      list.forEach((p) => p.cats.forEach((c) => perCat.set(c, (perCat.get(c) ?? 0) + 1)));
      const cats = [...perCat.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
      const pts = list.filter((p) => p.place.lat != null && p.place.lng != null);
      const km = loc && pts.length > 0
        ? distanceMeters(
          loc.lat, loc.lng,
          pts.reduce((sum, p) => sum + p.place.lat!, 0) / pts.length,
          pts.reduce((sum, p) => sum + p.place.lng!, 0) / pts.length,
        ) / 1000
        : null;
      return {
        ...t,
        cats,
        km,
        open: list.filter((p) => openInfo(p.place)?.open).length,
      };
    });
    // Närmast först om vi vet var man är, annars flest platser
    return loc ? cards.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9)) : cards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, towns, loc, tick]);
  const townCardByKey = useMemo(() => new Map(townCards.map((t) => [t.key, t])), [townCards]);

  // ── Sparade platser (hjärtat på "Bästa träff"): ändras direkt här, resten av appen får veta när
  // man lämnar sidan (samma som kartan)
  const serverSaved = useMemo(() => new Set(favorites.flatMap((f) => (f.place_id != null ? [f.place_id] : []))), [favorites]);
  const [overrides, setOverrides] = useState<Map<number, boolean>>(() => new Map());
  const isSaved = (id: number) => overrides.get(id) ?? serverSaved.has(id);
  const toggleSave = (id: number) => {
    const save = !isSaved(id);
    setOverrides((prev) => new Map(prev).set(id, save));
    savePlaceFavorite(id, save).catch(() => setOverrides((prev) => new Map(prev).set(id, !save)));
  };
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  useFocusEffect(useCallback(() => () => {
    if (overridesRef.current.size === 0) return;
    queryClient.invalidateQueries({ queryKey: ["favorites"] }).then(() => setOverrides(new Map()));
  }, [queryClient]));
  const { burst, show: showBurst } = useLikeBurst();

  // ── Sökfältet ─────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    setStay(false);
    changeQuery("");
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, [changeQuery]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!searching) return false;
      cancel();
      return true;
    });
    return () => sub.remove();
  }, [searching, cancel]);

  // Bläddrandet och söket ligger båda kvar; att byta tonar bara över. Övergången börjar två
  // bildrutor efter trycket, när det nya innehållet hunnit ritas (annars hackade den)
  const mode = useSharedValue(0);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        mode.value = withTiming(searching ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [searching, mode]);
  const browseStyle = useAnimatedStyle(() => ({ opacity: 1 - mode.value, transform: [{ translateY: mode.value * 10 }] }));
  const searchStyle = useAnimatedStyle(() => ({ opacity: mode.value, transform: [{ translateY: (1 - mode.value) * 10 }] }));
  // De första raderna direkt, resten när övergången är klar
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!searching) { setSettled(false); return; }
    const t = setTimeout(() => setSettled(true), 320);
    return () => clearTimeout(t);
  }, [searching]);

  // Fliktrycket i navigeringen scrollar upp det som visas
  const browseRef = useRef<ScrollView>(null);
  const resultsRef = useRef<ScrollView>(null);
  const searchingRef = useRef(searching);
  searchingRef.current = searching;
  useEffect(() => {
    registerScrollCallback("search", () => {
      (searchingRef.current ? resultsRef : browseRef).current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  // ── Att öppna något (via söket hamnar det överst i historiken) ───────────
  const openPlace = useCallback((place: Place, fromSearch: boolean) => {
    Keyboard.dismiss();
    if (fromSearch) addHistory({ kind: "place", id: place.id });
    pushOnce(router, `/place/${place.id}?from=search`);
  }, [addHistory, router]);
  const openEventItem = useCallback((event: Event, fromSearch: boolean) => {
    Keyboard.dismiss();
    if (fromSearch) addHistory({ kind: "event", id: event.id });
    openEvent(event.id, { event });
  }, [addHistory]);
  const chooseTown = useCallback((name: string) => {
    addHistory({ kind: "town", name });
    ask(name);
  }, [addHistory, ask]);
  const onResultPlace = useCallback((p: Place) => openPlace(p, true), [openPlace]);
  const onResultEvent = useCallback((e: Event) => openEventItem(e, true), [openEventItem]);
  const onBrowsePlace = useCallback((p: Place) => openPlace(p, false), [openPlace]);

  // ── Bläddra: rutornas siffror och det som har öppet nära mig ─────────────
  const tiles = useMemo(() => {
    if (!placesFetched) return null;
    const now = new Date();
    const count = (q: string) => {
      const r = searchPlaces(index, parseQuery(q, towns), loc, now);
      return r.relaxed.length > 0 ? 0 : r.hits.length;
    };
    const upcoming = searchEvents(events, parseQuery("evenemang", towns), now).length;
    const n = {
      eat: count("äta nu"), fika: count("fika"), sleep: count("sova"), late: count("öppet sent"),
      kids: count("familj"), dog: count("med hund"), nature: count("natur"),
    };
    // Är det färre än 5 står en beskrivning i stället — en ensam etta ser tom ut
    const many = (k: number, text: string, few: string) => (k >= FEW ? text : few);
    const subs: Record<string, string> = {
      eat: many(n.eat, openNowText(n.eat), t(n.eat ? "search.tiles.nearYou" : "search.tiles.nothingOpen")),
      fika: many(n.fika, t("search.tiles.fikaMany", { count: n.fika }), t("search.tiles.fikaFew")),
      sleep: many(n.sleep, t("search.tiles.sleepMany", { count: n.sleep }), t("search.tiles.sleepFew")),
      late: many(n.late, t("search.tiles.lateMany", { count: n.late }), t(n.late ? "search.tiles.lateFew" : "search.tiles.lateNone")),
      kids: many(n.kids, t("search.tiles.kidsMany", { count: n.kids }), t("search.tiles.kidsFew")),
      dog: many(n.dog, t("search.tiles.dogMany", { count: n.dog }), t("search.tiles.dogFew")),
      nature: many(n.nature, t("search.tiles.natureMany", { count: n.nature }), t("search.tiles.natureFew")),
      events: many(upcoming, t("search.tiles.eventsMany", { count: upcoming }), t(upcoming ? "search.tiles.eventsFew" : "search.tiles.eventsNone")),
    };
    return subs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesFetched, index, towns, events, loc, tick, lang.language]);

  const openNearby = useMemo(() => {
    if (!placesFetched) return null;
    return searchPlaces(index, parseQuery("öppet", towns), loc).hits.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesFetched, index, towns, loc, tick]);

  /**
   * Förslag på vad man kan söka — bara sådant som faktiskt finns: kategorier i den ort som har
   * flest (olika orter för olika förslag), "äta nu" bara om något har öppet, evenemang bara om det
   * finns några, och ord som "konst" bara om minst två platser har det.
   */
  const suggestions = useMemo(() => {
    if (!placesFetched) return [] as string[];
    const now = new Date();
    const perTown = new Map<string, Map<CategoryId, number>>();
    index.forEach((p) => {
      if (!p.town) return;
      const m = perTown.get(p.town) ?? new Map<CategoryId, number>();
      p.cats.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1));
      perTown.set(p.town, m);
    });
    const used = new Set<string>();
    const inBestTown = (word: string, cat: CategoryId, min: number) => {
      let best: Town | null = null;
      let bestN = 0;
      for (const t of towns) {
        const n = perTown.get(t.key)?.get(cat) ?? 0;
        if (n >= min && n > bestN && !used.has(t.key)) { best = t; bestN = n; }
      }
      if (!best) return null;
      used.add(best.key);
      return t("search.suggest.inTown", { what: word, town: best.name });
    };
    const has = (pred: (p: IndexedPlace) => boolean) => index.some(pred);
    const out: string[] = [];
    const push = (q: string | null) => { if (q && !out.includes(q)) out.push(q); };
    push(inBestTown(catQuery("cafe-bageri"), "cafe-bageri", 2));
    push(has((p) => p.cats.has("mat-dryck") && !!openInfo(p.place, now)?.open) ? t("search.suggest.eatNow") : inBestTown(catQuery("mat-dryck"), "mat-dryck", 2));
    push(inBestTown(catQuery("hotell-bb"), "hotell-bb", 1));
    if (has((p) => p.amenities.family === true || p.catText.includes("barn & familj"))) push(t("search.suggest.family"));
    if (has((p) => openLate(p.place, now))) push(t("search.suggest.openLate"));
    if (searchEvents(events, parseQuery("i helgen", towns), now).length > 0) push(t("search.suggest.weekend"));
    else if (searchEvents(events, parseQuery("evenemang", towns), now).length > 0) push(t("search.suggest.events"));
    // Fria ord söks i platsernas (svenska) beskrivningar, så de föreslås bara på svenska
    if (lang.language === "sv") {
      MAYBE_WORDS.forEach((w) => {
        const key = norm(w);
        if (index.filter((p) => p.name.includes(key) || p.catText.includes(key) || p.text.includes(key)).length >= 2) push(w);
      });
    }
    if (has((p) => p.cats.has("natur-upplevelser"))) push(t("search.suggest.nature"));
    return out.slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesFetched, index, towns, events, tick, lang.language]);

  // ── Söket (räknas direkt — det tar några millisekunder) ──────────────────
  const parsed = useMemo(() => parseQuery(query, towns), [query, towns]);
  const results = useMemo(() => {
    if (!query.trim()) return null;
    const now = new Date();
    const placeIntents = parsed.intents.some((x) => x.kind !== "events" && x.kind !== "when");
    const showPlaces = parsed.text.length > 0 || placeIntents;
    const placeResult = showPlaces ? searchPlaces(index, parsed, loc, now) : { hits: [] as PlaceHit[], relaxed: [] as Intent[], ignored: [] as string[] };
    const eventHits = searchEvents(events, parsed, now);
    const townHits = searchTowns(towns, parsed);
    const empty = placeResult.hits.length === 0 && eventHits.length === 0 && townHits.length === 0
      && !parsed.intents.some((x) => x.kind === "town");
    return {
      places: placeResult,
      events: eventHits,
      towns: townHits,
      suggestion: empty ? didYouMean(index, towns, parsed, query.trim()) : null,
      empty,
    };
  }, [query, parsed, index, towns, events, loc]);

  const answer = useMemo(
    () => (results ? buildAnswer(parsed, results.places, results.events, index, scheme, ask) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, parsed, index, scheme, ask, lang.language],
  );

  const bottomPad = FLOATING_NAV_HEIGHT + insets.bottom + 110;

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      {/* ── Rubriken och sökfältet ── */}
      <View style={{ paddingTop: Math.max(insets.top, 44), paddingHorizontal: 16 }}>
        <View style={s.titleRow}>
          <Text style={[s.title, { color: colors.text }]}>{t("search.title")}</Text>
        </View>
        <View style={s.fieldRow}>
          <Reanimated.View
            layout={LinearTransition.duration(200)}
            style={[s.field, { backgroundColor: colors.card, borderColor: focused ? colors.goldBorder : colors.border }]}
          >
            <Search size={18} color={colors.muted} strokeWidth={2.2} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={changeQuery}
              onFocus={() => { setFocused(true); setStay(true); }}
              onBlur={() => setFocused(false)}
              onSubmitEditing={() => addHistory({ kind: "term", text: query.trim() })}
              placeholder={t("search.placeholder")}
              placeholderTextColor={colors.faint}
              selectionColor={colors.gold}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              style={[s.input, { color: colors.text }]}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { changeQuery(""); inputRef.current?.focus(); }} hitSlop={12} accessibilityLabel={t("search.clear")}>
                <View style={[s.clear, { backgroundColor: colors.fill }]}>
                  <X size={12} color={colors.muted} strokeWidth={2.6} />
                </View>
              </TouchableOpacity>
            )}
          </Reanimated.View>
          {searching && (
            <Reanimated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <TouchableOpacity onPress={cancel} hitSlop={10}>
                <Text style={[s.cancel, { color: colors.goldText }]}>{t("search.cancel")}</Text>
              </TouchableOpacity>
            </Reanimated.View>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {/* ── Bläddra (ritas inte om när man skriver) ── */}
        <Reanimated.View style={[StyleSheet.absoluteFill, browseStyle]} pointerEvents={searching ? "none" : "auto"}>
          <BrowsePanel
            scrollRef={browseRef}
            bottomPad={bottomPad}
            tiles={tiles}
            nearby={openNearby}
            hasLoc={!!loc}
            towns={placesFetched ? townCards : null}
            onAsk={ask}
            onOpenPlace={onBrowsePlace}
          />
        </Reanimated.View>

        {/* ── Söket ── */}
        <Reanimated.View style={[StyleSheet.absoluteFill, searchStyle]} pointerEvents={searching ? "auto" : "none"}>
          <ScrollView
            ref={resultsRef}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {!results ? (
              <HistoryList
                entries={settled ? history.entries : history.entries.slice(0, FIRST_ROWS + 1)}
                placeById={placeById}
                eventById={eventById}
                suggestions={suggestions}
                onPlace={onResultPlace}
                onEvent={onResultEvent}
                onTown={chooseTown}
                onTerm={ask}
                onRemove={history.remove}
                onClear={history.clear}
              />
            ) : results.empty ? (
              <View style={s.empty}>
                <Text style={[s.emptyTitle, { color: colors.text }]}>{t("search.noHits", { query: query.trim() })}</Text>
                {results.suggestion ? (
                  <TouchableOpacity onPress={() => ask(results.suggestion!.query)} activeOpacity={0.75}>
                    <Text style={[s.emptyText, { color: colors.muted }]}>
                      <Trans
                        i18nKey="search.didYouMean"
                        values={{ query: results.suggestion.query }}
                        components={{ b: <Corrected text={results.suggestion.query} words={results.suggestion.words} /> }}
                      />
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[s.emptyText, { color: colors.muted }]}>{t("search.tryOther")}</Text>
                )}
                {suggestions.length > 0 && (
                  <View style={[s.tryRow, { marginTop: 16, justifyContent: "center" }]}>
                    {suggestions.map((t) => <ChipView key={t} chip={{ key: t, label: t, Icon: Search, onPress: () => ask(t) }} />)}
                  </View>
                )}
              </View>
            ) : (
              <Results
                parsed={parsed}
                results={results}
                answer={answer}
                limit={settled ? (showAll ? Infinity : FIRST_PLACES) : FIRST_ROWS}
                eventLimit={settled ? 12 : 3}
                townCardByKey={townCardByKey}
                isSaved={isSaved}
                onShowAll={() => setShowAll(true)}
                onPlace={onResultPlace}
                onEvent={onResultEvent}
                onTown={chooseTown}
                onMap={(p) => {
                  addHistory({ kind: "place", id: p.id });
                  router.navigate({ pathname: "/(tabs)/map", params: { place: String(p.id) } });
                }}
                onToggleSave={toggleSave}
                onBurst={showBurst}
              />
            )}
          </ScrollView>
        </Reanimated.View>
      </View>

      <LikeBurst burst={burst} />
    </View>
  );
}

// ── Bläddra ─────────────────────────────────────────────────────────────────

const BrowsePanel = memo(function BrowsePanel({
  scrollRef, bottomPad, tiles, nearby, hasLoc, towns, onAsk, onOpenPlace,
}: {
  scrollRef: React.RefObject<ScrollView | null>;
  bottomPad: number;
  tiles: Record<string, string> | null;
  nearby: PlaceHit[] | null;
  hasLoc: boolean;
  towns: TownCard[] | null;
  onAsk: (q: string) => void;
  onOpenPlace: (p: Place) => void;
}) {
  const { t } = useTranslation();
  const [allTowns, setAllTowns] = useState(false);
  const shownTowns = towns ? (allTowns ? towns : towns.slice(0, FIRST_TOWNS)) : null;
  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Reanimated.View entering={enterAt(0)}>
        <SectionHeader title={t("search.whatToDo")} />
        <View style={s.tiles}>
          {TILES.map((t) => (
            <IntentTile key={t.key} label={t.label} Icon={t.Icon} tint={t.tint} sub={tiles?.[t.key] ?? null} onPress={() => onAsk(t.query)} />
          ))}
        </View>
      </Reanimated.View>

      {(nearby === null || nearby.length > 0) && (
        <Reanimated.View entering={enterAt(1)}>
          <SectionHeader title={t(hasLoc ? "search.openNowNear" : "search.openNow")} action={t("search.showAll")} onAction={() => onAsk(t("search.queries.open"))} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.nearRow}>
            {nearby === null
              ? [0, 1, 2].map((i) => <NearCardSkeleton key={i} />)
              : nearby.map((h) => <NearCard key={h.place.id} hit={h} onPress={onOpenPlace} />)}
          </ScrollView>
        </Reanimated.View>
      )}

      <Reanimated.View entering={enterAt(2)}>
        <SectionHeader
          title={t("search.exploreTowns")}
          action={towns && towns.length > FIRST_TOWNS ? t(allTowns ? "search.showFewer" : "search.showAll") : undefined}
          onAction={() => setAllTowns((v) => !v)}
        />
        <View style={s.townGrid}>
          {shownTowns
            ? shownTowns.map((t) => <TownTile key={t.key} town={t} onPress={() => onAsk(t.name)} />)
            : [0, 1, 2, 3].map((i) => <TownTileSkeleton key={i} />)}
        </View>
      </Reanimated.View>
    </ScrollView>
  );
});

function IntentTile({ label, sub, Icon, tint, onPress }: {
  label: string; sub: string | null; Icon: LucideIcon; tint: Tint; onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const color = tint[scheme];
  return (
    <TouchableOpacity style={[s.tile, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.75} onPress={onPress}>
      <View style={[s.tileIcon, { backgroundColor: tint.ring === "night" ? (scheme === "dark" ? "rgba(255,255,255,0.10)" : "rgba(35,28,15,0.08)") : withAlpha(color, scheme === "dark" ? 0.16 : 0.1) }]}>
        <Icon size={19} color={color} strokeWidth={2.1} />
      </View>
      <View style={s.tileBody}>
        <Text style={[s.tileLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={[s.tileSub, { color: colors.muted }]} numberOfLines={1}>{sub}</Text> : <Skeleton width={64} height={10} radius={5} />}
      </View>
    </TouchableOpacity>
  );
}

/** Ett ställe som har öppet nu: bilden, och all text under (öppettiden grön, avståndet grått) */
const NearCard = memo(function NearCard({ hit, onPress }: { hit: PlaceHit; onPress: (p: Place) => void }) {
  const { colors } = useTheme();
  const c = useOpenColors();
  const image = firstImageUrl(hit.place.image_url);
  return (
    <TouchableOpacity style={s.near} activeOpacity={0.85} onPress={() => onPress(hit.place)}>
      <View style={[s.nearImage, { backgroundColor: colors.fill }]}>
        {image && <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />}
      </View>
      <Text style={[s.nearName, { color: colors.text }]} numberOfLines={1}>{hit.place.name}</Text>
      <CategoryLine place={hit.place} />
      <Text style={s.nearOpen} numberOfLines={1}>
        <Text style={{ color: c.open }}>{hit.open?.label ?? i18n.t("search.open")}</Text>
        {hit.km != null && <Text style={{ color: colors.faint }}>{`  ·  ${distanceLabel(hit.km)}`}</Text>}
      </Text>
    </TouchableOpacity>
  );
});

function NearCardSkeleton() {
  return (
    <View style={s.near}>
      <Skeleton width={156} height={112} radius={14} />
      <Skeleton width={120} height={13} radius={6} style={{ marginTop: 10 }} />
      <Skeleton width={90} height={11} radius={5} style={{ marginTop: 7 }} />
    </View>
  );
}

/** En ort i rutnätet: namnet, hur många platser och hur långt bort, och prickar för vad som finns där */
function TownTile({ town, onPress }: { town: TownCard; onPress: () => void }) {
  const { colors } = useTheme();
  const detail = `${placesText(town.count)}${town.km != null ? `  ·  ${distanceLabel(town.km)}` : ""}`;
  return (
    <TouchableOpacity style={[s.townTile, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.75} onPress={onPress}>
      <Text style={[s.townName, { color: colors.text }]} numberOfLines={1}>{town.name}</Text>
      <Text style={[s.townDetail, { color: colors.muted }]} numberOfLines={1}>{detail}</Text>
      <CategoryDots cats={town.cats.slice(0, 7)} />
    </TouchableOpacity>
  );
}

function TownTileSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[s.townTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Skeleton width="65%" height={14} radius={6} />
      <Skeleton width="50%" height={11} radius={5} />
      <Skeleton width="40%" height={9} radius={4.5} />
    </View>
  );
}

// ── Söket ───────────────────────────────────────────────────────────────────

type Answer =
  | { kind: "place"; hit: PlaceHit }
  | { kind: "summary"; Icon: LucideIcon; tint: string; title: string; subtitle: string; chips: Chip[]; note: string | null }
  | null;

interface SearchResults {
  places: { hits: PlaceHit[]; relaxed: Intent[]; ignored: string[] };
  events: Event[];
  towns: Town[];
}

function Results({
  parsed, results, answer, limit, eventLimit, townCardByKey, isSaved,
  onShowAll, onPlace, onEvent, onTown, onMap, onToggleSave, onBurst,
}: {
  parsed: Parsed;
  results: SearchResults;
  answer: Answer;
  limit: number;
  eventLimit: number;
  townCardByKey: Map<string, TownCard>;
  isSaved: (id: number) => boolean;
  onShowAll: () => void;
  onPlace: (p: Place) => void;
  onEvent: (e: Event) => void;
  onTown: (name: string) => void;
  onMap: (p: Place) => void;
  onToggleSave: (id: number) => void;
  onBurst: Parameters<typeof PlaceAnswer>[0]["onBurst"];
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const hits = answer?.kind === "place" ? results.places.hits.filter((h) => h.place.id !== answer.hit.place.id) : results.places.hits;
  const shown = hits.slice(0, limit);
  const eventsFirst = parsed.intents.some((x) => x.kind === "events" || x.kind === "when") && parsed.text.length === 0;

  const placesSection = shown.length > 0 && (
    <View>
      <SectionHeader title={t("search.places")} count={hits.length} />
      {shown.map((h) => <PlaceResultRow key={h.place.id} hit={h} tokens={parsed.text} onPress={onPlace} />)}
      {limit === FIRST_PLACES && hits.length > FIRST_PLACES && (
        <TouchableOpacity style={[s.more, { borderColor: colors.border }]} activeOpacity={0.75} onPress={onShowAll}>
          <Text style={[s.moreText, { color: colors.text }]}>{t("search.showAllCount", { count: hits.length })}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
  const eventsSection = results.events.length > 0 && (
    <View>
      <SectionHeader title={t("search.events")} count={results.events.length} />
      {results.events.slice(0, eventLimit).map((e) => <EventResultRow key={e.id} event={e} tokens={parsed.text} onPress={onEvent} />)}
    </View>
  );

  return (
    <View style={{ paddingTop: 16 }}>
      {answer?.kind === "place" && (
        <PlaceAnswer
          hit={answer.hit}
          saved={isSaved(answer.hit.place.id)}
          onOpen={() => onPlace(answer.hit.place)}
          onMap={() => onMap(answer.hit.place)}
          onNavigate={() => openDirections(answer.hit.place.lat, answer.hit.place.lng)}
          onToggleSave={() => onToggleSave(answer.hit.place.id)}
          onBurst={onBurst}
        />
      )}
      {answer?.kind === "summary" && (
        <SummaryAnswer Icon={answer.Icon} tint={answer.tint} title={answer.title} subtitle={answer.subtitle} chips={answer.chips} note={answer.note} />
      )}

      {eventsFirst ? <>{eventsSection}{placesSection}</> : <>{placesSection}{eventsSection}</>}

      {results.towns.length > 0 && (
        <View>
          <SectionHeader title={t("search.towns")} />
          {results.towns.slice(0, 4).map((t) => {
            const card = townCardByKey.get(t.key);
            const detail = `${placesText(t.count)}${card?.open ? `  ·  ${openNowText(card.open)}` : ""}`;
            return <TownRow key={t.key} name={t.name} detail={detail} cats={card?.cats.slice(0, 7) ?? []} onPress={() => onTown(t.name)} />;
          })}
        </View>
      )}
    </View>
  );
}

/** "Menade du ”fika i Kivik”?" — det rättade ordet i guld */
function Corrected({ text, words }: { text: string; words: string[] }) {
  const { colors } = useTheme();
  const fixed = new Set(words);
  return (
    <>
      {text.split(/([\p{L}\p{N}]+)/u).map((part, i) => (
        fixed.has(part)
          ? <Text key={i} style={{ color: colors.goldText, fontFamily: "Inter_600SemiBold" }}>{part}</Text>
          : part
      ))}
    </>
  );
}

/**
 * Vad som visas överst. En tydlig träff på ett namn → platsen själv ("Bästa träff"). Annars, om
 * söket förstått något (kategori, egenskap, ort, tid) → en sammanfattning med det viktigaste.
 */
function buildAnswer(
  parsed: Parsed,
  placeResult: SearchResults["places"],
  events: Event[],
  index: IndexedPlace[],
  scheme: "dark" | "light",
  ask: (q: string) => void,
): Answer {
  const { hits, relaxed, ignored } = placeResult;
  const totalPlaces = index.length;
  const top = hits[0];
  const second = hits[1];
  if (parsed.text.length > 0 && top && top.score >= 85 && (!second || second.score <= top.score - 20)) {
    return { kind: "place", hit: top };
  }
  if (parsed.intents.length === 0 || totalPlaces === 0) return null;

  const cats = parsed.intents.flatMap((x) => (x.kind === "category" ? [x.value] : []));
  const practical = parsed.intents.flatMap((x) => (x.kind === "practical" ? [x.value] : []));
  const townList = parsed.intents.flatMap((x) => (x.kind === "town" ? [x.value] : []));
  const town = townList.length === 1 ? parsed.intents.find((x) => x.kind === "town") : undefined;
  const conj = i18n.t(parsed.conj === "or" ? "search.words.or" : "search.words.and");
  const townNames = townList.map((t) => t.name).join(` ${conj} `);
  const open = parsed.intents.some((x) => x.kind === "open");
  const late = parsed.intents.some((x) => x.kind === "late");
  const when = parsed.intents.find((x) => x.kind === "when");
  const at = parsed.intents.find((x) => x.kind === "at");
  const tastes = parsed.intents.flatMap((x) => (x.kind === "taste" ? [TASTES[x.value].label] : []));
  const eventsOnly = parsed.intents.every((x) => x.kind === "events" || x.kind === "when") && parsed.text.length === 0;

  // Det söket förstått, som chips (krysset tar bort den delen av frågan)
  const chips: Chip[] = parsed.intents.map((x) => {
    const remove = () => ask(withoutIntent(parsed, x));
    const key = `${x.kind}-${"value" in x ? (typeof x.value === "object" ? x.value.key : x.value) : ""}`;
    const color = intentTint(x, scheme);
    if (x.kind === "category") return { key, label: CATEGORIES.find((c) => c.id === x.value)?.label ?? x.value, Icon: catIcon(x.value), color, onRemove: remove };
    if (x.kind === "practical") return { key, label: practicalLabel(x.value), Icon: practicalIcon(x.value), color, onRemove: remove };
    if (x.kind === "open") return { key, label: i18n.t("search.answer.openNow"), Icon: Clock, color, onRemove: remove };
    if (x.kind === "at") return { key, label: atLabel(x), Icon: Clock, color, onRemove: remove };
    if (x.kind === "taste") return { key, label: TASTES[x.value].label, Icon: TASTES[x.value].category ? catIcon(TASTES[x.value].category!) : UtensilsCrossed, color, onRemove: remove };
    if (x.kind === "late") return { key, label: i18n.t("search.answer.openLate"), Icon: Moon, color, onRemove: remove };
    if (x.kind === "town") return { key, label: x.value.name, Icon: MapPin, color, onRemove: remove };
    if (x.kind === "when") return { key, label: cap(whenWord(x.value)), Icon: CalendarDays, color, onRemove: remove };
    return { key, label: i18n.t("search.answer.events"), Icon: CalendarDays, color, onRemove: remove };
  });
  // Ringens färg: det viktigaste söket förstått (kategorin först)
  const lead = parsed.intents.find((x) => x.kind === "category")
    ?? parsed.intents.find((x) => x.kind === "practical")
    ?? parsed.intents.find((x) => x.kind === "late" || x.kind === "open" || x.kind === "at")
    ?? parsed.intents[0];
  const tint = intentTint(lead, scheme);

  if (eventsOnly) {
    const n = events.length;
    return {
      kind: "summary",
      Icon: CalendarDays,
      tint: TINT.events[scheme],
      title: when?.kind === "when" ? i18n.t("search.answer.eventsWhen", { when: whenWord(when.value) }) : i18n.t("search.answer.events"),
      subtitle: n === 0 ? i18n.t("search.answer.noEvents") : i18n.t(when ? "search.answer.eventsCount" : "search.answer.upcomingCount", { count: n }),
      chips: chips.length > 1 ? chips : [],
      note: null,
    };
  }

  // Bara en ort: hur många platser, vad som har öppet, och vad som finns där (chips att trycka på)
  if (town?.kind === "town" && cats.length === 0 && practical.length === 0 && !open && !late && !at && parsed.text.length === 0) {
    const inTown = index.filter((p) => p.town === town.value.key);
    const openCount = inTown.filter((p) => openInfo(p.place)?.open).length;
    const perCat = new Map<CategoryId, number>();
    inTown.forEach((p) => {
      const c = findCategory(p.place.category)?.id;
      if (c) perCat.set(c, (perCat.get(c) ?? 0) + 1);
    });
    const catChips: Chip[] = [...perCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, n]) => ({
        key: id,
        label: `${CATEGORIES.find((c) => c.id === id)?.label ?? id}  ${n}`,
        Icon: catIcon(id),
        color: CATEGORY_DOT[scheme][id],
        onPress: () => ask(i18n.t("search.suggest.inTown", { what: catQuery(id), town: town.value.name })),
      }));
    return {
      kind: "summary",
      Icon: MapPin,
      tint: TINT.gold[scheme],
      title: town.value.name,
      subtitle: `${placesText(town.value.count)}${openCount ? `  ·  ${openNowText(openCount)}` : ""}`,
      chips: catChips,
      note: null,
    };
  }

  // Rubriken: vad man vill (Äta, Fika …), annars egenskapen eller tiden, och orten
  // (Tyska substantiv har stor bokstav, så bara svenska och engelska skriver resten med gemener)
  const lower = (s: string) => (i18n.language === "de" ? s : s.toLowerCase());
  let base = tastes.length > 0
    ? tastes.join(` ${conj} `)
    : cats.length > 0
    ? cats.map((c, i) => (i === 0 ? catTitle(c) : lower(catTitle(c)))).join(` ${conj} `)
    : practical.length > 0 ? practical.map((p) => practicalLabel(p)).join(" · ")
      : i18n.t(late ? "search.answer.openLate" : open ? "search.answer.openNow" : at ? "search.answer.open"
        : "search.answer.places");
  if (!(tastes.length > 0 || cats.length > 0 || practical.length > 0 || late || open || at) && townList.length > 0) base = townNames;
  if (townList.length > 0 && (cats.length > 0 || practical.length > 0 || open || late || at)) base = i18n.t("search.answer.inTown", { what: base, town: townNames });
  // Dagen och tiden: "Äta på måndag kl 19:00", "Öppet i kväll"
  if (at?.kind === "at") base += ` ${atPhrase(at)}`;

  const n = hits.length;
  const openNow = hits.filter((h) => h.open?.open).length;
  const nearest = hits.reduce<number | null>((min, h) => (h.km != null && (min == null || h.km < min) ? h.km : min), null);
  // Hur många av varje kategori ("2 aktiviteter · 3 boenden" — det är alla av båda, inte bara de
  // som är båda), annars hur många ställen
  const countOf = (c: CategoryId) => hits.filter((h) => placeCategories(h.place.category).has(c)).length;
  const parts = cats.length > 0
    ? cats.map((c) => { const k = countOf(c); return `${k} ${catNoun(c, k)}`; })
    : [i18n.t(n === 1 ? "search.count.spotOne" : "search.count.spotOther", { count: n })];
  if (!open && !at && openNow > 0 && openNow < n) parts.push(openNowText(openNow));
  if (nearest != null) parts.push(i18n.t("search.answer.nearest", { distance: distanceLabel(nearest) }));

  // Det som släpptes (uppgifter platserna inte fyllt i än) och ord som inget hade sägs rakt ut
  const notes: string[] = [];
  let note: string | null = null;
  const or = ` ${i18n.t("search.words.or")} `;
  const relaxedPractical = relaxed.flatMap((x) => (x.kind === "practical" ? [lower(practicalLabel(x.value))] : []));
  const relaxedTastes = relaxed.flatMap((x) => (x.kind === "taste" ? [lower(TASTES[x.value].label)] : []));
  if (relaxedTastes.length > 0) {
    const noun = cats.length > 0 ? catNoun(cats[0], 2) : i18n.t("search.spots");
    note = i18n.t("search.notes.tastes", { what: relaxedTastes.join(or), noun });
  } else if (relaxedPractical.length > 0) {
    const fits = hits.some((h) => h.mentions.length > 0);
    note = i18n.t(fits ? "search.notes.practicalFits" : "search.notes.practical", { what: relaxedPractical.join(or) });
  } else if (relaxed.some((x) => x.kind === "open")) {
    note = i18n.t("search.notes.open");
  } else if (at?.kind === "at" && relaxed.some((x) => x.kind === "at")) {
    note = cap(i18n.t("search.notes.at", { when: atPhrase(at) }));
  } else if (relaxed.some((x) => x.kind === "late")) {
    note = i18n.t("search.notes.late");
  }
  if (note) notes.push(note);
  if (ignored.length > 0) notes.push(i18n.t("search.notes.ignored", { words: ignored.map((w) => `”${w}”`).join(or) }));

  return {
    kind: "summary",
    Icon: cats.length > 0 ? catIcon(cats[0]) : practical.length > 0 ? practicalIcon(practical[0]) : late ? Moon : open || at ? Clock : MapPin,
    tint,
    title: base,
    subtitle: n === 0 ? i18n.t("search.answer.noPlaces") : parts.join("  ·  "),
    chips,
    note: notes.length > 0 ? notes.join(" ") : null,
  };
}

/** Senaste sökningarna — eller, första gången, förslag på vad man kan skriva */
function HistoryList({
  entries, placeById, eventById, suggestions, onPlace, onEvent, onTown, onTerm, onRemove, onClear,
}: {
  entries: HistoryEntry[];
  placeById: Map<number, Place>;
  eventById: Map<number, Event>;
  suggestions: string[];
  onPlace: (p: Place) => void;
  onEvent: (e: Event) => void;
  onTown: (name: string) => void;
  onTerm: (text: string) => void;
  onRemove: (e: HistoryEntry) => void;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const rows = entries.flatMap((e) => {
    if (e.kind === "place") {
      const p = placeById.get(e.id);
      if (!p) return [];
      const cat = findCategory(p.category)?.label ?? t("categories.place");
      return [<HistoryRow key={`p${e.id}`} kind="place" title={p.name} detail={[cat, p.nearest_town].filter(Boolean).join("  ·  ")} image={firstImageUrl(p.image_url)} onPress={() => onPlace(p)} onRemove={() => onRemove(e)} />];
    }
    if (e.kind === "event") {
      const ev = eventById.get(e.id);
      if (!ev) return [];
      return [<HistoryRow key={`e${e.id}`} kind="event" title={ev.title ?? ""} detail={`${t("search.history.event")}  ·  ${eventWhen(ev)}`} image={ev.image_url} event={ev} onPress={() => onEvent(ev)} onRemove={() => onRemove(e)} />];
    }
    if (e.kind === "town") {
      return [<HistoryRow key={`t${e.name}`} kind="town" title={e.name} detail={t("search.history.town")} onPress={() => onTown(e.name)} onRemove={() => onRemove(e)} />];
    }
    return [<HistoryRow key={`s${e.text}`} kind="term" title={e.text} detail={t("search.history.term")} onPress={() => onTerm(e.text)} onRemove={() => onRemove(e)} />];
  });

  if (rows.length === 0) {
    return (
      <Reanimated.View entering={FadeIn.duration(200)}>
        <SectionHeader title={t("search.tryTitle")} />
        <Text style={[s.tryText, { color: colors.muted }]}>{t("search.tryText")}</Text>
        <View style={s.tryRow}>
          {suggestions.map((t) => <ChipView key={t} chip={{ key: t, label: t, Icon: Search, onPress: () => onTerm(t) }} />)}
        </View>
      </Reanimated.View>
    );
  }
  return (
    <Reanimated.View entering={FadeIn.duration(200)}>
      <SectionHeader title={t("search.recent")} action={t("search.clear")} onAction={onClear} />
      {rows}
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  titleRow: { height: 44, flexDirection: "row", alignItems: "center", marginBottom: 6 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: 2, textTransform: "uppercase" },

  fieldRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  field: {
    flex: 1, height: 48, borderRadius: 14, borderWidth: 1, paddingLeft: 14, paddingRight: 12,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  input: { flex: 1, height: 48, fontFamily: "Inter_400Regular", fontSize: 15.5 },
  clear: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  cancel: { fontFamily: "Inter_600SemiBold", fontSize: 15 },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  tile: {
    width: "48.4%", flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tileBody: { flex: 1, gap: 4 },
  tileLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14.5 },
  tileSub: { fontFamily: "Inter_400Regular", fontSize: 12 },

  bleed: { marginHorizontal: -16 },
  nearRow: { paddingHorizontal: 16, gap: 12, paddingTop: 6 },
  near: { width: 156, gap: 5 },
  nearImage: { width: 156, height: 112, borderRadius: 14, overflow: "hidden", marginBottom: 5 },
  nearName: { fontFamily: "Montserrat_700Bold", fontSize: 14.5, letterSpacing: -0.2 },
  nearOpen: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  townGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  townTile: { width: "48.4%", gap: 6, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  townName: { fontFamily: "Montserrat_700Bold", fontSize: 14.5, letterSpacing: -0.2 },
  townDetail: { fontFamily: "Inter_400Regular", fontSize: 12.5 },

  more: { height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 10 },
  moreText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  empty: { paddingTop: 40, alignItems: "center", gap: 8 },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14.5, textAlign: "center" },
  tryText: { fontFamily: "Inter_400Regular", fontSize: 13.5, marginBottom: 12 },
  tryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
