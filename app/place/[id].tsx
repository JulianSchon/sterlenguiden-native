/**
 * Platssidan — allt om en plats på ett ställe.
 *
 * Öppnas direkt: platserna finns redan i telefonen (Karta och Sök hämtar dem), så namn, bilder,
 * öppettider och länkar syns från första bildrutan; hela raden hämtas om i bakgrunden.
 *
 * Uppifrån: bilderna (svep, tryck = helskärm med zoom), loggan, namnet och läget just nu
 * ("Öppet · stänger 17"), knapparna (Ring, Hemsida, Karta …), "Jag är här!" när man står på
 * platsen, Om platsen, Österlenpasset-biljetterna (rivs som på Förmåner), vänner som varit här,
 * Praktiskt, Öppettider, Evenemang här, Hitta hit, Skatt i närheten, Kontakt, I närheten och
 * "Stämmer något inte?". Allra längst ner, diskret, "Är det här ditt företag?" (eller, för den som
 * sköter platsen, vägen till Mitt företag). Längst ner, alltid synlig: hjärtat och huvudknappen —
 * Boka om platsen tar bokningar, annars Hitta hit.
 *
 * Företagets statistik räknas här: att sidan öppnades (och varifrån), klick på telefon, hemsida,
 * boka, Instagram, Facebook och e-post, och vägbeskrivningar (lib/placeTracking).
 *
 * Laggfritt: sidan själv ritas nästan aldrig om. Det som ändras ofta sköter sitt eget läge och ritar
 * bara om sig självt:
 * - toppraden och statusraden (när bilden scrollats bort) och hjärtat (PlaceChrome)
 * - bildspelet (vilken bild som visas)
 * - panelerna och helskärmen, som öppnas via ref (PlaceOverlays)
 * - den lilla kartan (byggs när man närmar sig den)
 * Innehållet (PlaceContent) ritas bara om när ny data kommer. När hela sidan ritades om varje gång
 * toppraden bytte läge hackade scrollen. Det som ligger långt ner byggs först när sidan glidit fram.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Reanimated, {
  FadeInDown, runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useSharedValue, type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/i18n/dates";
import * as Haptics from "expo-haptics";
import { ProblemScreen } from "@/components/ProblemScreen";
import { Bus, Globe, Mail, Map as MapIcon, MapPin, Navigation, PenLine, Phone } from "lucide-react-native";
import { FacebookIcon, InstagramIcon } from "@/components/BrandIcons";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlace, usePlaces, type Place } from "@/hooks/usePlaces";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useEvents, type Event } from "@/hooks/useEvents";
import { useCollected, useCollectibles, type Collectible } from "@/hooks/useCollectibles";
import { useFriendsAtPlace, type FriendAtPlace } from "@/hooks/useFriendsAtPlace";
import { useKnownLocation } from "@/hooks/useUserLocation";
import { CATEGORIES, findCategory, type CategoryId } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import { distanceMeters } from "@/lib/checkin";
import { dayKey, lastDay } from "@/lib/events";
import { openEvent } from "@/lib/eventSheet";
import { distanceLabel, parseAmenities, PRACTICAL } from "@/lib/mapFilters";
import { offerEligibility, type Offer, type RedemptionRow } from "@/lib/offers";
import { hoursStatus, weekRows } from "@/lib/openingHours";
import { openInfo, placeCategories } from "@/lib/search";
import { pushOnce } from "@/lib/navigateOnce";
import { placeSource, sourceFromParam, trackDirections, trackPlaceLink, trackPlaceView } from "@/lib/placeTracking";
import { useMyPlaceIds } from "@/hooks/useBusiness";
import {
  callPhone, copyText, openDirections, openExternal, openWebsite, sendEmail, siteName, withProtocol,
} from "@/lib/placeLinks";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import { CATEGORY_DOT } from "@/components/search/SearchParts";
import { OfferDrawer, type OriginRect, type TearEdge } from "@/components/offers/OfferDrawer";
import { OfferTicket, TICKET_H } from "@/components/offers/OfferTicket";
import { CheckInSection } from "@/components/checkin/CheckInSection";
import { PlaceHero, type PlaceHeroHandle } from "@/components/place/PlaceHero";
import { PlaceHours, useHoursColors } from "@/components/place/PlaceHours";
import { PlaceMiniMap } from "@/components/place/PlaceMiniMap";
import { EventsHere, NearbyRail, type NearbyItem } from "@/components/place/PlaceNearby";
import {
  AboutText, ActionRow, Amenities, ContactList, GUTTER, Section, type ContactRow, type PlaceAction,
} from "@/components/place/PlaceSections";
import { FriendsHere, TreasureHint } from "@/components/place/PlaceSocial";
import {
  BackButton, BOTTOM_BAR_H, BottomBar, PlaceStatusBar, Toast, TOP_BAR_H, TopBar, type ToastHandle,
} from "@/components/place/PlaceChrome";
import {
  PhotoViewerHost, PlaceSheets, type PhotoViewerHandle, type PlaceSheet, type PlaceSheetsHandle,
} from "@/components/place/PlaceOverlays";

// Alltid samma tomma listor medan något laddas (nya tomma listor vid varje uppritning räknade om allt)
const NO_PLACES: Place[] = [];
const NO_EVENTS: Event[] = [];
const NO_OFFERS: Offer[] = [];
const NO_REDEMPTIONS: RedemptionRow[] = [];
const NO_COLLECTIBLES: Collectible[] = [];
const NO_FRIENDS: FriendAtPlace[] = [];
const LOGO = 76;
/** Så nära en skatt får ligga för att visas på platssidan */
const TREASURE_NEAR_M = 1500;
const NEARBY_COUNT = 8;
const EVENTS_SHOWN = 3;

/** Bilderna ur image_url (flera adresser skilda med komma — Wix-adresser har komman i sig) */
const imagesOf = (imageUrl: string | null | undefined) =>
  (imageUrl ?? "").split(/,(?=\s*https?:\/\/)/).map((u) => u.trim()).filter(Boolean);

/** Bildens höjd överst */
const heroHeight = (width: number) => Math.round(Math.min(width * 0.95, 420));

/** Hela raden (även det listan inte hämtar), om i bakgrunden */
function usePlaceDetail(id: number) {
  return useQuery({
    queryKey: ["place", id],
    enabled: Number.isFinite(id),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("places").select("*").eq("id", id).single();
      if (error) throw error;
      return normalizePlace(data);
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
  const navigation = useNavigation();
  // from=story: öppnad från en berättelse. offer: ett erbjudande att öppna direkt (berättelsens klistermärke)
  const params = useLocalSearchParams<{ from?: string; offer?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const heroH = heroHeight(width);
  const collapseAt = heroH - insets.top - TOP_BAR_H;
  // Bara för att veta om erbjudandepanelen behövs (innehållet läser samma lista)
  const { data: offers = NO_OFFERS } = useOffers(place.id);

  // Det som ligger långt ner byggs när sidan glidit fram (eller efter en stund)
  const [later, setLater] = useState(false);
  useEffect(() => {
    const unsub = navigation.addListener("transitionEnd" as never, (e: { data?: { closing?: boolean } }) => {
      if (!e?.data?.closing) setLater(true);
    });
    const t = setTimeout(() => setLater(true), 700);
    return () => { unsub(); clearTimeout(t); };
  }, [navigation]);

  // Scrollen läses bara på UI-tråden (bildens djup, toppraden, kartan) — ingen omritning medan man scrollar
  const scrollY = useSharedValue(0);
  // När sidan senast scrollade: ett nudd på en biljett medan sidan glider stoppar bara sidan
  const scrollAt = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      scrollAt.value = Date.now();
    },
  });

  // Det som öppnas ovanpå sidan, via ref (bara det ritas om)
  const heroRef = useRef<PlaceHeroHandle>(null);
  const viewerRef = useRef<PhotoViewerHandle>(null);
  const sheetsRef = useRef<PlaceSheetsHandle>(null);
  const toastRef = useRef<ToastHandle>(null);
  const openViewer = useCallback((i: number) => viewerRef.current?.open(i), []);
  const onViewerClose = useCallback((i: number) => heroRef.current?.show(i), []);
  const openSheet = useCallback((sheet: PlaceSheet) => sheetsRef.current?.open(sheet), []);
  const openSave = useCallback(() => openSheet("save"), [openSheet]);
  const showToast = useCallback((text: string) => toastRef.current?.show(text), []);
  const { burst, show: showBurst } = useLikeBurst();

  // Erbjudandena: biljetterna rivs som på Förmåner
  const edgeAmt = useSharedValue(0);
  const edgeProg = useSharedValue(0);
  const edgeActive = useSharedValue(0);
  const edge: TearEdge = useMemo(() => ({ amt: edgeAmt, prog: edgeProg, active: edgeActive }), [edgeAmt, edgeProg, edgeActive]);
  const [openOffer, setOpenOffer] = useState<{ offer: Offer; origin: OriginRect | null } | null>(null);
  const onOpenOffer = useCallback((offer: Offer, origin: OriginRect | null) => setOpenOffer({ offer, origin }), []);
  const closeOffer = useCallback(() => setOpenOffer(null), []);

  // Företagets statistik: en visning, och varifrån man kom
  useEffect(() => {
    trackPlaceView(place.id, sourceFromParam(params.from) ?? placeSource(navigation.getState() as never));
    // Räknas en gång per gång sidan öppnas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id]);

  // Erbjudandet från en berättelses klistermärke öppnas när sidan glidit fram
  const autoOffer = useRef(params.offer ?? null);
  useEffect(() => {
    if (!later || !autoOffer.current) return;
    const offer = offers.find((o) => o.id === autoOffer.current);
    if (offer) {
      autoOffer.current = null;
      setOpenOffer({ offer, origin: null });
    }
  }, [later, offers]);

  const images = useMemo(() => imagesOf(place.image_url), [place.image_url]);
  const HeroIcon = findCategory(place.category)?.icon ?? MapPin;

  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <PlaceStatusBar scrollY={scrollY} collapseAt={collapseAt} overImage={images.length > 0} />
      <Reanimated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: BOTTOM_BAR_H + 36 + insets.bottom }}
      >
        <PlaceHero
          ref={heroRef}
          images={images}
          height={heroH}
          scrollY={scrollY}
          onOpen={openViewer}
          Icon={HeroIcon}
          topInset={insets.top}
        />
        <PlaceContent
          place={place}
          places={places}
          later={later}
          heroH={heroH}
          scrollY={scrollY}
          scrollAt={scrollAt}
          edge={edge}
          openOfferId={openOffer?.origin ? openOffer.offer.id : null}
          onOpenOffer={onOpenOffer}
          openSheet={openSheet}
          showToast={showToast}
        />
      </Reanimated.ScrollView>

      <TopBar place={place} scrollY={scrollY} collapseAt={collapseAt} onSave={openSave} />
      <BottomBar place={place} onBurst={showBurst} />
      <Toast ref={toastRef} />

      <PhotoViewerHost ref={viewerRef} images={images} onClose={onViewerClose} />
      <PlaceSheets ref={sheetsRef} placeId={place.id} />
      {/* Byggs i förväg (osynlig) när sidan glidit fram, så rivningen alltid syns från första bildrutan */}
      {later && offers.length > 0 && (
        <OfferDrawer
          visible={openOffer != null}
          placeId={place.id}
          focusOffer={openOffer?.offer}
          origin={openOffer?.origin}
          edge={edge}
          onClose={closeOffer}
        />
      )}
      <LikeBurst burst={burst} />
    </View>
  );
}

/** Det som dyker upp när datan kommit: samma lugna inglidning som Rise, utan väntan */
const RISE_IN = (i: number) =>
  FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] }).duration(380).delay(i * 60);

/**
 * Allt under bilden. Ritas bara om när ny data kommer (eller en biljett öppnas) — aldrig av scroll,
 * paneler eller hjärtat. Allt har hel bakgrund och ligger ovanpå bilden (som glider in under).
 */
const PlaceContent = memo(function PlaceContent({
  place, places, later, heroH, scrollY, scrollAt, edge, openOfferId, onOpenOffer, openSheet, showToast,
}: {
  place: Place;
  places: Place[];
  later: boolean;
  heroH: number;
  scrollY: SharedValue<number>;
  scrollAt: SharedValue<number>;
  edge: TearEdge;
  /** Biljetten vars band är bortrivet just nu */
  openOfferId: string | null;
  onOpenOffer: (offer: Offer, origin: OriginRect | null) => void;
  openSheet: (sheet: PlaceSheet) => void;
  showToast: (text: string) => void;
}) {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const hoursTint = useHoursColors();

  const { data: offers = NO_OFFERS } = useOffers(place.id);
  const { data: redemptions = NO_REDEMPTIONS } = useOfferRedemptions();
  const { data: events = NO_EVENTS } = useEvents();
  const { data: collectibles = NO_COLLECTIBLES } = useCollectibles();
  const { data: collected } = useCollected();
  const { data: friends = NO_FRIENDS } = useFriendsAtPlace(place.id);
  const me = useKnownLocation();

  const hasCoords = place.lat != null && place.lng != null;
  const catIds = useMemo(() => [...placeCategories(place.category)], [place.category]);
  const mainCat = findCategory(place.category);
  const isHotel = catIds.length > 0 && catIds.every((c) => c === "hotell-bb");
  const hours = place.opening_hours as Record<string, string> | null;
  const status = isHotel ? null : hoursStatus(hours);
  const hasHours = weekRows(hours).length > 0;
  const myKm = me && hasCoords ? distanceMeters(me.lat, me.lng, place.lat!, place.lng!) / 1000 : null;
  const website = place.website_url;

  const amenities = useMemo(() => {
    const a = parseAmenities((place as Place & { amenities?: unknown }).amenities);
    return PRACTICAL.filter((p) => p.id !== "openNow" && a[p.id] === true);
  }, [place]);

  const ticketList = useMemo(() => offers
    .map((offer) => ({ offer, used: !offerEligibility(offer, redemptions).canUse }))
    .sort((a, b) => Number(a.used) - Number(b.used)), [offers, redemptions]);

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

  const showOnMap = useCallback(() => {
    router.dismissTo({ pathname: "/(tabs)/map", params: { place: String(place.id) } });
  }, [router, place.id]);

  // Långt tryck på telefon, e-post och hemsida kopierar
  const copy = useCallback(async (text: string) => {
    const ok = await copyText(text);
    if (ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast(ok ? i18n.t("place.copied") : i18n.t("place.copyFailed"));
  }, [showToast]);

  const actions = useMemo((): PlaceAction[] => {
    const out: PlaceAction[] = [];
    if (place.phone) out.push({ key: "call", label: t("place.call"), Icon: Phone, onPress: () => { trackPlaceLink(place.id, "phone"); callPhone(place.phone!); } });
    if (website) out.push({ key: "web", label: t("place.website"), Icon: Globe, onPress: () => { trackPlaceLink(place.id, "website"); openWebsite(website); } });
    if (hasCoords) out.push({ key: "map", label: t("place.map"), Icon: MapIcon, onPress: showOnMap });
    if (place.instagram_url) out.push({ key: "ig", label: "Instagram", Icon: InstagramIcon, onPress: () => { trackPlaceLink(place.id, "instagram"); openExternal(place.instagram_url!); } });
    if (place.facebook_url) out.push({ key: "fb", label: "Facebook", Icon: FacebookIcon, onPress: () => { trackPlaceLink(place.id, "facebook"); openExternal(place.facebook_url!); } });
    if (place.email) out.push({ key: "mail", label: t("place.email"), Icon: Mail, onPress: () => { trackPlaceLink(place.id, "email"); sendEmail(place.email!); } });
    return out;
  }, [place, website, hasCoords, showOnMap, t]);

  // Telefon, e-post och hemsidans namn skrivs ut; Instagram och Facebook bara som namn
  const contact = useMemo((): ContactRow[] => {
    const out: ContactRow[] = [];
    if (place.phone) out.push({ key: "phone", Icon: Phone, label: t("place.phone"), value: place.phone, onPress: () => { trackPlaceLink(place.id, "phone"); callPhone(place.phone!); }, onLongPress: () => copy(place.phone!) });
    if (place.email) out.push({ key: "mail", Icon: Mail, label: t("place.email"), value: place.email, onPress: () => { trackPlaceLink(place.id, "email"); sendEmail(place.email!); }, onLongPress: () => copy(place.email!) });
    if (website) out.push({ key: "web", Icon: Globe, label: t("place.website"), value: siteName(website), onPress: () => { trackPlaceLink(place.id, "website"); openWebsite(website); }, onLongPress: () => copy(withProtocol(website)) });
    if (place.instagram_url) out.push({ key: "ig", Icon: InstagramIcon, label: "Instagram", onPress: () => { trackPlaceLink(place.id, "instagram"); openExternal(place.instagram_url!); } });
    if (place.facebook_url) out.push({ key: "fb", Icon: FacebookIcon, label: "Facebook", onPress: () => { trackPlaceLink(place.id, "facebook"); openExternal(place.facebook_url!); } });
    return out;
  }, [place, website, copy, t]);

  return (
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
          <Section title={t("place.about")}>
            <AboutText
              lead={place.description && place.short_description !== place.description ? place.short_description : null}
              body={place.description ?? place.short_description}
            />
          </Section>
        </Rise>
      )}

      {ticketList.length > 0 && (
        <Section title={t("pass.title")}>
          <View style={{ gap: 14 }}>
            {ticketList.map(({ offer, used }, i) => (later ? (
              <Reanimated.View key={offer.id} entering={RISE_IN(i)}>
                <OfferTicket
                  offer={offer}
                  used={used}
                  torn={offer.id === openOfferId}
                  edge={edge}
                  scrollAt={scrollAt}
                  linkPlace={false}
                  onOpen={onOpenOffer}
                />
              </Reanimated.View>
            ) : <Skeleton key={offer.id} height={TICKET_H} radius={18} />))}
          </View>
        </Section>
      )}

      {friends.length > 0 && (
        <Section title={t("place.friends")}>
          <Reanimated.View entering={RISE_IN(0)}>
            <FriendsHere friends={friends} onPress={() => openSheet("friends")} />
          </Reanimated.View>
        </Section>
      )}

      {amenities.length > 0 && (
        <Section title={t("place.practical")}>
          <Amenities items={amenities} />
        </Section>
      )}

      {hasHours && (
        <Section title={t("place.hours")}>
          <PlaceHours hours={hours} showStatus={!isHotel} exceptions={place.hours_exceptions} />
        </Section>
      )}

      {later && upcoming.length > 0 && <EventsSection events={upcoming} />}

      {hasCoords && (
        <LocationSection place={place} myKm={myKm} mount={later} heroH={heroH} scrollY={scrollY} onShowOnMap={showOnMap} />
      )}

      {treasure && (
        <Section title={t("place.treasure")}>
          <TreasureHint
            meters={treasure.m}
            found={collected?.has(treasure.c.id) ?? false}
            name={treasure.c.name}
            onPress={() => router.dismissTo({ pathname: "/(tabs)/map", params: { sticker: treasure.c.id } })}
          />
        </Section>
      )}

      {contact.length > 0 && (
        <Section title={t("place.contact")}>
          <ContactList rows={contact} />
          <Text style={[s.hint, { color: colors.faint }]}>{t("place.holdToCopy")}</Text>
        </Section>
      )}

      {later && nearby.length > 0 && (
        <Section title={t("place.nearby")}>
          <NearbyRail items={nearby} onPress={(p) => pushOnce(router, `/place/${p.id}?from=place`)} />
        </Section>
      )}

      <TouchableOpacity style={[s.report, { borderColor: colors.border }]} activeOpacity={0.7} onPress={() => openSheet("report")}>
        <PenLine size={16} color={colors.muted} strokeWidth={2} />
        <Text style={[s.reportText, { color: colors.muted }]}>
          {t("place.reportAsk")} <Text style={{ color: colors.goldText }}>{t("place.reportCta")}</Text>
        </Text>
      </TouchableOpacity>
      {place.info_updated_at && (
        <Text style={[s.updated, { color: colors.faint }]}>
          {t("place.updated", { date: formatDate(parseISO(place.info_updated_at), "d MMMM yyyy") })}
        </Text>
      )}
      <OwnerLink place={place} />
    </View>
  );
});

// ── Delarna ──────────────────────────────────────────────────────────────────

/** Kommande evenemang på platsen: tre först, resten bakom Visa alla */
function EventsSection({ events }: { events: Event[] }) {
  const [all, setAll] = useState(false);
  return (
    <Section
      title={i18n.t("place.eventsHere")}
      action={events.length > EVENTS_SHOWN ? (all ? i18n.t("place.showFewer") : i18n.t("place.showAll", { count: events.length })) : undefined}
      onAction={() => setAll((v) => !v)}
    >
      <EventsHere events={all ? events : events.slice(0, EVENTS_SHOWN)} onOpen={(e) => openEvent(e.id, { event: e })} />
    </Section>
  );
}

/**
 * Hitta hit: ett kort med kartan överst, orten och hållplatsen, och Vägbeskrivning längst ner.
 * Kartan byggs när man scrollat nära den (läget hålls här, så det bara ritar om det här kortet).
 */
function LocationSection({ place, myKm, mount, heroH, scrollY, onShowOnMap }: {
  place: Place;
  myKm: number | null;
  /** Sidan har glidit fram */
  mount: boolean;
  heroH: number;
  scrollY: SharedValue<number>;
  onShowOnMap: () => void;
}) {
  const { colors } = useTheme();
  const { height: winH } = useWindowDimensions();
  const y = useSharedValue(Number.MAX_SAFE_INTEGER);
  const [near, setNear] = useState(false);
  useAnimatedReaction(
    () => scrollY.value + winH * 1.6 > y.value,
    (now, prev) => { if (now && !prev) runOnJS(setNear)(true); },
  );
  const transit = (place as Place & { transit_stop_name?: string | null }).transit_stop_name;

  return (
    <View onLayout={(e) => { y.value = heroH + e.nativeEvent.layout.y; }}>
      <Section title={i18n.t("place.findHere")}>
        <View style={[s.locCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PlaceMiniMap lat={place.lat!} lng={place.lng!} mount={mount && near} onPress={onShowOnMap} />
          <View style={s.locInfo}>
            <View style={s.whereRow}>
              <MapPin size={17} color={colors.muted} strokeWidth={2} />
              <Text style={[s.whereText, { color: colors.text }]} numberOfLines={1}>{place.nearest_town ?? "Österlen"}</Text>
              {myKm != null && <Text style={[s.whereKm, { color: colors.muted }]}>{i18n.t("place.fromYou", { distance: distanceLabel(myKm) })}</Text>}
            </View>
            {!!transit && (
              <View style={s.whereRow}>
                <Bus size={17} color={colors.muted} strokeWidth={2} />
                <Text style={[s.whereText, { color: colors.text }]} numberOfLines={1}>
                  <Text style={{ color: colors.muted }}>{i18n.t("place.stop")}  </Text>{transit}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={[s.locButton, { borderTopColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => { trackDirections(place.id); openDirections(place.lat, place.lng); }}
          >
            <Navigation size={17} color={colors.goldText} strokeWidth={2.2} />
            <Text style={[s.locButtonText, { color: colors.goldText }]}>{i18n.t("place.directions")}</Text>
          </TouchableOpacity>
        </View>
      </Section>
    </View>
  );
}

/**
 * Allra längst ner. Den som sköter platsen kommer härifrån till Mitt företag. Alla andra ser en
 * diskret rad "Är det här ditt företag?" — tills någon tagit hand om platsen (då döljs den).
 */
function OwnerLink({ place }: { place: Place }) {
  const router = useRouter();
  const { colors } = useTheme();
  const mine = useMyPlaceIds().has(place.id);
  if (!mine && (place.claim_link_hidden || place.is_business === false)) return null;
  return (
    <TouchableOpacity
      style={s.owner}
      activeOpacity={0.6}
      hitSlop={8}
      onPress={() => pushOnce(router, mine ? `/business?place=${place.id}` : `/business/claim?place=${place.id}`)}
    >
      <Text style={[s.ownerText, { color: mine ? colors.goldText : colors.faint }]}>
        {i18n.t(mine ? "place.ownerMine" : "place.ownerAsk")}
      </Text>
    </TouchableOpacity>
  );
}

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

/** Platsen finns inte i telefonen än (öppnad från en länk direkt efter start): sidans form i grått */
function PlaceSkeleton() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <Skeleton height={heroHeight(width)} radius={0} />
      <View style={{ paddingHorizontal: GUTTER, paddingTop: 54, gap: 10 }}>
        <Skeleton width="72%" height={26} radius={8} />
        <Skeleton width="48%" height={14} radius={6} />
        <Skeleton width="36%" height={14} radius={6} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={68} radius={16} style={{ flex: 1 }} />)}
        </View>
      </View>
      <View style={[s.skeletonBar, { paddingTop: insets.top, height: insets.top + TOP_BAR_H }]}>
        <BackButton />
      </View>
    </View>
  );
}

function NotFound() {
  const router = useRouter();
  return (
    <ProblemScreen
      icon={(color) => <MapPin size={36} color={color} strokeWidth={1.6} />}
      title={i18n.t("place.notFoundTitle")}
      text={i18n.t("place.notFoundText")}
      primary={router.canGoBack()
        ? { label: i18n.t("place.back"), onPress: () => router.back() }
        : { label: i18n.t("place.toStart"), onPress: () => router.replace("/") }}
    />
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

  locCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  locInfo: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  whereRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  whereText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15 },
  whereKm: { fontFamily: "Inter_500Medium", fontSize: 13.5, fontVariant: ["tabular-nums"] },
  locButton: {
    height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  locButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 8, textAlign: "center" },

  report: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: GUTTER, marginTop: 40, paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reportText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  updated: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", marginTop: 2 },
  owner: { alignSelf: "center", marginTop: 18, paddingVertical: 6, paddingHorizontal: 14 },
  ownerText: { fontFamily: "Inter_500Medium", fontSize: 12.5 },

  skeletonBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },

});
