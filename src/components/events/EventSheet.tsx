/**
 * Eventets panel — det enda sättet ett evenemang visas på (platser är sidor, evenemang är paneler).
 * Sidorna öppnar den med openEvent() (lib/eventSheet).
 *
 * Uppifrån: bilden med rubriken, datumrutan (samma 30/OKT som på korten) och Dela; raderna
 * arrangör, datum och tid och adress (fritt mot bakgrunden, tunna linjer emellan); en remsa med
 * fyra snabba fakta (entré, inne/ute, mat & dryck, parkering — ifyllt av företaget); Köp biljett
 * om det finns en länk; och beskrivningen. Längst ner, alltid synligt över en genomskinlig tona:
 * Lägg till i kalender, spara (hjärtat) och stäng. Man stänger med krysset, genom att trycka
 * bredvid, eller genom att dra ner panelen.
 *
 * Varför den är byggd så här (det hackade förut):
 * - Panelen ligger ALLTID färdigbyggd i appens rot, nere utanför skärmen — ingen Modal som skapas
 *   och rivs vid varje tryck. Att öppna = byta innehåll medan den ligger nere, sen glida upp.
 * - Ingenting hämtas när den öppnas: eventet (med arrangören) finns redan i eventlistan som Hem
 *   hämtar vid start. Förut kom svaret mitt i animationen, allt ritades om och arrangörsraden
 *   hoppade in och knuffade ner resten.
 * - Den glider upp först när bilden visas (högst en kort stund), så inget dyker upp under rörelsen.
 * - Panelen byggs när appen startat klart (useAppSettled), inte under den tunga starten.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Image, Pressable, StyleSheet, Linking, Platform, Share, BackHandler, useWindowDimensions,
} from "react-native";
import Reanimated, {
  Easing, interpolate, interpolateColor, runOnJS, useAnimatedScrollHandler, useAnimatedStyle,
  useReducedMotion, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import {
  CalendarCheck, CalendarDays, CalendarPlus, Car, ChevronRight, Globe, Home, MapPin,
  Store, Sun, Ticket, UtensilsCrossed, X, type LucideIcon,
} from "lucide-react-native";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { fetchEvents, type Event } from "@/hooks/useEvents";
import { saveEventFavorite } from "@/hooks/useFavorites";
import { useEventSheetRequest, type EventSheetRequest } from "@/lib/eventSheet";
import { addEventToCalendar } from "@/lib/addToCalendar";
import { eventWhen, lastDay } from "@/lib/events";
import { useAppSettled } from "@/lib/appSettled";
import { DateBox } from "@/components/events/EventCards";
import { HeartButton, LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import { PressableScale } from "@/components/PressableScale";
import { ShareIcon } from "@/components/ShareIcon";

const BG = "#121212";
const CARD = "#1A1A1D";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const GOLD_LT = "#E8C674";
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;
/** Bottenradens höjd (knapparna + luft), så sista texten aldrig hamnar bakom den */
const BAR_H = 56 + 32;
/** Bottenradens tona: helt genomskinlig överst, aldrig helt täckande — man ser texten bakom */
const BAR_FADE = ["rgba(18,18,18,0)", "rgba(18,18,18,0.7)", "rgba(18,18,18,0.97)"];
/** Så länge panelen högst väntar på att bilden ska visas innan den glider upp */
const IMAGE_WAIT_MS = 160;

interface Shown { request: EventSheetRequest; event: Event }

const findInList = (qc: QueryClient, id: number) =>
  qc.getQueryData<Event[]>(["events"])?.find((e) => e.id === id);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Måndag 10 augusti 2026", eller "14 – 16 maj 2026" */
function dateLong(e: Event): string {
  if (!e.date) return "";
  const start = parseISO(e.date);
  if (e.end_date && e.end_date > e.date) {
    const end = parseISO(e.end_date);
    const sameMonth = start.getMonth() === end.getMonth();
    return `${format(start, sameMonth ? "d" : "d MMMM", { locale: sv })} – ${format(end, "d MMMM yyyy", { locale: sv })}`;
  }
  return cap(format(start, "EEEE d MMMM yyyy", { locale: sv }));
}

/** "I dag", "I morgon", "Om 4 dagar", "Pågår nu", "Har varit" */
function relativeDay(e: Event): string | null {
  if (!e.date) return null;
  const now = new Date();
  const toStart = differenceInCalendarDays(parseISO(e.date), now);
  const toEnd = differenceInCalendarDays(parseISO(lastDay(e) ?? e.date), now);
  if (toEnd < 0) return "Har varit";
  if (toStart < 0) return "Pågår nu";
  if (toStart === 0) return "I dag";
  if (toStart === 1) return "I morgon";
  if (toStart <= 13) return `Om ${toStart} dagar`;
  return null;
}

export function EventSheetHost() {
  const { height: winH, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const settled = useAppSettled();
  const request = useEventSheetRequest();
  const sheetH = Math.round(winH * 0.9);
  const heroH = Math.round(width * 0.78);

  // Det panelen visar just nu (ligger kvar nere utanför skärmen efter att den stängts)
  const [shown, setShown] = useState<Shown | null>(null);
  // Panelen tar emot tryck (öppen, eller på väg upp/ner)
  const [active, setActive] = useState(false);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // ── Spara: ändras direkt i panelen. Har sidan som öppnade den ett eget sparat-läge (Kalender,
  // Favoriter) får den veta; annars sparar panelen själv och resten av appen uppdateras när den stängs
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const savedDirty = useRef(false);
  const { burst, show: showBurst } = useLikeBurst();
  const toggleSave = useCallback(() => {
    const cur = shownRef.current;
    if (!cur) return;
    const next = !savedRef.current;
    setSaved(next);
    if (cur.request.onToggleSave) { cur.request.onToggleSave(cur.request.id); return; }
    savedDirty.current = true;
    saveEventFavorite(cur.request.id, next).catch(() => setSaved(!next));
  }, []);

  // ── Ett nytt tryck: byt innehåll medan panelen ligger nere ──
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    (async () => {
      let event = request.event ?? findInList(queryClient, request.id);
      if (!event) {
        // Eventlistan har inte hunnit hämtas (ovanligt) — hämta den först, öppna sen
        try {
          const list = await queryClient.fetchQuery({ queryKey: ["events"], queryFn: fetchEvents });
          event = list.find((e) => e.id === request.id);
        } catch {
          // Gick inte att hämta — panelen öppnas inte
        }
      }
      if (cancelled || !event) return;
      const favorites = queryClient.getQueryData<{ event_id: number | null }[]>(["favorites"]) ?? [];
      setSaved(request.saved ?? favorites.some((f) => f.event_id === request.id));
      savedDirty.current = false;
      setShown({ request, event });
      setActive(true);
    })();
    return () => { cancelled = true; };
  }, [request, queryClient]);

  // ── Glid upp / ner ──
  const translateY = useSharedValue(sheetH);
  const backdrop = useSharedValue(0);
  const xAnim = useSharedValue(0);
  const scrollRef = useRef<Reanimated.ScrollView>(null);
  const scrollY = useSharedValue(0);
  const startedKey = useRef<number | null>(null);
  // Vilket event som är uppe — stängningen rapporterar det, så en stängning som blir klar efter att
  // ett nytt event redan öppnats inte stänger av det nya
  const openKey = useSharedValue(0);

  const slideIn = useCallback((key: number) => {
    if (startedKey.current === key || shownRef.current?.request.key !== key) return;
    startedKey.current = key;
    requestAnimationFrame(() => {
      backdrop.value = withTiming(1, { duration: reduceMotion ? 0 : 260 });
      translateY.value = reduceMotion ? 0 : withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
    });
  }, [reduceMotion, backdrop, translateY]);

  // Nytt innehåll på plats: börja överst, krysset grått igen, och glid upp när bilden visas
  useEffect(() => {
    if (!shown) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    scrollY.value = 0;
    xAnim.value = 0;
    const key = shown.request.key;
    openKey.value = key;
    const t = setTimeout(() => slideIn(key), shown.event.image_url ? IMAGE_WAIT_MS : 0);
    return () => clearTimeout(t);
  }, [shown, slideIn, scrollY, xAnim, openKey]);
  const onHeroReady = useCallback(() => {
    const key = shownRef.current?.request.key;
    if (key != null) slideIn(key);
  }, [slideIn]);

  const afterClose = useRef<(() => void) | null>(null);
  const onClosed = useCallback((key: number) => {
    if (key !== shownRef.current?.request.key) return;
    setActive(false);
    if (savedDirty.current) {
      savedDirty.current = false;
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    }
    const then = afterClose.current;
    afterClose.current = null;
    then?.();
  }, [queryClient]);
  const close = useCallback((then?: () => void) => {
    afterClose.current = then ?? null;
    // Stängs den innan den hunnit glida upp ska den inte glida upp efteråt
    startedKey.current = shownRef.current?.request.key ?? null;
    backdrop.value = withTiming(0, { duration: reduceMotion ? 0 : 220 });
    translateY.value = withTiming(sheetH, { duration: reduceMotion ? 0 : 240, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(onClosed)(openKey.value);
    });
  }, [backdrop, translateY, sheetH, reduceMotion, onClosed, openKey]);

  // Androids bakåtknapp stänger panelen
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => sub.remove();
  }, [active, close]);

  // Krysset: blir rött och vrider sig ett halvt varv, sen glider panelen ner
  const pressX = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    xAnim.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done) runOnJS(close)();
    });
  };
  const xBtnStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(xAnim.value, [0, 1], [CARD, "rgba(220,38,38,0.75)"]),
  }));
  const xIconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${xAnim.value * 180}deg` }] }));

  // ── Dra ner för att stänga: från bilden direkt, från texten när den är uppscrollad ──
  const dragOffset = useSharedValue(0);
  const settle = (velocityY: number) => {
    "worklet";
    if (translateY.value > CLOSE_DISTANCE || (velocityY > CLOSE_VELOCITY && translateY.value > 0)) {
      backdrop.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(sheetH, { duration: 220 }, (done) => {
        if (done) runOnJS(onClosed)(openKey.value);
      });
    } else {
      translateY.value = withSpring(0, { damping: 32, stiffness: 300 });
    }
  };
  const nativeScroll = Gesture.Native();
  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-14, 14])
    .simultaneousWithExternalGesture(nativeScroll)
    .onStart(() => { dragOffset.value = 0; })
    .onUpdate((e) => {
      // Så länge texten är nedscrollad är det texten som rör sig; panelen följer först vid toppen
      if (scrollY.value > 0.5) { dragOffset.value = e.translationY; return; }
      translateY.value = Math.max(0, e.translationY - dragOffset.value);
    })
    .onEnd((e) => settle(e.velocityY));
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * interpolate(translateY.value, [0, sheetH], [1, 0.2]),
  }));

  // ── Handlingar (stabila, så innehållet inte ritas om i onödan) ──
  const goToPlace = useCallback(() => {
    const id = shownRef.current?.event.place?.id;
    if (id != null) close(() => router.push(`/place/${id}` as any));
  }, [close]);
  const openMaps = useCallback(() => {
    const e = shownRef.current?.event;
    if (!e) return;
    const place = e.place;
    const label = e.location ?? place?.name ?? "";
    const hasCoords = place?.lat != null && place?.lng != null;
    const url = Platform.OS === "ios"
      ? `maps://?q=${encodeURIComponent(label)}${hasCoords ? `&ll=${place!.lat},${place!.lng}` : `, Österlen`}`
      : hasCoords
        ? `geo:${place!.lat},${place!.lng}?q=${place!.lat},${place!.lng}(${encodeURIComponent(label)})`
        : `geo:0,0?q=${encodeURIComponent(`${label}, Österlen`)}`;
    Linking.openURL(url).catch(() => {});
  }, []);
  const share = useCallback(() => {
    const e = shownRef.current?.event;
    if (!e) return;
    const link = e.ticket_url ?? e.website_url;
    const lines = [
      "Följ med?",
      e.title,
      [eventWhen(e), e.location ?? e.place?.name].filter(Boolean).join(" · "),
      link,
      "",
      "Hittat i Österlenappen",
    ].filter((l) => l !== null && l !== undefined) as string[];
    Share.share({ message: lines.join("\n") }).catch(() => {});
  }, []);
  const addToCalendar = () => {
    const e = shownRef.current?.event;
    if (!e) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    addEventToCalendar(e, e.location ?? e.place?.name ?? null).catch(() => {});
  };

  // Byggs när appen startat klart (eller direkt om någon hinner öppna ett event innan dess)
  if (!settled && !shown) return null;
  const event = shown?.event ?? null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Reanimated.View>

      <Reanimated.View style={[s.sheet, { height: sheetH }, sheetStyle]}>
        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }}>
            <GestureDetector gesture={nativeScroll}>
              <Reanimated.ScrollView
                ref={scrollRef}
                onScroll={onScroll}
                scrollEventThrottle={16}
                bounces={false}
                overScrollMode="never"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: BAR_H + insets.bottom + 24 }}
              >
                {/* ── Bilden, rubriken, datumrutan och Dela ── */}
                <View style={{ height: heroH }}>
                  {shown && <HeroImage key={shown.request.key} uri={shown.event.image_url} onReady={onHeroReady} />}
                  {/* Riktig mjuk toning ner i panelens bakgrund, så rubriken ligger på mörkret */}
                  <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Rect x={0} y={0} width={width} height={heroH}>
                      <LinearGradient
                        start={vec(0, heroH * 0.35)}
                        end={vec(0, heroH)}
                        colors={["rgba(18,18,18,0)", "rgba(18,18,18,0.72)", BG]}
                        positions={[0, 0.6, 1]}
                      />
                    </Rect>
                  </Canvas>
                  <View style={s.handle} />
                  {event && <HeroText event={event} onShare={share} />}
                </View>
                {event && <SheetBody event={event} width={width} onGoToPlace={goToPlace} onOpenMaps={openMaps} />}
              </Reanimated.ScrollView>
            </GestureDetector>
          </View>
        </GestureDetector>

        {/* ── Alltid synligt längst ner: kalender, spara, stäng ── */}
        <View style={[s.bar, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Rect x={0} y={0} width={width} height={BAR_H + insets.bottom + 40}>
              <LinearGradient start={vec(0, 0)} end={vec(0, BAR_H + insets.bottom + 22)} colors={BAR_FADE} positions={[0, 0.45, 1]} />
            </Rect>
          </Canvas>
          {/* Egen behållare som växer: PressableScale lägger stilen på sitt inre lager, så flex: 1
              där fick aldrig knappen att ta platsen */}
          <View style={{ flex: 1 }}>
            <PressableScale style={s.calBtn} scale={0.97} onPress={addToCalendar}>
              <CalendarPlus size={20} color={BG} strokeWidth={2} />
              <Text style={s.calText}>Lägg till i kalender</Text>
            </PressableScale>
          </View>
          <View style={s.roundBtn}>
            {/* Nytt hjärta för varje event, så det inte tonar från förra eventets läge */}
            <HeartButton key={shown?.request.key ?? 0} isFav={saved} onToggle={toggleSave} onBurst={showBurst} size={22} label="sparade" />
          </View>
          <Pressable onPress={pressX} hitSlop={6} accessibilityLabel="Stäng">
            <Reanimated.View style={[s.roundBtn, xBtnStyle]}>
              <Reanimated.View style={xIconStyle}>
                <X size={20} color={FG} strokeWidth={2} />
              </Reanimated.View>
            </Reanimated.View>
          </Pressable>
        </View>
      </Reanimated.View>

      <LikeBurst burst={burst} />
    </View>
  );
}

/** Eventets bild — säger till när den visas, så panelen kan glida upp med bilden redan på plats */
function HeroImage({ uri, onReady }: { uri: string | null; onReady: () => void }) {
  useEffect(() => {
    if (!uri) onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!uri) return <View style={[StyleSheet.absoluteFill, { backgroundColor: "#2A2A2A" }]} />;
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoad={onReady} onError={onReady} />;
}

const HeroText = memo(function HeroText({ event, onShare }: { event: Event; onShare: () => void }) {
  return (
    <>
      <DateBox event={event} style={s.heroDate} />
      <View style={s.heroText}>
        <View style={{ flex: 1, gap: 10, alignItems: "flex-start" }}>
          {event.is_featured && (
            <View style={s.featured}>
              <Text style={s.featuredText}>UTVALT</Text>
            </View>
          )}
          <Text style={s.title} numberOfLines={3}>{event.title}</Text>
        </View>
        <PressableScale style={s.shareBtn} scale={0.9} onPress={onShare} accessibilityLabel="Dela med en vän">
          <ShareIcon size={19} color={FG} strokeWidth={2} />
        </PressableScale>
      </View>
    </>
  );
});

/** Allt under bilden. Ritas bara om när eventet byts */
const SheetBody = memo(function SheetBody({ event, width, onGoToPlace, onOpenMaps }: {
  event: Event; width: number; onGoToPlace: () => void; onOpenMaps: () => void;
}) {
  const place = event.place ?? null;
  const websiteHost = event.website_url
    ? event.website_url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : null;
  const relative = relativeDay(event);

  // Fyra snabba fakta, varje sak sagd i klartext. Det som saknas står kvar, nedtonat
  const facts: { Icon: LucideIcon; label: string; has: boolean }[] = [
    event.booking_required
      ? { Icon: CalendarCheck, label: "Bokning krävs", has: true }
      : event.tickets_required
        ? { Icon: Ticket, label: "Biljett krävs", has: true }
        : { Icon: Ticket, label: "Fri entré", has: true },
    event.is_indoor
      ? { Icon: Home, label: "Inomhus", has: true }
      : { Icon: Sun, label: "Utomhus", has: true },
    { Icon: UtensilsCrossed, label: event.has_food_drink ? "Mat & dryck" : "Ingen servering", has: !!event.has_food_drink },
    { Icon: Car, label: event.has_parking ? "Parkering" : "Ingen parkering", has: !!event.has_parking },
  ];
  const releaseAt = event.tickets_release_at ? new Date(event.tickets_release_at) : null;
  const ticketState: "buy" | "soldOut" | "release" | null =
    event.is_sold_out ? "soldOut"
    : event.ticket_url && releaseAt && releaseAt > new Date() ? "release"
    : event.ticket_url ? "buy"
    : null;
  const hasAddress = !!(event.location || place);

  return (
    <View style={s.body}>
      {/* ── Var och när: fritt mot bakgrunden, tunna linjer emellan ── */}
      <View>
        {place ? (
          <InfoRow
            icon={place.logo_url
              ? <Image source={{ uri: place.logo_url }} style={s.logo} resizeMode="cover" />
              : <Store size={20} color={FG} strokeWidth={2} />}
            title={place.name}
            sub="Arrangör"
            onPress={onGoToPlace}
          />
        ) : websiteHost ? (
          <InfoRow
            icon={<Globe size={20} color={FG} strokeWidth={2} />}
            title={websiteHost}
            sub="Arrangörens webbplats"
            onPress={() => Linking.openURL(event.website_url!).catch(() => {})}
          />
        ) : null}
        <InfoRow
          icon={<CalendarDays size={20} color={FG} strokeWidth={2} />}
          title={dateLong(event)}
          sub={[event.time, relative].filter(Boolean).join("  ·  ") || null}
          subLive={relative === "I dag" || relative === "Pågår nu"}
          last={!hasAddress}
        />
        {hasAddress && (
          <InfoRow
            icon={<MapPin size={20} color={FG} strokeWidth={2} />}
            title={event.location ?? place!.name}
            sub="Visa på kartan"
            onPress={onOpenMaps}
            last
          />
        )}
      </View>

      {/* ── Fyra snabba fakta i en remsa, ifyllt av företaget ── */}
      <View style={s.strip}>
        {facts.map(({ Icon, label, has }, i) => (
          <View key={label} style={[s.stripItem, i > 0 && s.stripDivider]}>
            <Icon size={22} color={has ? GOLD_LT : "rgba(245,241,232,0.28)"} strokeWidth={1.8} />
            <Text style={[s.stripText, !has && s.stripTextOff]} numberOfLines={2}>{label}</Text>
          </View>
        ))}
      </View>

      {ticketState && (
        <PressableScale
          style={[s.ticketBtn, ticketState !== "buy" && s.ticketBtnOff]}
          scale={0.98}
          disabled={ticketState !== "buy"}
          onPress={() => event.ticket_url && Linking.openURL(event.ticket_url).catch(() => {})}
        >
          <Ticket size={18} color={ticketState === "buy" ? GOLD_LT : MUTED} strokeWidth={2.2} />
          <Text style={[s.ticketText, ticketState !== "buy" && { color: MUTED }]}>
            {ticketState === "buy" ? "Köp biljett"
              : ticketState === "soldOut" ? "Slutsålt"
              : `Biljettsläpp ${format(releaseAt!, "d MMM 'kl.' HH:mm", { locale: sv }).replace(".", "")}`}
          </Text>
        </PressableScale>
      )}

      {!!event.description && (
        <View style={{ marginTop: 30 }}>
          <Text style={s.sectionTitle}>Om evenemanget</Text>
          <Text style={s.aboutText}>{event.description.trim()}</Text>
        </View>
      )}
    </View>
  );
});

function InfoRow({ icon, title, sub, subLive, onPress, last }: {
  icon: React.ReactNode; title: string; sub?: string | null; subLive?: boolean; onPress?: () => void; last?: boolean;
}) {
  const content = (
    <View style={[s.row, !last && s.rowDivider]}>
      <View style={s.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
        {!!sub && <Text style={[s.rowSub, subLive && { color: "#FF8000" }]} numberOfLines={1}>{sub}</Text>}
      </View>
      {onPress && <ChevronRight size={18} color={MUTED} strokeWidth={2} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: "rgba(255,255,255,0.04)" }}>
      {content}
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.65)" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden",
    borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  handle: {
    position: "absolute", top: 10, alignSelf: "center", width: 40, height: 5, borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  heroDate: { position: "absolute", top: 22, right: 16 },
  heroText: { position: "absolute", left: 20, right: 16, bottom: 14, flexDirection: "row", alignItems: "flex-end", gap: 14 },
  shareBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  featured: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: GOLD },
  featuredText: { fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 1.4, color: BG },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 27, lineHeight: 33, letterSpacing: -0.4, color: "#FFFFFF" },

  body: { paddingHorizontal: 20, paddingTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.12)" },
  // Neutrala (vit på grått) — guldet sparas till faktaremsan och datumrutan
  rowIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF" },
  rowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 2 },

  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: FG, marginBottom: 14 },
  // Faktaremsan: fyra lika breda kolumner, ikon över ett eller två ord, tunna streck emellan
  strip: {
    flexDirection: "row", marginTop: 22, paddingVertical: 16, borderRadius: 20,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(197,160,89,0.22)",
  },
  // Mitt i höjdled: en kolumn med ett ord står mitt för grannarna med två rader
  stripItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 4 },
  stripDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(255,255,255,0.12)" },
  stripText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, lineHeight: 16, color: FG, textAlign: "center" },
  stripTextOff: { fontFamily: "Inter_500Medium", color: "rgba(245,241,232,0.4)" },

  ticketBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, marginTop: 22,
    borderRadius: 16, backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.45)",
  },
  ticketBtnOff: { backgroundColor: CARD, borderColor: "rgba(255,255,255,0.08)" },
  ticketText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: GOLD_LT },

  aboutText: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 23, color: "rgba(245,241,232,0.72)" },

  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingTop: 22,
  },
  calBtn: {
    height: 56, borderRadius: 28, backgroundColor: GOLD,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  calText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: BG },
  roundBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
});
