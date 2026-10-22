/**
 * Hem — appens första sida, som ett enda långt flöde.
 *
 * Överst, lugnt: dagens datum, hälsningen och profilbilden (med streaken), en rad med vädret,
 * "Du verkar vara vid …" / en skatt i närheten när det stämmer, och berättelserna. Inget mer — en
 * topp full av knappar och rader såg ut som en katalog.
 *
 * Sedan flödet "För dig" (lib/homeFeed): evenemang, nya erbjudanden (biljetterna rivs som på
 * Förmåner), platser att inspireras av, nyheter, vänners besök och en skatt — blandat efter fasta
 * regler. Verktygen ligger i flödet: Upptäck (svepet) och genvägarna in i Sök ("Öppet nu", "Äta nu" …).
 * Det byggs en gång när datan kommit och står still medan man tittar; dra ner för att uppdatera (då
 * blandas platserna om). "Visa mer" längst ner laddar in nästa del, tills man är ikapp. Byts språket
 * byggs det om. Går inget att hämta (inget nät) säger sidan det och låter en försöka igen.
 *
 * Laggfritt: flödet är en lista som bara ritar det som syns, korten ritas bara om när det egna kortet
 * ändras (ett hjärta), och toppen sköter sin egen data.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, RefreshControl, StyleSheet, Text, View, type FlatList } from "react-native";
import Reanimated, { FadeInDown, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { useEvents, type Event } from "@/hooks/useEvents";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useNews, type NewsItem } from "@/hooks/useNews";
import { useFriendVisits } from "@/hooks/useFriendVisits";
import { useCollected, useCollectibles, type Collectible } from "@/hooks/useCollectibles";
import { saveEventFavorite, savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { useVisits } from "@/hooks/useVisits";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/theme/ThemeProvider";
import { buildFeed, type FeedItem } from "@/lib/homeFeed";
import { openEvent } from "@/lib/eventSheet";
import { pushOnce } from "@/lib/navigateOnce";
import { setNavHidden } from "@/lib/navVisibility";
import { registerScrollCallback } from "@/lib/scrollRefs";
import { openSearch } from "@/lib/searchShortcuts";
import { useAppSettled } from "@/lib/appSettled";
import { locationAskDeferred } from "@/lib/onboarding";
import type { Offer } from "@/lib/offers";
import { FLOATING_NAV_HEIGHT } from "@/components/navigation/FloatingNav";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import { NearbyCheckInPrompt } from "@/components/checkin/NearbyCheckInPrompt";
import { NearbyStickerPrompt } from "@/components/stickers/NearbyStickerPrompt";
import { OfferDrawer, type OriginRect, type TearEdge } from "@/components/offers/OfferDrawer";
import { Rise } from "@/components/Rise";
import { HomeHeader } from "@/components/home/HomeHeader";
import { StoryRow } from "@/components/home/StoryRow";
import { StickyGreeting } from "@/components/home/StickyGreeting";
import { useMyPlaceIds } from "@/hooks/useBusiness";
import {
  FEED_GUTTER, FeedDiscover, FeedEventCard, FeedFooter, FeedFriendCard, FeedNewsCard, FeedOfferCard, FeedOffline, FeedPlaceCard,
  FeedShortcuts, FeedSkeleton, FeedTreasureCard, OpenNowRail, WeekendRail,
} from "@/components/home/FeedCards";

/** Så många kort syns först, och så många till för varje "Visa mer" */
const FIRST_PAGE = 12;
const MORE = 10;
/** Det som inte är nödvändigt för flödet (nyheter, vänner …) väntas in högst så här länge */
const OPTIONAL_WAIT_MS = 1500;
/** Har appen legat i bakgrunden så här länge byggs flödet om när man kommer tillbaka */
const STALE_MS = 30 * 60 * 1000;
/** En ny blandning av platserna */
const newSeed = () => Math.floor(Math.random() * 1_000_000_000);
const MIN_REFRESH_MS = 800;
const NO_PLACES: Place[] = [];
const NO_ITEMS: FeedItem[] = [];

type Loc = { lat: number; lng: number };

/**
 * Var man är. Frågar om platsbehörighet (Hem är första sidan, så det är här appen får den) — utom
 * när man svarat "Inte nu" i onboardingen; då frågar kartan när man öppnar den. Tar först
 * telefonens senast kända position (snabbt) och sedan en färsk. `settled` när det finns en
 * position — eller när det står klart att det inte blir någon.
 */
function useHomeLocation(): { location: Loc | null; settled: boolean } {
  const [location, setLocation] = useState<Loc | null>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => alive && setSettled(true), 2000);
    (async () => {
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted" && perm.canAskAgain && !(await locationAskDeferred())) {
          perm = await Location.requestForegroundPermissionsAsync();
        }
        if (perm.status !== "granted") return;
        const last = await Location.getLastKnownPositionAsync();
        if (alive && last) {
          setLocation({ lat: last.coords.latitude, lng: last.coords.longitude });
          setSettled(true);
        }
        const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (alive) setLocation({ lat: now.coords.latitude, lng: now.coords.longitude });
      } catch {
        // Ingen position — Hem klarar sig utan
      } finally {
        if (alive) setSettled(true);
      }
    })();
    return () => { alive = false; clearTimeout(t); };
  }, []);
  return { location, settled };
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const { location, settled } = useHomeLocation();
  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <HomeFeed location={location} locationSettled={settled} />
    </View>
  );
}

/** Allt ovanför flödet, med luft emellan. Varje del sköter sin egen data */
const HomeTop = memo(function HomeTop({ location }: { location: Loc | null }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data: places = NO_PLACES } = usePlaces();
  return (
    <View>
      <Rise index={0}>
        <HomeHeader location={location} />
      </Rise>
      <NearbyCheckInPrompt places={places} lat={location?.lat ?? null} lng={location?.lng ?? null} />
      <NearbyStickerPrompt lat={location?.lat ?? null} lng={location?.lng ?? null} />
      <Rise index={1}>
        <StoryRow />
      </Rise>
      <Rise index={2}>
        <Text style={[s.forYou, { color: colors.text }]}>{t("home.forYou")}</Text>
      </Rise>
    </View>
  );
});

/** De första korten glider in mjukt när flödet visas (bara då — inte när man scrollar tillbaka) */
const CARD_IN = (i: number) =>
  FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: 14 }] }).duration(420).delay(60 + i * 70);
const ANIMATED_CARDS = 3;
const REVEAL_MS = 1500;

function HomeFeed({ location, locationSettled }: { location: Loc | null; locationSettled: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const appSettled = useAppSettled();

  // ── Datan ──
  const places = usePlaces();
  const events = useEvents();
  const offers = useOffers();
  const redemptions = useOfferRedemptions();
  const news = useNews(10);
  const friendVisits = useFriendVisits(20);
  const collectibles = useCollectibles();
  const collected = useCollected();
  const favorites = useFavorites();
  const visits = useVisits();
  const profile = useProfile();

  // Det nödvändiga (platser, evenemang, ens favoriter, besök och intressen, var man är) måste ha
  // kommit; resten väntas in en kort stund
  const coreReady = places.isFetched && events.isFetched && favorites.isFetched && visits.isFetched
    && profile.isFetched && locationSettled;
  const optionalReady = offers.isFetched && redemptions.isFetched && news.isFetched && friendVisits.isFetched
    && collectibles.isFetched && collected.isFetched;
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!coreReady) return;
    const t = setTimeout(() => setWaited(true), OPTIONAL_WAIT_MS);
    return () => clearTimeout(t);
  }, [coreReady]);
  const ready = coreReady && (optionalReady || waited);

  // ── Flödet: byggs när appen öppnas, när man drar ner för att uppdatera och när man kommer tillbaka
  // efter en halvtimme — däremellan står det still medan man tittar. Platserna blandas nytt varje gång ──
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [version, setVersion] = useState(0);
  const ownPlaceIds = useMyPlaceIds();
  const [seed, setSeed] = useState(newSeed);
  const [shown, setShown] = useState(FIRST_PAGE);
  // Byts språket byggs flödet om, så korten säger sina skäl på det nya språket
  const { i18n } = useTranslation();
  const builtLanguage = useRef(i18n.language);
  useEffect(() => {
    if (builtLanguage.current === i18n.language) return;
    builtLanguage.current = i18n.language;
    setVersion((v) => v + 1);
  }, [i18n.language]);
  const built = useRef(-1);
  const builtAt = useRef(0);
  useEffect(() => {
    if (!ready || built.current === version) return;
    built.current = version;
    builtAt.current = Date.now();
    const favs = favorites.data ?? [];
    setFeed(buildFeed({
      places: places.data ?? [],
      events: events.data ?? [],
      offers: offers.data ?? [],
      redemptions: redemptions.data ?? [],
      news: news.data ?? [],
      friendVisits: friendVisits.data ?? [],
      collectibles: collectibles.data ?? [],
      collected: collected.data,
      favoritePlaceIds: new Set(favs.flatMap((f) => (f.place_id != null ? [f.place_id] : []))),
      savedEventIds: new Set(favs.flatMap((f) => (f.event_id != null ? [f.event_id] : []))),
      visitedPlaceIds: new Set((visits.data ?? []).map((v) => v.place_id)),
      interests: profile.data?.interests ?? [],
      ownPlaceIds,
      location,
      seed,
    }));
  }, [ready, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hämta allt på nytt och bygg om flödet med en ny blandning
  const queries = { places, events, offers, redemptions, news, friendVisits, collectibles, collected, favorites, visits, profile };
  const queriesRef = useRef(queries);
  queriesRef.current = queries;
  const rebuild = useCallback(async () => {
    await Promise.all([
      ...Object.values(queriesRef.current).map((q) => q.refetch()),
      queryClient.invalidateQueries({ queryKey: ["business-stories"] }),
    ].map((p) => p.catch(() => {})));
    setSeed(newSeed());
    setShown(FIRST_PAGE);
    setVersion((v) => v + 1);
  }, [queryClient]);
  // Snurran syns minst en kort stund, så man ser att det laddades om även när det går fort
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    await rebuild();
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_REFRESH_MS - (Date.now() - started))));
    setRefreshing(false);
  }, [rebuild]);
  // Tillbaka efter en halvtimme eller mer: ett nytt flöde, uppifrån
  useEffect(() => {
    let away = 0;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") away = Date.now();
      else if (state === "active" && away && Date.now() - away >= STALE_MS) {
        away = 0;
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        rebuild();
      }
    });
    return () => sub.remove();
  }, [rebuild]);

  // ── Hjärtan (platser och evenemang): visas direkt, resten av appen uppdateras när man lämnar Hem ──
  const favs = favorites.data;
  const serverPlaces = useMemo(() => new Set((favs ?? []).flatMap((f) => (f.place_id != null ? [f.place_id] : []))), [favs]);
  const serverEvents = useMemo(() => new Set((favs ?? []).flatMap((f) => (f.event_id != null ? [f.event_id] : []))), [favs]);
  const [placeSaved, setPlaceSaved] = useState<Map<number, boolean>>(() => new Map());
  const [eventSaved, setEventSaved] = useState<Map<number, boolean>>(() => new Map());
  const isPlaceSaved = (id: number) => placeSaved.get(id) ?? serverPlaces.has(id);
  const isEventSaved = (id: number) => eventSaved.get(id) ?? serverEvents.has(id);
  const savedRef = useRef({ isPlaceSaved, isEventSaved });
  savedRef.current = { isPlaceSaved, isEventSaved };
  const dirty = useRef(false);
  const togglePlace = useCallback((id: number) => {
    const save = !savedRef.current.isPlaceSaved(id);
    dirty.current = true;
    setPlaceSaved((m) => new Map(m).set(id, save));
    savePlaceFavorite(id, save).catch(() => setPlaceSaved((m) => new Map(m).set(id, !save)));
  }, []);
  const toggleEvent = useCallback((id: number) => {
    const save = !savedRef.current.isEventSaved(id);
    dirty.current = true;
    setEventSaved((m) => new Map(m).set(id, save));
    saveEventFavorite(id, save).catch(() => setEventSaved((m) => new Map(m).set(id, !save)));
  }, []);
  useFocusEffect(useCallback(() => () => {
    if (!dirty.current) return;
    dirty.current = false;
    queryClient.invalidateQueries({ queryKey: ["favorites"] }).then(() => {
      setPlaceSaved(new Map());
      setEventSaved(new Map());
    });
  }, [queryClient]));
  const { burst, show: showBurst } = useLikeBurst();

  // ── Erbjudandena: biljetterna rivs som på Förmåner (panelen byggs i förväg när appen lugnat ner sig) ──
  const scrollAt = useSharedValue(0);
  const edgeAmt = useSharedValue(0);
  const edgeProg = useSharedValue(0);
  const edgeActive = useSharedValue(0);
  const edge: TearEdge = useMemo(() => ({ amt: edgeAmt, prog: edgeProg, active: edgeActive }), [edgeAmt, edgeProg, edgeActive]);
  const [openOffer, setOpenOffer] = useState<{ offer: Offer; origin: OriginRect | null } | null>(null);
  const onOpenOffer = useCallback((offer: Offer, origin: OriginRect | null) => {
    // Navigeringen nere glider undan medan panelen är öppen
    setNavHidden(true);
    setOpenOffer({ offer, origin });
  }, []);
  const closeOffer = useCallback(() => {
    setOpenOffer(null);
    setNavHidden(false);
  }, []);
  useEffect(() => () => setNavHidden(false), []);
  // Platsens namn i panelen öppnar platssidan (samma funktion hela tiden, så panelen inte ritas om i onödan)
  const openOfferRef = useRef(openOffer);
  openOfferRef.current = openOffer;
  const openOfferPlace = useCallback(() => {
    const o = openOfferRef.current;
    if (o) pushOnce(router, `/place/${o.offer.place_id}?from=home`);
  }, [router]);
  const hasOffers = useMemo(() => (feed ?? NO_ITEMS).some((i) => i.kind === "offer"), [feed]);

  // ── Att öppna saker ──
  const openPlace = useCallback((p: Place) => pushOnce(router, `/place/${p.id}?from=home`), [router]);
  const openEventCard = useCallback((e: Event) => {
    openEvent(e.id, { event: e, saved: savedRef.current.isEventSaved(e.id), onToggleSave: toggleEvent });
  }, [toggleEvent]);
  const openNews = useCallback((n: NewsItem) => pushOnce(router, `/news/${n.id}`), [router]);
  const openFriend = useCallback((userId: string) => router.push({ pathname: "/friend/[id]", params: { id: userId } }), [router]);
  const openTreasure = useCallback((c: Collectible) => {
    router.navigate({ pathname: "/(tabs)/map", params: { sticker: c.id } });
  }, [router]);
  const showOpenNow = useCallback(() => openSearch(router, i18n.t("search.queries.open")), [router, i18n]);
  const showCalendar = useCallback(() => router.navigate("/(tabs)/calendar"), [router]);
  const openDiscover = useCallback(() => router.push("/discover"), [router]);

  // Fliktrycket i navigeringen scrollar upp till toppen
  const listRef = useRef<FlatList<FeedItem>>(null);
  useEffect(() => {
    registerScrollCallback("home", () => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
  }, []);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      scrollAt.value = Date.now();
    },
  });

  const openOfferId = openOffer?.origin ? openOffer.offer.id : null;
  const renderItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    const card = renderCard(item);
    // De första korten glider in när flödet just visats
    return index < ANIMATED_CARDS && Date.now() - builtAt.current < REVEAL_MS
      ? <Reanimated.View entering={CARD_IN(index)}>{card}</Reanimated.View>
      : card;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeSaved, eventSaved, serverPlaces, serverEvents, openOfferId, edge, scrollAt]);

  function renderCard(item: FeedItem) {
    switch (item.kind) {
      case "event":
        return (
          <FeedEventCard
            pick={item.pick}
            hero={item.hero}
            saved={isEventSaved(item.pick.event.id)}
            onOpen={openEventCard}
            onToggleSave={toggleEvent}
            onBurst={showBurst}
          />
        );
      case "place":
        return (
          <FeedPlaceCard
            place={item.place}
            reason={item.reason}
            km={item.km}
            saved={isPlaceSaved(item.place.id)}
            onOpen={openPlace}
            onToggleSave={togglePlace}
            onBurst={showBurst}
          />
        );
      case "offer":
        return (
          <FeedOfferCard
            offer={item.offer}
            isNew={item.isNew}
            torn={item.offer.id === openOfferId}
            edge={edge}
            scrollAt={scrollAt}
            onOpen={onOpenOffer}
          />
        );
      case "news":
        return <FeedNewsCard news={item.news} onOpen={openNews} />;
      case "friend":
        return <FeedFriendCard visit={item.visit} place={item.place} onOpenPlace={openPlace} onOpenFriend={openFriend} />;
      case "treasure":
        return <FeedTreasureCard collectible={item.collectible} meters={item.meters} onOpen={openTreasure} />;
      case "openNow":
        return <OpenNowRail items={item.items} onOpen={openPlace} onShowAll={showOpenNow} />;
      case "weekend":
        return <WeekendRail events={item.events} onOpen={openEventCard} onShowAll={showCalendar} />;
      case "discover":
        return <FeedDiscover />;
      case "shortcuts":
        return <FeedShortcuts />;
    }
  }

  const header = useMemo(() => <HomeTop location={location} />, [location]);
  // Platserna gick inte att hämta och inget finns sparat: inget nät (eller servern svarar inte)
  const offline = places.isError && !places.data?.length;
  const items = feed && !offline ? feed.slice(0, shown) : NO_ITEMS;
  const footer = offline
    ? <FeedOffline onRetry={onRefresh} />
    : feed
      ? <FeedFooter hasMore={shown < feed.length} onMore={() => setShown((n) => n + MORE)} onDiscover={openDiscover} />
      : <FeedSkeleton />;

  return (
    <>
      {/* Listan börjar under statusraden: där syns dra-ner-snurran (bakom klockan och kameran syntes den inte) */}
      <View style={{ flex: 1, paddingTop: insets.top }}>
      <Reanimated.FlatList
        ref={listRef as never}
        data={items}
        keyExtractor={(item: FeedItem) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        // Luft nog för att "Visa mer" hamnar ovanför navigeringens toning
        contentContainerStyle={{ paddingBottom: FLOATING_NAV_HEIGHT + insets.bottom + 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} colors={[colors.muted]} />}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={9}
      />
      </View>
      {/* Hälsningen och profilbilden följer med ner (gömmer sig medan man scrollar nedåt) */}
      <StickyGreeting scrollY={scrollY} showAfter={90} />
      {appSettled && hasOffers && (
        <OfferDrawer
          visible={openOffer != null}
          placeId={openOffer?.offer.place_id ?? 0}
          focusOffer={openOffer?.offer}
          origin={openOffer?.origin}
          edge={edge}
          onOpenPlace={openOfferPlace}
          onClose={closeOffer}
        />
      )}
      <LikeBurst burst={burst} />
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  forYou: {
    paddingHorizontal: FEED_GUTTER, marginTop: 40, marginBottom: 18,
    fontFamily: "Montserrat_700Bold", fontSize: 24, letterSpacing: -0.5,
  },
});
