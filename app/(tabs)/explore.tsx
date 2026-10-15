/**
 * Sök.
 *
 * Innan man skriver: "Vad vill du göra?" (Äta nu, Fika, Sova i natt …, med hur många som finns
 * just nu), det som har öppet nära mig, och orterna. Trycker man i sökfältet: senaste sökningarna
 * (det man öppnat via söket och det man sökt på, som i Spotify).
 *
 * När man skriver söks allt i telefonen (lib/search), så svaret kommer på första bokstaven. Överst
 * ett svarskort med det viktigaste direkt: "Bästa träff" (platsen själv: öppet, avstånd, karta,
 * vägbeskrivning), eller en sammanfattning av vad söket förstått ("Fika i Kivik — 6 ställen,
 * 3 öppna nu, närmast 1,2 km") med chips som tar bort en del av frågan. Sen platser, evenemang
 * och orter, med det man sökt på markerat. Inga träffar: "Menade du …?".
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler, Keyboard, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import Reanimated, {
  Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import {
  Baby, BedDouble, CalendarDays, Clock, Coffee, Dog, MapPin, Moon, Search, Sparkles, Trees, UtensilsCrossed, X,
  type LucideIcon,
} from "lucide-react-native";
import { firstImageUrl, usePlaces, type Place } from "@/hooks/usePlaces";
import { useEvents, type Event } from "@/hooks/useEvents";
import { savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { useKnownLocation } from "@/hooks/useUserLocation";
import { useTheme } from "@/theme/ThemeProvider";
import { CATEGORIES, findCategory, type CategoryId } from "@/theme/categories";
import { PRACTICAL, distanceLabel } from "@/lib/mapFilters";
import {
  PRACTICAL_LABELS, buildIndex, buildTowns, didYouMean, norm, openInfo, parseQuery, searchEvents, searchPlaces,
  searchTowns, withoutIntent, type Intent, type Parsed, type PlaceHit, type Town,
} from "@/lib/search";
import { useSearchHistory, type HistoryEntry } from "@/lib/searchHistory";
import { eventWhen } from "@/lib/events";
import { openEvent } from "@/lib/eventSheet";
import { pushOnce } from "@/lib/navigateOnce";
import { registerScrollCallback } from "@/lib/scrollRefs";
import { FLOATING_NAV_HEIGHT } from "@/components/navigation/FloatingNav";
import { Skeleton } from "@/components/Skeleton";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import {
  CategoryLine, ChipView, EventResultRow, HistoryRow, PlaceAnswer, PlaceResultRow, SectionHeader, SummaryAnswer,
  TownRow, useOpenColors, type Chip,
} from "@/components/search/SearchParts";

/** Tomt medan något laddas: alltid samma tomma lista (en ny vid varje uppritning räknar om allt) */
const NONE: never[] = [];

/** Snabb inglidning för de första delarna, kort efter varandra (som Kalender) */
const enterAt = (index: number) => (index < 8 ? FadeInDown.delay(index * 45).duration(300) : undefined);

/** Platser som visas innan "Visa alla" */
const FIRST_PLACES = 20;

/** "Vad vill du göra?" — varje ruta är en färdig fråga till söket */
const TILES: { key: string; label: string; query: string; Icon: LucideIcon }[] = [
  { key: "eat", label: "Äta nu", query: "äta nu", Icon: UtensilsCrossed },
  { key: "fika", label: "Fika", query: "fika", Icon: Coffee },
  { key: "sleep", label: "Sova i natt", query: "sova", Icon: BedDouble },
  { key: "late", label: "Öppet sent", query: "öppet sent", Icon: Moon },
  { key: "kids", label: "Med barn", query: "med barn", Icon: Baby },
  { key: "dog", label: "Med hund", query: "med hund", Icon: Dog },
  { key: "nature", label: "Ut i naturen", query: "natur", Icon: Trees },
  { key: "events", label: "Händer snart", query: "evenemang", Icon: CalendarDays },
];

/** Förslag när historiken är tom — visar vad söket förstår */
const TRY = ["fika i Kivik", "äta nu", "loppis", "med barn", "konst", "i helgen"];

/** Rubriken i sammanfattningen per kategori, och ordet en ort-chip söker med */
const CAT_TITLE: Record<CategoryId, string> = {
  "mat-dryck": "Äta", "cafe-bageri": "Fika", "hotell-bb": "Sova", "natur-upplevelser": "Natur",
  "aktiviteter": "Aktiviteter", "sevardheter": "Sevärdheter", "butiker": "Handla", "hantverk-service": "Design & hantverk",
};
const CAT_QUERY: Record<CategoryId, string> = {
  "mat-dryck": "äta", "cafe-bageri": "fika", "hotell-bb": "sova", "natur-upplevelser": "natur",
  "aktiviteter": "aktiviteter", "sevardheter": "sevärdheter", "butiker": "handla", "hantverk-service": "design",
};
const WHEN_LABEL = { today: "i dag", tomorrow: "i morgon", weekend: "i helgen" } as const;

const catIcon = (id: CategoryId): LucideIcon => CATEGORIES.find((c) => c.id === id)?.icon ?? MapPin;
const practicalIcon = (id: string): LucideIcon => PRACTICAL.find((p) => p.id === id)?.Icon ?? Sparkles;

function openDirections(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return;
  const url = Platform.OS === "ios" ? `maps://?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {}));
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const { data: places = NONE as Place[], isFetched: placesFetched } = usePlaces();
  const { data: events = NONE as Event[] } = useEvents();
  const { data: favorites = NONE as NonNullable<ReturnType<typeof useFavorites>["data"]> } = useFavorites();
  const loc = useKnownLocation();
  const history = useSearchHistory();

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Söket räknas om när telefonen hinner — att skriva är alltid lika snabbt
  const deferred = useDeferredValue(query);
  const searching = focused || query.length > 0;
  useEffect(() => { setShowAll(false); }, [deferred]);

  // Öppet nu räknas om varje gång man kommer tillbaka till sidan
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, []));

  const index = useMemo(() => buildIndex(places), [places]);
  const towns = useMemo(() => buildTowns(places), [places]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

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
    setQuery("");
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);
  const ask = useCallback((text: string) => {
    Haptics.selectionAsync().catch(() => {});
    setQuery(text);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!searching) return false;
      cancel();
      return true;
    });
    return () => sub.remove();
  }, [searching, cancel]);

  // Bläddrandet och söket ligger båda kvar; att byta tonar bara över
  const mode = useSharedValue(0);
  useEffect(() => {
    mode.value = withTiming(searching ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [searching, mode]);
  const browseStyle = useAnimatedStyle(() => ({ opacity: 1 - mode.value, transform: [{ translateY: mode.value * 10 }] }));
  const searchStyle = useAnimatedStyle(() => ({ opacity: mode.value, transform: [{ translateY: (1 - mode.value) * 10 }] }));

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
    if (fromSearch) history.add({ kind: "place", id: place.id });
    pushOnce(router, `/place/${place.id}`);
  }, [history, router]);
  const openEventItem = useCallback((event: Event, fromSearch: boolean) => {
    Keyboard.dismiss();
    if (fromSearch) history.add({ kind: "event", id: event.id });
    openEvent(event.id, { event });
  }, [history]);
  const chooseTown = useCallback((name: string) => {
    history.add({ kind: "town", name });
    ask(name);
  }, [history, ask]);
  const onResultPlace = useCallback((p: Place) => openPlace(p, true), [openPlace]);
  const onResultEvent = useCallback((e: Event) => openEventItem(e, true), [openEventItem]);

  // ── Bläddra: rutornas siffror och det som har öppet nära mig ─────────────
  const tiles = useMemo(() => {
    if (!placesFetched) return null;
    const now = new Date();
    const count = (q: string) => {
      const parsed = parseQuery(q, towns);
      const r = searchPlaces(index, parsed, loc, now);
      return r.relaxed.length > 0 ? 0 : r.hits.length;
    };
    const upcoming = searchEvents(events, parseQuery("evenemang", towns), now).length;
    const n = {
      eat: count("äta nu"), fika: count("fika"), sleep: count("sova"), late: count("öppet sent"),
      kids: count("med barn"), dog: count("med hund"), nature: count("natur"),
    };
    const subs: Record<string, string> = {
      eat: n.eat ? `${n.eat} öppna nu` : "Inget öppet just nu",
      fika: `${n.fika} ställen`,
      sleep: `${n.sleep} ${n.sleep === 1 ? "boende" : "boenden"}`,
      late: n.late ? `${n.late} öppna efter 21` : "Inget i kväll",
      kids: n.kids ? `${n.kids} barnvänliga` : "Tips på ställen",
      dog: n.dog ? `${n.dog} hundvänliga` : "Tips på ställen",
      nature: `${n.nature} platser`,
      events: upcoming ? `${upcoming} kommande` : "Inga just nu",
    };
    return subs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesFetched, index, towns, events, loc, tick]);

  const openNearby = useMemo(() => {
    if (!placesFetched) return null;
    return searchPlaces(index, parseQuery("öppet", towns), loc).hits.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesFetched, index, towns, loc, tick]);

  // ── Söket ─────────────────────────────────────────────────────────────────
  const parsed = useMemo(() => parseQuery(deferred, towns), [deferred, towns]);
  const results = useMemo(() => {
    if (!deferred.trim()) return null;
    const now = new Date();
    const placeIntents = parsed.intents.some((x) => x.kind !== "events" && x.kind !== "when");
    const showPlaces = parsed.text.length > 0 || placeIntents;
    const placeResult = showPlaces ? searchPlaces(index, parsed, loc, now) : { hits: [] as PlaceHit[], relaxed: [] as Intent[] };
    const eventHits = searchEvents(events, parsed, now);
    const townHits = searchTowns(towns, parsed);
    const empty = placeResult.hits.length === 0 && eventHits.length === 0 && townHits.length === 0
      && !parsed.intents.some((x) => x.kind === "town");
    return {
      places: placeResult,
      events: eventHits,
      towns: townHits,
      suggestion: empty ? didYouMean(index, towns, parsed) : null,
      empty,
    };
  }, [deferred, parsed, index, towns, events, loc]);

  const answer = useMemo(
    () => (results ? buildAnswer(parsed, results.places.hits, results.places.relaxed, results.events, index.length, places, ask) : null),
    [results, parsed, index.length, places, ask],
  );
  const listPlaces = useMemo(() => {
    if (!results) return [];
    const hits = answer?.kind === "place" ? results.places.hits.filter((h) => h.place.id !== answer.hit.place.id) : results.places.hits;
    return showAll ? hits : hits.slice(0, FIRST_PLACES);
  }, [results, answer, showAll]);
  const placesTotal = (results?.places.hits.length ?? 0) - (answer?.kind === "place" ? 1 : 0);
  const eventsFirst = parsed.intents.some((x) => x.kind === "events" || x.kind === "when") && parsed.text.length === 0;

  const bottomPad = FLOATING_NAV_HEIGHT + insets.bottom + 110;
  const townDetail = (t: Town) => {
    const open = index.filter((p) => p.town === t.key && openInfo(p.place)?.open).length;
    return `${t.count} ${t.count === 1 ? "plats" : "platser"}${open ? `  ·  ${open} öppna nu` : ""}`;
  };

  const placesSection = results && listPlaces.length > 0 && (
    <View>
      <SectionHeader title="Platser" count={placesTotal} />
      {listPlaces.map((h) => <PlaceResultRow key={h.place.id} hit={h} tokens={parsed.text} onPress={onResultPlace} />)}
      {!showAll && placesTotal > FIRST_PLACES && (
        <TouchableOpacity style={[s.more, { borderColor: colors.border }]} activeOpacity={0.75} onPress={() => setShowAll(true)}>
          <Text style={[s.moreText, { color: colors.text }]}>Visa alla {placesTotal}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
  const eventsSection = results && results.events.length > 0 && (
    <View>
      <SectionHeader title="Evenemang" count={results.events.length} />
      {results.events.slice(0, 12).map((e) => <EventResultRow key={e.id} event={e} tokens={parsed.text} onPress={onResultEvent} />)}
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      {/* ── Rubriken och sökfältet ── */}
      <View style={{ paddingTop: Math.max(insets.top, 44), paddingHorizontal: 16 }}>
        <PageTitle />
        <View style={s.fieldRow}>
          <Reanimated.View layout={LinearTransition.duration(200)} style={[s.field, { backgroundColor: colors.card, borderColor: focused ? colors.goldBorder : colors.border }]}>
            <Search size={18} color={colors.muted} strokeWidth={2.2} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={() => history.add({ kind: "term", text: query.trim() })}
              placeholder="Sök platser, evenemang, orter"
              placeholderTextColor={colors.faint}
              selectionColor={colors.gold}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              style={[s.input, { color: colors.text }]}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(""); inputRef.current?.focus(); }} hitSlop={12} accessibilityLabel="Rensa">
                <View style={[s.clear, { backgroundColor: colors.fill }]}>
                  <X size={12} color={colors.muted} strokeWidth={2.6} />
                </View>
              </TouchableOpacity>
            )}
          </Reanimated.View>
          {searching && (
            <Reanimated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <TouchableOpacity onPress={cancel} hitSlop={10}>
                <Text style={[s.cancel, { color: colors.goldText }]}>Avbryt</Text>
              </TouchableOpacity>
            </Reanimated.View>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {/* ── Bläddra ── */}
        <Reanimated.View style={[StyleSheet.absoluteFill, browseStyle]} pointerEvents={searching ? "none" : "auto"}>
          <ScrollView
            ref={browseRef}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Reanimated.View entering={enterAt(0)}>
              <SectionHeader title="Vad vill du göra?" />
              <View style={s.tiles}>
                {TILES.map((t) => (
                  <IntentTile key={t.key} label={t.label} Icon={t.Icon} sub={tiles?.[t.key] ?? null} onPress={() => ask(t.query)} />
                ))}
              </View>
            </Reanimated.View>

            {(openNearby === null || openNearby.length > 0) && (
              <Reanimated.View entering={enterAt(1)}>
                <SectionHeader title={loc ? "Öppet nu nära dig" : "Öppet nu"} action="Visa alla" onAction={() => ask("öppet nu")} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.nearRow}>
                  {openNearby === null
                    ? [0, 1, 2].map((i) => <NearCardSkeleton key={i} />)
                    : openNearby.map((h) => <NearCard key={h.place.id} hit={h} onPress={() => openPlace(h.place, false)} />)}
                </ScrollView>
              </Reanimated.View>
            )}

            <Reanimated.View entering={enterAt(2)}>
              <SectionHeader title="Orter" />
              <View style={s.towns}>
                {placesFetched
                  ? towns.slice(0, 14).map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      style={[s.town, { backgroundColor: colors.card, borderColor: colors.border }]}
                      activeOpacity={0.75}
                      onPress={() => ask(t.name)}
                    >
                      <Text style={[s.townName, { color: colors.text }]}>{t.name}</Text>
                      <Text style={[s.townCount, { color: colors.faint }]}>{t.count}</Text>
                    </TouchableOpacity>
                  ))
                  : [90, 70, 110, 80, 95, 60].map((w, i) => <Skeleton key={i} width={w} height={36} radius={18} />)}
              </View>
            </Reanimated.View>
          </ScrollView>
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
                entries={history.entries}
                placeById={placeById}
                eventById={eventById}
                onPlace={(p) => openPlace(p, true)}
                onEvent={(e) => openEventItem(e, true)}
                onTown={chooseTown}
                onTerm={ask}
                onRemove={history.remove}
                onClear={history.clear}
                onTry={ask}
              />
            ) : results.empty ? (
              <View style={s.empty}>
                <Text style={[s.emptyTitle, { color: colors.text }]}>Inga träffar för ”{deferred.trim()}”</Text>
                {results.suggestion ? (
                  <TouchableOpacity onPress={() => ask(results.suggestion!)} activeOpacity={0.75}>
                    <Text style={[s.emptyText, { color: colors.muted }]}>
                      Menade du <Text style={{ color: colors.goldText, fontFamily: "Inter_600SemiBold" }}>{results.suggestion}</Text>?
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[s.emptyText, { color: colors.muted }]}>Prova ett annat ord, eller något av de här:</Text>
                )}
                <View style={[s.tryRow, { marginTop: 16 }]}>
                  {TRY.map((t) => <ChipView key={t} chip={{ key: t, label: t, Icon: Search, onPress: () => ask(t) }} />)}
                </View>
              </View>
            ) : (
              <View style={{ paddingTop: 16 }}>
                {answer?.kind === "place" && (
                  <PlaceAnswer
                    hit={answer.hit}
                    saved={isSaved(answer.hit.place.id)}
                    onOpen={() => openPlace(answer.hit.place, true)}
                    onMap={() => {
                      history.add({ kind: "place", id: answer.hit.place.id });
                      router.navigate({ pathname: "/(tabs)/map", params: { place: String(answer.hit.place.id) } } as never);
                    }}
                    onNavigate={() => openDirections(answer.hit.place.lat, answer.hit.place.lng)}
                    onToggleSave={() => toggleSave(answer.hit.place.id)}
                    onBurst={showBurst}
                  />
                )}
                {answer?.kind === "summary" && (
                  <SummaryAnswer Icon={answer.Icon} title={answer.title} subtitle={answer.subtitle} chips={answer.chips} note={answer.note} />
                )}

                {eventsFirst ? <>{eventsSection}{placesSection}</> : <>{placesSection}{eventsSection}</>}

                {results.towns.length > 0 && (
                  <View>
                    <SectionHeader title="Orter" />
                    {results.towns.slice(0, 4).map((t) => (
                      <TownRow key={t.key} name={t.name} detail={townDetail(t)} onPress={() => chooseTown(t.name)} />
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </Reanimated.View>
      </View>

      <LikeBurst burst={burst} />
    </View>
  );
}

// ── Svarskortet ─────────────────────────────────────────────────────────────

type Answer =
  | { kind: "place"; hit: PlaceHit }
  | { kind: "summary"; Icon: LucideIcon; title: string; subtitle: string; chips: Chip[]; note: string | null }
  | null;

/**
 * Vad som visas överst. En tydlig träff på ett namn → platsen själv ("Bästa träff"). Annars, om
 * söket förstått något (kategori, egenskap, ort, tid) → en sammanfattning med det viktigaste.
 */
function buildAnswer(
  parsed: Parsed,
  hits: PlaceHit[],
  relaxed: Intent[],
  events: Event[],
  totalPlaces: number,
  places: Place[],
  ask: (q: string) => void,
): Answer {
  const top = hits[0];
  const second = hits[1];
  if (parsed.text.length > 0 && top && top.score >= 85 && (!second || second.score <= top.score - 20)) {
    return { kind: "place", hit: top };
  }
  if (parsed.intents.length === 0 || totalPlaces === 0) return null;

  const cats = parsed.intents.flatMap((x) => (x.kind === "category" ? [x.value] : []));
  const practical = parsed.intents.flatMap((x) => (x.kind === "practical" ? [x.value] : []));
  const town = parsed.intents.find((x) => x.kind === "town");
  const open = parsed.intents.some((x) => x.kind === "open");
  const late = parsed.intents.some((x) => x.kind === "late");
  const when = parsed.intents.find((x) => x.kind === "when");
  const eventsOnly = parsed.intents.every((x) => x.kind === "events" || x.kind === "when") && parsed.text.length === 0;

  // Det söket förstått, som chips (krysset tar bort den delen av frågan)
  const chips: Chip[] = parsed.intents.map((x) => {
    const remove = () => ask(withoutIntent(parsed, x));
    const key = `${x.kind}-${"value" in x ? (typeof x.value === "object" ? x.value.key : x.value) : ""}`;
    if (x.kind === "category") return { key, label: CATEGORIES.find((c) => c.id === x.value)?.label ?? x.value, Icon: catIcon(x.value), onRemove: remove };
    if (x.kind === "practical") return { key, label: PRACTICAL_LABELS[x.value], Icon: practicalIcon(x.value), onRemove: remove };
    if (x.kind === "open") return { key, label: "Öppet nu", Icon: Clock, onRemove: remove };
    if (x.kind === "late") return { key, label: "Öppet sent", Icon: Moon, onRemove: remove };
    if (x.kind === "town") return { key, label: x.value.name, Icon: MapPin, onRemove: remove };
    if (x.kind === "when") return { key, label: WHEN_LABEL[x.value].replace(/^./, (c) => c.toUpperCase()), Icon: CalendarDays, onRemove: remove };
    return { key, label: "Evenemang", Icon: CalendarDays, onRemove: remove };
  });

  if (eventsOnly) {
    const title = `Evenemang${when?.kind === "when" ? ` ${WHEN_LABEL[when.value]}` : ""}`;
    const n = events.length;
    return {
      kind: "summary", Icon: CalendarDays, title,
      subtitle: n === 0 ? "Inga inlagda än" : `${n} ${when ? "evenemang" : "kommande"}`,
      chips: chips.length > 1 ? chips : [], note: null,
    };
  }

  // Bara en ort: hur många platser, vad som har öppet, och vad som finns där (chips att trycka på)
  if (town?.kind === "town" && cats.length === 0 && practical.length === 0 && !open && !late && parsed.text.length === 0) {
    const inTown = places.filter((p) => norm(p.nearest_town ?? "").trim() === town.value.key);
    const openCount = inTown.filter((p) => openInfo(p)?.open).length;
    const perCat = new Map<CategoryId, number>();
    inTown.forEach((p) => {
      const c = findCategory(p.category)?.id;
      if (c) perCat.set(c, (perCat.get(c) ?? 0) + 1);
    });
    const catChips: Chip[] = [...perCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, n]) => ({
        key: id,
        label: `${CATEGORIES.find((c) => c.id === id)?.label ?? id}  ${n}`,
        Icon: catIcon(id),
        onPress: () => ask(`${CAT_QUERY[id]} i ${town.value.name}`),
      }));
    return {
      kind: "summary", Icon: MapPin, title: town.value.name,
      subtitle: `${town.value.count} ${town.value.count === 1 ? "plats" : "platser"}${openCount ? `  ·  ${openCount} öppna nu` : ""}`,
      chips: catChips, note: null,
    };
  }

  // Rubriken: vad man vill (Äta, Fika …), annars egenskapen eller tiden, och orten
  let base = cats.length > 0
    ? cats.map((c, i) => (i === 0 ? CAT_TITLE[c] : CAT_TITLE[c].toLowerCase())).join(" & ")
    : practical.length > 0 ? practical.map((p) => PRACTICAL_LABELS[p]).join(" · ")
      : late ? "Öppet sent" : open ? "Öppet nu" : town?.kind === "town" ? town.value.name : "Platser";
  if (town?.kind === "town" && (cats.length > 0 || practical.length > 0 || open || late)) base += ` i ${town.value.name}`;

  const n = hits.length;
  const onlyHotels = cats.length === 1 && cats[0] === "hotell-bb";
  const noun = onlyHotels ? (n === 1 ? "boende" : "boenden") : n === 1 ? "ställe" : "ställen";
  const openNow = hits.filter((h) => h.open?.open).length;
  const nearest = hits.reduce<number | null>((min, h) => (h.km != null && (min == null || h.km < min) ? h.km : min), null);
  const parts = [`${n} ${noun}`];
  if (!open && openNow > 0 && openNow < n) parts.push(`${openNow} öppna nu`);
  if (nearest != null) parts.push(`närmast ${distanceLabel(nearest)}`);

  // Det som släpptes (uppgifter platserna inte angett än) sägs rakt ut
  let note: string | null = null;
  const relaxedPractical = relaxed.flatMap((x) => (x.kind === "practical" ? [PRACTICAL_LABELS[x.value].toLowerCase()] : []));
  if (relaxedPractical.length > 0) {
    const mentions = hits.some((h) => h.mentions.length > 0);
    note = `Inga ställen har angett ${relaxedPractical.join(" eller ")} än, så alla visas${mentions ? " — de som nämner det i sin beskrivning först" : ""}.`;
  } else if (relaxed.some((x) => x.kind === "open")) {
    note = "Inget har öppet just nu, så alla visas — närmast först.";
  } else if (relaxed.some((x) => x.kind === "late")) {
    note = "Inget har öppet efter 21 i dag, så alla visas.";
  }

  return {
    kind: "summary",
    Icon: cats.length > 0 ? catIcon(cats[0]) : practical.length > 0 ? practicalIcon(practical[0]) : late ? Moon : open ? Clock : MapPin,
    title: base,
    subtitle: n === 0 ? "Inga ställen än" : parts.join("  ·  "),
    chips,
    note,
  };
}

// ── Delarna ─────────────────────────────────────────────────────────────────

/** SÖK som sidans rubrik, med guldstrecket under (samma som Kalenders FÖR DIG · ALLA) */
function PageTitle() {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  return (
    <View style={s.titleRow}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Text style={[s.title, { color: colors.text }]}>Sök</Text>
        {w > 0 && <View style={[s.titleBar, { width: w * 0.5, left: w * 0.25, backgroundColor: colors.goldText }]} />}
      </View>
    </View>
  );
}

function IntentTile({ label, sub, Icon, onPress }: { label: string; sub: string | null; Icon: LucideIcon; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[s.tile, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.75} onPress={onPress}>
      <View style={[s.tileIcon, { backgroundColor: colors.goldSoft }]}>
        <Icon size={19} color={colors.gold} strokeWidth={2.1} />
      </View>
      <View style={s.tileBody}>
        <Text style={[s.tileLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={[s.tileSub, { color: colors.muted }]} numberOfLines={1}>{sub}</Text> : <Skeleton width={64} height={10} radius={5} />}
      </View>
    </TouchableOpacity>
  );
}

/** Ett ställe som har öppet nu: bilden, och all text under */
function NearCard({ hit, onPress }: { hit: PlaceHit; onPress: () => void }) {
  const { colors } = useTheme();
  const c = useOpenColors();
  const image = firstImageUrl(hit.place.image_url);
  return (
    <TouchableOpacity style={s.near} activeOpacity={0.85} onPress={onPress}>
      <View style={[s.nearImage, { backgroundColor: colors.fill }]}>
        {image && <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />}
      </View>
      <Text style={[s.nearName, { color: colors.text }]} numberOfLines={1}>{hit.place.name}</Text>
      <CategoryLine place={hit.place} />
      <Text style={[s.nearOpen, { color: c.open }]} numberOfLines={1}>
        {hit.open?.label ?? "Öppet"}{hit.km != null ? `  ·  ${distanceLabel(hit.km)}` : ""}
      </Text>
    </TouchableOpacity>
  );
}

function NearCardSkeleton() {
  return (
    <View style={s.near}>
      <Skeleton width={156} height={112} radius={14} />
      <Skeleton width={120} height={13} radius={6} style={{ marginTop: 10 }} />
      <Skeleton width={90} height={11} radius={5} style={{ marginTop: 7 }} />
    </View>
  );
}

/** Senaste sökningarna — eller, första gången, förslag på vad man kan skriva */
function HistoryList({
  entries, placeById, eventById, onPlace, onEvent, onTown, onTerm, onRemove, onClear, onTry,
}: {
  entries: HistoryEntry[];
  placeById: Map<number, Place>;
  eventById: Map<number, Event>;
  onPlace: (p: Place) => void;
  onEvent: (e: Event) => void;
  onTown: (name: string) => void;
  onTerm: (text: string) => void;
  onRemove: (e: HistoryEntry) => void;
  onClear: () => void;
  onTry: (q: string) => void;
}) {
  const { colors } = useTheme();
  const rows = entries.flatMap((e) => {
    if (e.kind === "place") {
      const p = placeById.get(e.id);
      if (!p) return [];
      const cat = findCategory(p.category)?.label ?? "Plats";
      return [<HistoryRow key={`p${e.id}`} kind="place" title={p.name} detail={[cat, p.nearest_town].filter(Boolean).join("  ·  ")} image={firstImageUrl(p.image_url)} onPress={() => onPlace(p)} onRemove={() => onRemove(e)} />];
    }
    if (e.kind === "event") {
      const ev = eventById.get(e.id);
      if (!ev) return [];
      return [<HistoryRow key={`e${e.id}`} kind="event" title={ev.title ?? ""} detail={`Evenemang  ·  ${eventWhen(ev)}`} image={ev.image_url} event={ev} onPress={() => onEvent(ev)} onRemove={() => onRemove(e)} />];
    }
    if (e.kind === "town") {
      return [<HistoryRow key={`t${e.name}`} kind="town" title={e.name} detail="Ort" onPress={() => onTown(e.name)} onRemove={() => onRemove(e)} />];
    }
    return [<HistoryRow key={`s${e.text}`} kind="term" title={e.text} detail="Sökning" onPress={() => onTerm(e.text)} onRemove={() => onRemove(e)} />];
  });

  if (rows.length === 0) {
    return (
      <Reanimated.View entering={FadeIn.duration(200)}>
        <SectionHeader title="Prova att söka" />
        <Text style={[s.tryText, { color: colors.muted }]}>Skriv som du pratar — söket förstår vad du menar.</Text>
        <View style={s.tryRow}>
          {TRY.map((t) => <ChipView key={t} chip={{ key: t, label: t, Icon: Search, onPress: () => onTry(t) }} />)}
        </View>
      </Reanimated.View>
    );
  }
  return (
    <Reanimated.View entering={FadeIn.duration(200)}>
      <SectionHeader title="Senaste" action="Rensa" onAction={onClear} />
      {rows}
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  titleRow: { height: 44, flexDirection: "row", alignItems: "center", marginBottom: 6 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: 2, textTransform: "uppercase" },
  titleBar: { position: "absolute", bottom: -6, height: 3, borderRadius: 1.5 },

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

  towns: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  town: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 38, borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
  },
  townName: { fontFamily: "Inter_500Medium", fontSize: 14 },
  townCount: { fontFamily: "Inter_500Medium", fontSize: 12.5, fontVariant: ["tabular-nums"] },

  more: { height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 10 },
  moreText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  empty: { paddingTop: 40, alignItems: "center", gap: 8 },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, textAlign: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14.5, textAlign: "center" },
  tryText: { fontFamily: "Inter_400Regular", fontSize: 13.5, marginBottom: 12 },
  tryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" },
});
