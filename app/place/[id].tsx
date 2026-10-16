/**
 * Platssidan — allt om en plats på ett ställe.
 *
 * Öppnas direkt: platserna finns redan i telefonen (Karta och Sök hämtar dem), så namn, bilder,
 * öppettider och länkar syns från första bildrutan; hela raden hämtas om i bakgrunden.
 *
 * Uppifrån: bilderna (svep, tryck = helskärm med zoom), loggan, namnet och läget just nu
 * ("Öppet · stänger 17"), knapparna (Ring, Hemsida, Karta …), "Jag är här!" när man står på
 * platsen, Om platsen, Österlenpasset-biljetterna (rivs som på Förmåner), vänner som varit här,
 * Praktiskt, Öppettider, Evenemang här, Hitta hit (karta, hållplats och en skatt i närheten),
 * Kontakt, I närheten och "Stämmer något inte?". Längst ner, alltid synlig: hjärtat och
 * huvudknappen — Boka om platsen tar bokningar, annars Hitta hit.
 *
 * Det som ligger långt ner (kartan, listorna) byggs först när sidan glidit fram, så inget hackar
 * medan den öppnas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Extrapolation, FadeInDown, interpolate, runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle,
  useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { useImage } from "@shopify/react-native-skia";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft, Bookmark, Bus, CalendarCheck, Check, Globe, Mail, Map as MapIcon, MapPin, Navigation, PenLine, Phone,
  type LucideIcon,
} from "lucide-react-native";
import { FacebookIcon, InstagramIcon } from "@/components/BrandIcons";
import { supabase } from "@/integrations/supabase/client";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useEvents, type Event } from "@/hooks/useEvents";
import { useCollected, useCollectibles } from "@/hooks/useCollectibles";
import { useFriendsAtPlace } from "@/hooks/useFriendsAtPlace";
import { savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { useKnownLocation } from "@/hooks/useUserLocation";
import { CATEGORIES, findCategory, type CategoryId } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import { distanceMeters } from "@/lib/checkin";
import { dayKey, lastDay } from "@/lib/events";
import { openEvent } from "@/lib/eventSheet";
import { distanceLabel, parseAmenities, PRACTICAL } from "@/lib/mapFilters";
import { offerEligibility, type Offer } from "@/lib/offers";
import { hoursStatus, weekRows } from "@/lib/openingHours";
import { openInfo, placeCategories } from "@/lib/search";
import { pushOnce } from "@/lib/navigateOnce";
import {
  callPhone, copyText, instagramHandle, openDirections, openExternal, openWebsite, prettyUrl, sendEmail, withProtocol,
} from "@/lib/placeLinks";
import { ShareIcon } from "@/components/ShareIcon";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { HeartButton, LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import { CATEGORY_DOT } from "@/components/search/SearchParts";
import { OfferDrawer, type OriginRect, type TearEdge } from "@/components/offers/OfferDrawer";
import { OfferTicket, TICKET_H } from "@/components/offers/OfferTicket";
import { CheckInSection } from "@/components/checkin/CheckInSection";
import { SaveToListSheet } from "@/components/lists/SaveToListSheet";
import { PlaceHero } from "@/components/place/PlaceHero";
import { PhotoViewer } from "@/components/place/PhotoViewer";
import { PlaceHours, useHoursColors } from "@/components/place/PlaceHours";
import { PlaceMiniMap } from "@/components/place/PlaceMiniMap";
import { EventsHere, NearbyRail, type NearbyItem } from "@/components/place/PlaceNearby";
import {
  AboutText, ActionRow, Amenities, ContactList, GUTTER, Section, type ContactRow, type PlaceAction,
} from "@/components/place/PlaceSections";
import { FriendsHere, FriendsSheet, TreasureHint } from "@/components/place/PlaceSocial";
import { ReportSheet } from "@/components/place/ReportSheet";

const NO_PLACES: Place[] = [];
const NO_EVENTS: Event[] = [];
const NO_OFFERS: Offer[] = [];
const TOP_BAR_H = 56;
const LOGO = 76;
/** Så nära en skatt får ligga för att visas på platssidan */
const TREASURE_NEAR_M = 1500;
const NEARBY_COUNT = 8;
const EVENTS_SHOWN = 3;

/** Bilderna ur image_url (flera adresser skilda med komma — Wix-adresser har komman i sig) */
const imagesOf = (place: Place | undefined) =>
  (place?.image_url ?? "").split(/,(?=\s*https?:\/\/)/).map((u) => u.trim()).filter(Boolean);

/** Hela raden (även det listan inte hämtar), om i bakgrunden */
function usePlaceDetail(id: number) {
  return useQuery({
    queryKey: ["place", id],
    enabled: Number.isFinite(id),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("places").select("*").eq("id", id).single();
      if (error) throw error;
      return { ...data, category: data.categories } as Place;
    },
  });
}

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = Number(id);
  const { data: places = NO_PLACES } = usePlaces();
  const listed = useMemo(() => places.find((p) => p.id === placeId), [places, placeId]);
  const { data: detail, isError } = usePlaceDetail(placeId);
  const place = detail ?? listed;

  if (!place) return isError ? <NotFound /> : <PlaceSkeleton />;
  return <PlacePage place={place} places={places} />;
}

function PlacePage({ place, places }: { place: Place; places: Place[] }) {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width, height: winH } = useWindowDimensions();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const hoursTint = useHoursColors();
  const heroH = Math.round(Math.min(width * 0.95, 420));

  // ── Data ──
  const { data: offers = NO_OFFERS } = useOffers(place.id);
  const { data: redemptions = [] } = useOfferRedemptions();
  const { data: events = NO_EVENTS } = useEvents();
  const { data: collectibles = [] } = useCollectibles();
  const { data: collected } = useCollected();
  const { data: friends = [] } = useFriendsAtPlace(place.id);
  const me = useKnownLocation();

  // Det som ligger långt ner byggs när sidan glidit fram (eller efter en stund)
  const [later, setLater] = useState(false);
  useEffect(() => {
    const unsub = navigation.addListener("transitionEnd" as never, (e: { data?: { closing?: boolean } }) => {
      if (!e?.data?.closing) setLater(true);
    });
    const t = setTimeout(() => setLater(true), 700);
    return () => { unsub(); clearTimeout(t); };
  }, [navigation]);

  // ── Hjärtat: visas direkt, sparas på servern, och resten av appen uppdateras när man lämnar sidan ──
  const { data: favorites = [] } = useFavorites();
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const saved = savedOverride ?? favorites.some((f) => f.place_id === place.id);
  const favDirty = useRef(false);
  const toggleSave = useCallback(() => {
    const next = !saved;
    favDirty.current = true;
    setSavedOverride(next);
    savePlaceFavorite(place.id, next).catch(() => setSavedOverride(!next));
  }, [saved, place.id]);
  useFocusEffect(useCallback(() => () => {
    if (!favDirty.current) return;
    favDirty.current = false;
    queryClient.invalidateQueries({ queryKey: ["favorites"] }).then(() => setSavedOverride(null));
  }, [queryClient]));
  const { burst, show: showBurst } = useLikeBurst();

  // ── Scroll: bildens djup, toppraden som tonar in, kartan som byggs när man närmar sig ──
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({ onScroll: (e) => { scrollY.value = e.contentOffset.y; } });
  const collapseAt = heroH - insets.top - TOP_BAR_H;
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [collapseAt - 60, collapseAt - 10], [0, 1], Extrapolation.CLAMP),
  }));
  const [barSolid, setBarSolid] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > collapseAt - 30,
    (solid, prev) => { if (solid !== prev) runOnJS(setBarSolid)(solid); },
  );
  const mapY = useSharedValue(Number.MAX_SAFE_INTEGER);
  const [mapNear, setMapNear] = useState(false);
  useAnimatedReaction(
    () => scrollY.value + winH * 1.6 > mapY.value,
    (near, prev) => { if (near && !prev) runOnJS(setMapNear)(true); },
  );

  // ── Bilderna ──
  const images = useMemo(() => imagesOf(place), [place]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);

  // ── Paneler ──
  const [saveOpen, setSaveOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [eventsAll, setEventsAll] = useState(false);

  // ── Erbjudandena: biljetterna rivs som på Förmåner ──
  const edgeAmt = useSharedValue(0);
  const edgeProg = useSharedValue(0);
  const edge: TearEdge = useMemo(() => ({ amt: edgeAmt, prog: edgeProg }), [edgeAmt, edgeProg]);
  const [armedImage, setArmedImage] = useState<string | null>(null);
  const scrapImage = useImage(armedImage);
  const [openOffer, setOpenOffer] = useState<{ offer: Offer; origin: OriginRect | null } | null>(null);
  const ticketList = useMemo(() => offers
    .map((offer) => ({ offer, used: !offerEligibility(offer, redemptions).canUse }))
    .sort((a, b) => Number(a.used) - Number(b.used)), [offers, redemptions]);

  // ── Kopiera (långt tryck) ──
  const toast = useToast();
  const copy = useCallback(async (text: string) => {
    const ok = await copyText(text);
    if (ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.show(ok ? "Kopierat" : "Det gick inte att kopiera");
  }, [toast]);

  // ── Platsen ──
  const hasCoords = place.lat != null && place.lng != null;
  const catIds = useMemo(() => [...placeCategories(place.category)], [place.category]);
  const mainCat = findCategory(place.category);
  const isHotel = catIds.length > 0 && catIds.every((c) => c === "hotell-bb");
  const hours = place.opening_hours as Record<string, string> | null;
  const status = isHotel ? null : hoursStatus(hours);
  const hasHours = weekRows(hours).length > 0;
  const myKm = me && hasCoords ? distanceMeters(me.lat, me.lng, place.lat!, place.lng!) / 1000 : null;
  const transit = (place as Place & { transit_stop_name?: string | null }).transit_stop_name;
  const bookUrl = place.book_url;
  const website = place.website_url;
  const amenities = useMemo(() => {
    const a = parseAmenities((place as Place & { amenities?: unknown }).amenities);
    return PRACTICAL.filter((p) => p.id !== "openNow" && a[p.id] === true);
  }, [place]);

  const showOnMap = useCallback(() => {
    router.dismissTo({ pathname: "/(tabs)/map", params: { place: String(place.id) } } as never);
  }, [router, place.id]);

  const upcoming = useMemo(() => {
    const today = dayKey(new Date());
    return events
      .filter((e) => (e.place_id === place.id || e.place?.id === place.id) && (lastDay(e) ?? "") >= today)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }, [events, place.id]);

  const nearby = useMemo((): NearbyItem[] => {
    if (!hasCoords) return [];
    const now = new Date();
    return places
      .filter((p) => p.id !== place.id && p.lat != null && p.lng != null)
      .map((p) => ({ place: p, km: distanceMeters(place.lat!, place.lng!, p.lat!, p.lng!) / 1000, open: openInfo(p, now) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, NEARBY_COUNT);
  }, [places, place, hasCoords]);

  // Skatten som hör till platsen, annars den närmaste inom 1,5 km
  const treasure = useMemo(() => {
    if (!hasCoords) return null;
    const own = collectibles.find((c) => c.placeId === place.id);
    const candidates = (own ? [own] : collectibles)
      .map((c) => ({ c, m: distanceMeters(place.lat!, place.lng!, c.lat, c.lng) }))
      .filter((x) => own || x.m <= TREASURE_NEAR_M)
      .sort((a, b) => a.m - b.m);
    return candidates[0] ?? null;
  }, [collectibles, place, hasCoords]);

  // ── Knapparna ──
  const actions = useMemo((): PlaceAction[] => {
    const out: PlaceAction[] = [];
    if (place.phone) out.push({ key: "call", label: "Ring", Icon: Phone, onPress: () => callPhone(place.phone!) });
    if (website) out.push({ key: "web", label: "Hemsida", Icon: Globe, onPress: () => openWebsite(website) });
    if (hasCoords) out.push({ key: "map", label: "Karta", Icon: MapIcon, onPress: showOnMap });
    if (place.instagram_url) out.push({ key: "ig", label: "Instagram", Icon: InstagramIcon, onPress: () => openExternal(place.instagram_url!) });
    if (place.facebook_url) out.push({ key: "fb", label: "Facebook", Icon: FacebookIcon, onPress: () => openExternal(place.facebook_url!) });
    if (place.email) out.push({ key: "mail", label: "E-post", Icon: Mail, onPress: () => sendEmail(place.email!) });
    return out;
  }, [place, website, hasCoords, showOnMap]);

  const contact = useMemo((): ContactRow[] => {
    const out: ContactRow[] = [];
    if (place.phone) out.push({ key: "phone", Icon: Phone, label: "Telefon", value: place.phone, onPress: () => callPhone(place.phone!), onLongPress: () => copy(place.phone!) });
    if (website) out.push({ key: "web", Icon: Globe, label: "Hemsida", value: prettyUrl(website), onPress: () => openWebsite(website), onLongPress: () => copy(withProtocol(website)) });
    if (bookUrl) out.push({ key: "book", Icon: CalendarCheck, label: "Bokning", value: prettyUrl(bookUrl), onPress: () => openWebsite(bookUrl), onLongPress: () => copy(withProtocol(bookUrl)) });
    if (place.email) out.push({ key: "mail", Icon: Mail, label: "E-post", value: place.email, onPress: () => sendEmail(place.email!), onLongPress: () => copy(place.email!) });
    if (place.instagram_url) out.push({ key: "ig", Icon: InstagramIcon, label: "Instagram", value: instagramHandle(place.instagram_url) ?? "Instagram", onPress: () => openExternal(place.instagram_url!) });
    if (place.facebook_url) out.push({ key: "fb", Icon: FacebookIcon, label: "Facebook", value: prettyUrl(place.facebook_url).replace(/^(m\.)?facebook\.com\//i, "") || "Facebook", onPress: () => openExternal(place.facebook_url!) });
    return out;
  }, [place, website, bookUrl, copy]);

  // Huvudknappen: Boka om platsen tar bokningar, annars Hitta hit
  const primary: { label: string; Icon: LucideIcon; onPress: () => void } | null = bookUrl
    ? {
      label: mainCat?.id === "mat-dryck" ? "Boka bord" : mainCat?.id === "hotell-bb" ? "Boka rum" : "Boka",
      Icon: CalendarCheck,
      onPress: () => openWebsite(bookUrl),
    }
    : hasCoords ? { label: "Hitta hit", Icon: Navigation, onPress: () => openDirections(place.lat!, place.lng!) } : null;

  const share = () => {
    const town = place.nearest_town ? `, ${place.nearest_town}` : "";
    const link = website ? `\n${withProtocol(website)}` : "";
    Share.share({ message: `${place.name}${town}${link}` }).catch(() => {});
  };

  const onOpenFriend = (userId: string) => {
    setFriendsOpen(false);
    router.push({ pathname: "/friend/[id]", params: { id: userId } });
  };

  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      {/* Ljus statusrad över bilden och i helskärm; temats när toppraden tagit över */}
      <StatusBar style={viewer != null || dark || (!barSolid && images.length > 0) ? "light" : "dark"} />
      <Reanimated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
      >
        <PlaceHero
          images={images}
          height={heroH}
          scrollY={scrollY}
          index={heroIndex}
          onIndexChange={setHeroIndex}
          onOpen={setViewer}
          Icon={mainCat?.icon ?? MapPin}
          topInset={insets.top}
        />

        {/* Allt under bilden har hel bakgrund och ligger ovanpå den (bilden glider in under) */}
        <View style={{ backgroundColor: colors.bg }}>
          <Rise index={0}>
            <View style={s.identity}>
              <Logo place={place} catId={mainCat?.id} />
              <Text style={[s.name, { color: colors.text }]}>{place.name}</Text>
              <View style={s.meta}>
                {catIds.map((c) => (
                  <View key={c} style={s.metaItem}>
                    <View style={[s.dot, { backgroundColor: CATEGORY_DOT[scheme][c] }]} />
                    <Text style={[s.metaText, { color: colors.muted }]}>{CATEGORIES.find((d) => d.id === c)?.label}</Text>
                  </View>
                ))}
                {[place.nearest_town, myKm != null ? distanceLabel(myKm) : null, place.price_level ? "$".repeat(place.price_level) : null]
                  .filter(Boolean)
                  .map((t, i) => (
                    <Text key={i} style={[s.metaText, { color: colors.muted }]}>
                      {(i > 0 || catIds.length > 0) && <Text style={{ color: colors.faint }}>·  </Text>}
                      {t}
                    </Text>
                  ))}
              </View>
              {status && (
                <View style={s.status}>
                  <View style={[s.statusDot, { backgroundColor: hoursTint[status.state] }]} />
                  <Text style={[s.statusText, { color: hoursTint[status.state] }]}>{status.label}</Text>
                </View>
              )}
            </View>
          </Rise>

          <Rise index={1}>
            <ActionRow actions={actions} />
          </Rise>

          <CheckInSection place={place} />

          {(place.short_description || place.description) && (
            <Rise index={2}>
              <Section title="Om platsen">
                <AboutText
                  lead={place.description && place.short_description !== place.description ? place.short_description : null}
                  body={place.description ?? place.short_description}
                />
              </Section>
            </Rise>
          )}

          {ticketList.length > 0 && (
            <Section title="Österlenpasset">
              <View style={{ gap: 14 }}>
                {ticketList.map(({ offer, used }, i) => (later ? (
                  <Reanimated.View key={offer.id} entering={RISE_IN(i)}>
                    <OfferTicket
                      offer={offer}
                      used={used}
                      stubHidden={openOffer?.origin != null && openOffer.offer.id === offer.id}
                      edge={edge}
                      linkPlace={false}
                      onArm={setArmedImage}
                      onOpen={(o, origin) => setOpenOffer({ offer: o, origin })}
                    />
                  </Reanimated.View>
                ) : <Skeleton key={offer.id} height={TICKET_H} radius={18} />))}
              </View>
            </Section>
          )}

          {friends.length > 0 && (
            <Section title="Vänner">
              <Reanimated.View entering={RISE_IN(0)}>
                <FriendsHere friends={friends} onPress={() => setFriendsOpen(true)} />
              </Reanimated.View>
            </Section>
          )}

          {amenities.length > 0 && (
            <Section title="Praktiskt">
              <Amenities items={amenities} />
            </Section>
          )}

          {hasHours && (
            <Section title="Öppettider">
              <PlaceHours hours={hours} showStatus={!isHotel} />
            </Section>
          )}

          {later && upcoming.length > 0 && (
            <Section
              title="Evenemang här"
              action={upcoming.length > EVENTS_SHOWN ? (eventsAll ? "Visa färre" : `Visa alla ${upcoming.length}`) : undefined}
              onAction={() => setEventsAll((v) => !v)}
            >
              <EventsHere
                events={eventsAll ? upcoming : upcoming.slice(0, EVENTS_SHOWN)}
                onOpen={(e) => openEvent(e.id, { event: e })}
              />
            </Section>
          )}

          {hasCoords && (
            <View onLayout={(e) => { mapY.value = heroH + e.nativeEvent.layout.y; }}>
              <Section title="Hitta hit">
                <PlaceMiniMap lat={place.lat!} lng={place.lng!} mount={later && mapNear} onPress={showOnMap} />
                <View style={s.where}>
                  <View style={s.whereRow}>
                    <MapPin size={16} color={colors.muted} strokeWidth={2} />
                    <Text style={[s.whereText, { color: colors.text }]} numberOfLines={1}>
                      {place.nearest_town ?? "Österlen"}
                      {myKm != null && <Text style={{ color: colors.muted }}>{`  ·  ${distanceLabel(myKm)} från dig`}</Text>}
                    </Text>
                  </View>
                  {!!transit && (
                    <View style={s.whereRow}>
                      <Bus size={16} color={colors.muted} strokeWidth={2} />
                      <Text style={[s.whereText, { color: colors.text }]} numberOfLines={1}>
                        <Text style={{ color: colors.muted }}>Hållplats  </Text>{transit}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={s.whereButtons}>
                  <QuietAction Icon={MapIcon} label="Visa på kartan" onPress={showOnMap} />
                  <QuietAction Icon={Navigation} label="Vägbeskrivning" onPress={() => openDirections(place.lat!, place.lng!)} />
                </View>
                {treasure && (
                  <View style={{ marginTop: 12 }}>
                    <TreasureHint
                      meters={treasure.m}
                      found={collected?.has(treasure.c.id) ?? false}
                      name={treasure.c.name}
                      onPress={() => router.dismissTo({ pathname: "/(tabs)/map", params: { sticker: treasure.c.id } } as never)}
                    />
                  </View>
                )}
              </Section>
            </View>
          )}

          {contact.length > 0 && (
            <Section title="Kontakt">
              <ContactList rows={contact} />
              <Text style={[s.hint, { color: colors.faint }]}>Håll inne för att kopiera</Text>
            </Section>
          )}

          {later && nearby.length > 0 && (
            <Section title="I närheten">
              <NearbyRail items={nearby} onPress={(p) => pushOnce(router, `/place/${p.id}`)} />
            </Section>
          )}

          <TouchableOpacity style={[s.report, { borderColor: colors.border }]} activeOpacity={0.7} onPress={() => setReportOpen(true)}>
            <PenLine size={16} color={colors.muted} strokeWidth={2} />
            <Text style={[s.reportText, { color: colors.muted }]}>
              Stämmer något inte? <Text style={{ color: colors.goldText }}>Tipsa oss</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </Reanimated.ScrollView>

      {/* ── Toppraden: knapparna ligger kvar, bakgrunden och namnet tonar in när bilden scrollats bort ── */}
      <View style={[s.topBar, { paddingTop: insets.top, height: insets.top + TOP_BAR_H }]} pointerEvents="box-none">
        <Reanimated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, borderBottomColor: colors.border }, s.topBarBg, barStyle]}
          pointerEvents="none"
        />
        <RoundButton label="Tillbaka" onPress={() => router.back()}>
          <ArrowLeft size={21} color={colors.text} strokeWidth={2.2} />
        </RoundButton>
        <Reanimated.Text style={[s.barTitle, { top: insets.top, color: colors.text }, barStyle]} numberOfLines={1} pointerEvents="none">
          {place.name.toUpperCase()}
        </Reanimated.Text>
        <View style={s.topRight}>
          <RoundButton label="Dela" onPress={share}>
            <ShareIcon size={19} color={colors.text} strokeWidth={2.2} />
          </RoundButton>
          <RoundButton label="Spara i lista" onPress={() => setSaveOpen(true)}>
            <Bookmark size={19} color={colors.text} strokeWidth={2.2} />
          </RoundButton>
        </View>
      </View>

      {/* ── Längst ner: hjärtat och huvudknappen ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 10, backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <View style={[s.heartBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <HeartButton isFav={saved} onToggle={toggleSave} onBurst={showBurst} size={24} outline={colors.text} />
        </View>
        {primary ? (
          <TouchableOpacity style={[s.primary, { backgroundColor: colors.gold }]} activeOpacity={0.85} onPress={primary.onPress}>
            <primary.Icon size={19} color={colors.onGold} strokeWidth={2.3} />
            <Text style={[s.primaryText, { color: colors.onGold }]}>{primary.label}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.primary, { backgroundColor: colors.gold }]} activeOpacity={0.85} onPress={share}>
            <ShareIcon size={19} color={colors.onGold} strokeWidth={2.3} />
            <Text style={[s.primaryText, { color: colors.onGold }]}>Dela platsen</Text>
          </TouchableOpacity>
        )}
      </View>

      <Reanimated.View style={[s.toast, { bottom: insets.bottom + 86 }, toast.style]} pointerEvents="none">
        <Check size={15} color="#FFFFFF" strokeWidth={2.6} />
        <Text style={s.toastText}>{toast.text}</Text>
      </Reanimated.View>

      <PhotoViewer
        images={images}
        start={viewer ?? 0}
        visible={viewer != null}
        onClose={(i) => { setHeroIndex(i); setViewer(null); }}
      />
      <SaveToListSheet visible={saveOpen} onClose={() => setSaveOpen(false)} placeId={place.id} />
      <FriendsSheet visible={friendsOpen} friends={friends} onClose={() => setFriendsOpen(false)} onOpenFriend={onOpenFriend} />
      <ReportSheet visible={reportOpen} placeId={place.id} onClose={() => setReportOpen(false)} />
      <OfferDrawer
        visible={openOffer != null}
        placeId={place.id}
        focusOffer={openOffer?.offer}
        origin={openOffer?.origin}
        edge={edge}
        scrapImage={scrapImage}
        onClose={() => setOpenOffer(null)}
      />
      <LikeBurst burst={burst} />
    </View>
  );
}

/** Det som dyker upp när datan kommit: samma lugna inglidning som Rise, utan väntan */
const RISE_IN = (i: number) =>
  FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] }).duration(380).delay(i * 60);

// ── Småbitar ─────────────────────────────────────────────────────────────────

/** Platsens logga i en vit cirkel som sticker upp över bildens nederkant (kategorins ikon om loggan saknas) */
function Logo({ place, catId }: { place: Place; catId: CategoryId | undefined }) {
  const { colors, scheme } = useTheme();
  const Icon = CATEGORIES.find((c) => c.id === catId)?.icon ?? MapPin;
  return (
    <View style={[s.logoRing, { backgroundColor: colors.bg }]}>
      <View style={[s.logo, { backgroundColor: place.logo_url ? "#FFFFFF" : colors.card, borderColor: colors.border }]}>
        {place.logo_url ? (
          <ExpoImage source={{ uri: place.logo_url }} style={s.logoImage} contentFit="contain" cachePolicy="memory-disk" transition={120} />
        ) : (
          <Icon size={30} color={catId ? CATEGORY_DOT[scheme][catId] : colors.muted} strokeWidth={1.8} />
        )}
      </View>
    </View>
  );
}

/** Rund, hel knapp i toppraden — syns både mot bilden och mot toppradens bakgrund */
function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[s.round, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.8}
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
    >
      {children}
    </TouchableOpacity>
  );
}

function QuietAction({ Icon, label, onPress }: { Icon: LucideIcon; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[s.quiet, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.75} onPress={onPress}>
      <Icon size={16} color={colors.text} strokeWidth={2.2} />
      <Text style={[s.quietText, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Ett kort besked nere vid knapparna ("Kopierat") som tonar bort av sig själv */
function useToast() {
  const [text, setText] = useState("");
  const v = useSharedValue(0);
  const show = useCallback((t: string) => {
    setText(t);
    v.value = withSequence(withTiming(1, { duration: 160 }), withDelay(1300, withTiming(0, { duration: 240 })));
  }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 8 }] }));
  return useMemo(() => ({ text, show, style }), [text, show, style]);
}

/** Platsen finns inte i telefonen än (öppnad från en länk direkt efter start): sidans form i grått */
function PlaceSkeleton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const heroH = Math.round(Math.min(width * 0.95, 420));
  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <Skeleton height={heroH} radius={0} />
      <View style={{ paddingHorizontal: GUTTER, paddingTop: 54, gap: 10 }}>
        <Skeleton width="72%" height={26} radius={8} />
        <Skeleton width="48%" height={14} radius={6} />
        <Skeleton width="36%" height={14} radius={6} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={68} radius={16} style={{ flex: 1 }} />)}
        </View>
      </View>
      <View style={[s.topBar, { paddingTop: insets.top, height: insets.top + TOP_BAR_H }]}>
        <RoundButton label="Tillbaka" onPress={() => router.back()}>
          <ArrowLeft size={21} color={colors.text} strokeWidth={2.2} />
        </RoundButton>
      </View>
    </View>
  );
}

function NotFound() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={[s.screen, s.notFound, { backgroundColor: colors.bg }]}>
      <MapPin size={34} color={colors.faint} strokeWidth={1.6} />
      <Text style={[s.notFoundTitle, { color: colors.text }]}>Vi hittar inte den här platsen</Text>
      <Text style={[s.notFoundText, { color: colors.muted }]}>Den kan ha tagits bort, eller så är du utan nät just nu.</Text>
      <TouchableOpacity style={[s.quiet, { backgroundColor: colors.card, borderColor: colors.border, flex: 0, paddingHorizontal: 22 }]} onPress={() => router.back()}>
        <Text style={[s.quietText, { color: colors.text }]}>Tillbaka</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },

  identity: { paddingHorizontal: GUTTER, paddingTop: LOGO / 2 + 14 },
  logoRing: {
    position: "absolute", left: GUTTER - 4, top: -LOGO / 2 - 4,
    width: LOGO + 8, height: LOGO + 8, borderRadius: (LOGO + 8) / 2, alignItems: "center", justifyContent: "center",
  },
  logo: {
    width: LOGO, height: LOGO, borderRadius: LOGO / 2, overflow: "hidden", alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  logoImage: { width: LOGO * 0.82, height: LOGO * 0.82 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 27, lineHeight: 33, letterSpacing: -0.6 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, marginTop: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  status: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: "Inter_700Bold", fontSize: 14 },

  where: { gap: 9, marginTop: 14 },
  whereRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  whereText: { flexShrink: 1, fontFamily: "Inter_500Medium", fontSize: 14.5 },
  whereButtons: { flexDirection: "row", gap: 8, marginTop: 14 },
  quiet: {
    flex: 1, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
  },
  quietText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 8, textAlign: "center" },

  report: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: GUTTER, marginTop: 40, paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reportText: { fontFamily: "Inter_500Medium", fontSize: 14 },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12,
  },
  topBarBg: { borderBottomWidth: StyleSheet.hairlineWidth },
  barTitle: {
    position: "absolute", left: 112, right: 112, height: TOP_BAR_H, lineHeight: TOP_BAR_H, textAlign: "center",
    fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5,
  },
  topRight: { flexDirection: "row", gap: 8 },
  round: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3,
  },

  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 10, paddingHorizontal: GUTTER, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heartBox: {
    width: 54, height: 54, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center", justifyContent: "center",
  },
  primary: { flex: 1, height: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  primaryText: { fontFamily: "Inter_700Bold", fontSize: 16 },

  toast: {
    position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "#1C1C1E",
  },
  toastText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: "#FFFFFF" },

  notFound: { alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  notFoundTitle: { fontFamily: "Montserrat_700Bold", fontSize: 19, textAlign: "center" },
  notFoundText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 8 },
});
