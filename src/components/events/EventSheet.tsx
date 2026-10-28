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
 * - Den glider upp först när det nya innehållet är helt klart (bilderna laddade, texten utlagd) OCH
 *   minst MIN_WAIT_MS gått sen trycket — telefonen behöver den stunden för att rita klart allt nytt.
 *   Att starta tidigare (så fort bilderna var klara) hackade varje gång; Österlen Lyser, vars bild
 *   tog en stund att ladda, var det enda eventet som var smooth — så nu väntar alla lika länge.
 *   Högst MAX_WAIT_MS; hinner eventets bild inte bli klar tonar den in.
 * - Gesterna byggs en gång, inte om vid varje öppning.
 * - Panelen byggs när appen startat klart (useAppSettled), inte under den tunga starten.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/i18n/dates";
import { fetchEvents, type Event } from "@/hooks/useEvents";
import { saveEventFavorite } from "@/hooks/useFavorites";
import { useEventSheetRequest, type EventSheetRequest } from "@/lib/eventSheet";
import { addEventToCalendar } from "@/lib/addToCalendar";
import { eventWhen, lastDay } from "@/lib/events";
import { useAppSettled } from "@/lib/appSettled";
import { DateBox } from "@/components/events/EventCards";
import { withAlpha } from "@/theme/categories";
import { HeartButton, LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import { PressableScale } from "@/components/PressableScale";
import { ShareIcon } from "@/components/ShareIcon";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;
/** Bottenradens höjd (knapparna + luft), så sista texten aldrig hamnar bakom den */
const BAR_H = 56 + 32;
/** Minsta och längsta stund mellan tryck och att panelen börjar glida upp */
const MIN_WAIT_MS = 200;
const MAX_WAIT_MS = 400;

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
    return `${formatDate(start, sameMonth ? "d" : "d MMMM")}${sameMonth && i18n.language === "de" ? "." : ""} – ${formatDate(end, "d MMMM yyyy")}`;
  }
  return cap(formatDate(start, i18n.language === "de" ? "EEEE, d MMMM yyyy" : "EEEE d MMMM yyyy"));
}

/** "I dag", "I morgon", "Om 4 dagar", "Pågår nu", "Har varit". live = i dag eller pågår (orange) */
function relativeDay(e: Event): { text: string; live: boolean } | null {
  if (!e.date) return null;
  const now = new Date();
  const toStart = differenceInCalendarDays(parseISO(e.date), now);
  const toEnd = differenceInCalendarDays(parseISO(lastDay(e) ?? e.date), now);
  if (toEnd < 0) return { text: i18n.t("calendar.sheet.past"), live: false };
  if (toStart < 0) return { text: i18n.t("calendar.sheet.ongoing"), live: true };
  if (toStart === 0) return { text: i18n.t("calendar.sheet.today"), live: true };
  if (toStart === 1) return { text: i18n.t("calendar.sheet.tomorrow"), live: false };
  if (toStart <= 13) return { text: i18n.t("calendar.sheet.inDays", { count: toStart }), live: false };
  return null;
}

export function EventSheetHost() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { height: winH, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const settled = useAppSettled();
  const request = useEventSheetRequest();
  const { t } = useTranslation();
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
  // Hur många delar av det nya innehållet som inte är klara än: bilderna (eventets bild, arrangörens
  // logga) och texten under bilden (klar när den lagts ut och mätts)
  const partsLeft = useRef(0);
  const minWaitDone = useRef(false);

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
      // Före bytet: en bild som redan finns i minnet kan bli klar innan effekterna efter bytet ens
      // körts — då måste panelen redan veta hur många bilder den väntar på (annars trodde den att
      // allt var klart, gled upp direkt och nästa bild blev klar mitt i rörelsen)
      partsLeft.current = (event.image_url ? 1 : 0) + (event.place?.logo_url ? 1 : 0) + 1;
      minWaitDone.current = false;
      openKey.value = request.key;
      xAnim.value = 0;
      scrollY.value = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setShown({ request, event });
      setActive(true);
    })();
    return () => { cancelled = true; };
  }, [request, queryClient, openKey, xAnim, scrollY]);


  const slideIn = useCallback((key: number) => {
    if (startedKey.current === key || shownRef.current?.request.key !== key) return;
    startedKey.current = key;
    backdrop.value = withTiming(1, { duration: reduceMotion ? 0 : 260 });
    translateY.value = reduceMotion ? 0 : withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
  }, [reduceMotion, backdrop, translateY]);

  // Glid upp när allt är klart och den minsta stunden gått — eller när den längsta gått ut
  const tryStart = useCallback((key: number) => {
    if (partsLeft.current <= 0 && minWaitDone.current) requestAnimationFrame(() => slideIn(key));
  }, [slideIn]);
  useEffect(() => {
    if (!shown) return;
    const key = shown.request.key;
    const min = setTimeout(() => { minWaitDone.current = true; tryStart(key); }, MIN_WAIT_MS);
    const max = setTimeout(() => slideIn(key), MAX_WAIT_MS);
    return () => { clearTimeout(min); clearTimeout(max); };
  }, [shown, slideIn, tryStart]);
  /** En del av det nya innehållet är klar. Svarar om panelen redan glider (då ska en bild tona in) */
  const onPartReady = useCallback((key: number) => {
    if (key !== shownRef.current?.request.key) return false;
    const sliding = startedKey.current === key;
    partsLeft.current -= 1;
    if (!sliding) tryStart(key);
    return sliding;
  }, [tryStart]);

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
    backgroundColor: interpolateColor(xAnim.value, [0, 1], [colors.card, "rgba(220,38,38,0.75)"]),
  }));
  const xIconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${xAnim.value * 180}deg` }] }));

  // ── Dra ner för att stänga: från bilden direkt, från texten när den är uppscrollad ──
  const dragOffset = useSharedValue(0);
  const { nativeScroll, pan } = useMemo(() => {
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
    const native = Gesture.Native();
    const drag = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-14, 14])
      .simultaneousWithExternalGesture(native)
      .onStart(() => { dragOffset.value = 0; })
      .onUpdate((e) => {
        // Så länge texten är nedscrollad är det texten som rör sig; panelen följer först vid toppen
        if (scrollY.value > 0.5) { dragOffset.value = e.translationY; return; }
        translateY.value = Math.max(0, e.translationY - dragOffset.value);
      })
      .onEnd((e) => settle(e.velocityY));
    return { nativeScroll: native, pan: drag };
  }, [sheetH, onClosed, translateY, backdrop, openKey, dragOffset, scrollY]);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * interpolate(translateY.value, [0, sheetH], [1, 0.2]),
  }));

  // ── Handlingar (stabila, så innehållet inte ritas om i onödan) ──
  const goToPlace = useCallback(() => {
    const id = shownRef.current?.event.place?.id;
    if (id != null) close(() => router.push(`/place/${id}?from=event`));
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
      i18n.t("calendar.sheet.shareInvite"),
      e.title,
      [eventWhen(e), e.location ?? e.place?.name].filter(Boolean).join(" · "),
      link,
      "",
      i18n.t("calendar.sheet.shareFooter"),
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
                  {shown && (
                    <HeroImage
                      key={shown.request.key}
                      uri={shown.event.image_url}
                      onReady={() => onPartReady(shown.request.key)}
                    />
                  )}
                  {/* Riktig mjuk toning ner i panelens bakgrund, så rubriken ligger på mörkret */}
                  <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Rect x={0} y={0} width={width} height={heroH}>
                      <LinearGradient
                        start={vec(0, heroH * 0.35)}
                        end={vec(0, heroH)}
                        colors={[withAlpha(colors.bg, 0), withAlpha(colors.bg, 0.72), colors.bg]}
                        positions={[0, 0.6, 1]}
                      />
                    </Rect>
                  </Canvas>
                  <View style={s.handle} />
                  {event && <HeroText event={event} onShare={share} />}
                </View>
                {shown && (
                  <SheetBody
                    key={shown.request.key}
                    event={shown.event}
                    openKey={shown.request.key}
                    onGoToPlace={goToPlace}
                    onOpenMaps={openMaps}
                    onPartReady={onPartReady}
                  />
                )}
              </Reanimated.ScrollView>
            </GestureDetector>
          </View>
        </GestureDetector>

        {/* ── Alltid synligt längst ner: kalender, spara, stäng ── */}
        <View style={[s.bar, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
          {/* Tona i bakgrundens färg: helt genomskinlig överst, aldrig helt täckande — man ser texten bakom */}
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Rect x={0} y={0} width={width} height={BAR_H + insets.bottom + 40}>
              <LinearGradient start={vec(0, 0)} end={vec(0, BAR_H + insets.bottom + 22)} colors={[withAlpha(colors.bg, 0), withAlpha(colors.bg, 0.7), withAlpha(colors.bg, 0.97)]} positions={[0, 0.45, 1]} />
            </Rect>
          </Canvas>
          {/* Egen behållare som växer: PressableScale lägger stilen på sitt inre lager, så flex: 1
              där fick aldrig knappen att ta platsen */}
          <View style={{ flex: 1 }}>
            <PressableScale style={s.calBtn} scale={0.97} onPress={addToCalendar}>
              <CalendarPlus size={20} color={colors.onGold} strokeWidth={2} />
              <Text style={s.calText}>{t("calendar.sheet.addToCalendar")}</Text>
            </PressableScale>
          </View>
          <View style={s.roundBtn}>
            {/* Nytt hjärta för varje event, så det inte tonar från förra eventets läge */}
            <HeartButton key={shown?.request.key ?? 0} isFav={saved} onToggle={toggleSave} onBurst={showBurst} size={22} list="saved" />
          </View>
          <Pressable onPress={pressX} hitSlop={6} accessibilityLabel={t("calendar.sheet.close")}>
            <Reanimated.View style={[s.roundBtn, xBtnStyle]}>
              <Reanimated.View style={xIconStyle}>
                <X size={20} color={colors.text} strokeWidth={2} />
              </Reanimated.View>
            </Reanimated.View>
          </Pressable>
        </View>
      </Reanimated.View>

      <LikeBurst burst={burst} />
    </View>
  );
}

/** Eventets bild. Klar innan panelen börjar glida: syns direkt. Klar först under rörelsen: tonar in */
function HeroImage({ uri, onReady }: { uri: string | null; onReady: () => boolean }) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const loaded = () => {
    opacity.value = onReady() ? withTiming(1, { duration: 220 }) : 1;
  };
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.fill }]}>
      {uri && (
        <Reanimated.View style={[StyleSheet.absoluteFill, fade]}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={loaded}
            onError={loaded}
          />
        </Reanimated.View>
      )}
    </View>
  );
}

const HeroText = memo(function HeroText({ event, onShare }: { event: Event; onShare: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { t } = useTranslation();
  return (
    <>
      <DateBox event={event} style={s.heroDate} />
      <View style={s.heroText}>
        <View style={{ flex: 1, gap: 10, alignItems: "flex-start" }}>
          {event.is_featured && (
            <View style={s.featured}>
              <Text style={s.featuredText}>{t("calendar.sheet.featured")}</Text>
            </View>
          )}
          <Text style={s.title} numberOfLines={3}>{event.title}</Text>
        </View>
        <PressableScale style={s.shareBtn} scale={0.9} onPress={onShare} accessibilityLabel={t("calendar.sheet.share")}>
          <ShareIcon size={19} color={colors.text} strokeWidth={2} />
        </PressableScale>
      </View>
    </>
  );
});

/** Allt under bilden. Ritas bara om när eventet byts */
const SheetBody = memo(function SheetBody({ event, openKey, onGoToPlace, onOpenMaps, onPartReady }: {
  event: Event;
  /** Öppningen — texten och loggan byggs om för varje, så panelen alltid får veta när de är klara */
  openKey: number;
  onGoToPlace: () => void;
  onOpenMaps: () => void;
  onPartReady: (key: number) => boolean;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const place = event.place ?? null;
  const websiteHost = event.website_url
    ? event.website_url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : null;
  const relative = relativeDay(event);

  // Fyra snabba fakta, varje sak sagd i klartext. Det som saknas står kvar, nedtonat
  const facts: { Icon: LucideIcon; label: string; has: boolean }[] = [
    event.booking_required
      ? { Icon: CalendarCheck, label: t("calendar.sheet.booking"), has: true }
      : event.tickets_required
        ? { Icon: Ticket, label: t("calendar.sheet.ticket"), has: true }
        : { Icon: Ticket, label: t("calendar.sheet.free"), has: true },
    event.is_indoor
      ? { Icon: Home, label: t("calendar.sheet.indoor"), has: true }
      : { Icon: Sun, label: t("calendar.sheet.outdoor"), has: true },
    { Icon: UtensilsCrossed, label: t(event.has_food_drink ? "calendar.sheet.food" : "calendar.sheet.noFood"), has: !!event.has_food_drink },
    { Icon: Car, label: t(event.has_parking ? "calendar.sheet.parking" : "calendar.sheet.noParking"), has: !!event.has_parking },
  ];
  const releaseAt = event.tickets_release_at ? new Date(event.tickets_release_at) : null;
  const ticketState: "buy" | "soldOut" | "release" | null =
    event.is_sold_out ? "soldOut"
    : event.ticket_url && releaseAt && releaseAt > new Date() ? "release"
    : event.ticket_url ? "buy"
    : null;
  const hasAddress = !!(event.location || place);

  return (
    // Utlagd och mätt (en ny för varje öppning, se key) — en av delarna panelen väntar på
    <View style={s.body} onLayout={() => onPartReady(openKey)}>
      {/* ── Var och när: fritt mot bakgrunden, tunna linjer emellan ── */}
      <View>
        {place ? (
          <InfoRow
            icon={place.logo_url
              ? (
                <Image
                  source={{ uri: place.logo_url }}
                  style={s.logo}
                  resizeMode="cover"
                  onLoad={() => onPartReady(openKey)}
                  onError={() => onPartReady(openKey)}
                />
              )
              : <Store size={20} color={colors.text} strokeWidth={2} />}
            title={place.name}
            sub={t("calendar.sheet.organizer")}
            onPress={onGoToPlace}
          />
        ) : websiteHost ? (
          <InfoRow
            icon={<Globe size={20} color={colors.text} strokeWidth={2} />}
            title={websiteHost}
            sub={t("calendar.sheet.organizerSite")}
            onPress={() => Linking.openURL(event.website_url!).catch(() => {})}
          />
        ) : null}
        <InfoRow
          icon={<CalendarDays size={20} color={colors.text} strokeWidth={2} />}
          title={dateLong(event)}
          sub={[event.time, relative?.text].filter(Boolean).join("  ·  ") || null}
          subLive={relative?.live}
          last={!hasAddress}
        />
        {hasAddress && (
          <InfoRow
            icon={<MapPin size={20} color={colors.text} strokeWidth={2} />}
            title={event.location ?? place!.name}
            sub={t("calendar.sheet.showOnMap")}
            onPress={onOpenMaps}
            last
          />
        )}
      </View>

      {/* ── Fyra snabba fakta i en remsa, ifyllt av företaget ── */}
      <View style={s.strip}>
        {facts.map(({ Icon, label, has }, i) => (
          <View key={label} style={[s.stripItem, i > 0 && s.stripDivider]}>
            <Icon size={22} color={has ? colors.goldText : colors.faint} strokeWidth={1.8} />
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
          <Ticket size={18} color={ticketState === "buy" ? colors.goldText : colors.muted} strokeWidth={2.2} />
          <Text style={[s.ticketText, ticketState !== "buy" && { color: colors.muted }]}>
            {ticketState === "buy" ? t("calendar.sheet.buy")
              : ticketState === "soldOut" ? t("calendar.sheet.soldOut")
              : t("calendar.sheet.release", { date: formatDate(releaseAt!, "d MMM").replace(/\./g, ""), time: format(releaseAt!, "HH:mm") })}
          </Text>
        </PressableScale>
      )}

      {!!event.description && (
        <View style={{ marginTop: 30 }}>
          <Text style={s.sectionTitle}>{t("calendar.sheet.about")}</Text>
          <Text style={s.aboutText}>{event.description.trim()}</Text>
        </View>
      )}
    </View>
  );
});

function InfoRow({ icon, title, sub, subLive, onPress, last }: {
  icon: React.ReactNode; title: string; sub?: string | null; subLive?: boolean; onPress?: () => void; last?: boolean;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const content = (
    <View style={[s.row, !last && s.rowDivider]}>
      <View style={s.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
        {!!sub && <Text style={[s.rowSub, subLive && { color: "#FF8000" }]} numberOfLines={1}>{sub}</Text>}
      </View>
      {onPress && <ChevronRight size={18} color={colors.muted} strokeWidth={2} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: colors.fill }}>
      {content}
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  backdrop: { backgroundColor: c.overlay },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.bg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden",
    borderTopWidth: 1, borderColor: c.border,
  },
  handle: {
    position: "absolute", top: 10, alignSelf: "center", width: 40, height: 5, borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  heroDate: { position: "absolute", top: 22, right: 16 },
  heroText: { position: "absolute", left: 20, right: 16, bottom: 14, flexDirection: "row", alignItems: "flex-end", gap: 14 },
  shareBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: c.card, borderWidth: 1, borderColor: c.borderStrong,
  },
  featured: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.gold },
  featuredText: { fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 1.4, color: c.onGold },
  // Ligger där bilden tonat ut i panelens bakgrund: temats textfärg
  title: { fontFamily: "Montserrat_700Bold", fontSize: 27, lineHeight: 33, letterSpacing: -0.4, color: c.text },

  body: { paddingHorizontal: 20, paddingTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderStrong },
  // Neutrala (vit på grått) — guldet sparas till faktaremsan och datumrutan
  rowIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.fill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF" },
  rowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 2 },

  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: c.text, marginBottom: 14 },
  // Faktaremsan: fyra lika breda kolumner, ikon över ett eller två ord, tunna streck emellan
  strip: {
    flexDirection: "row", marginTop: 22, paddingVertical: 16, borderRadius: 20,
    backgroundColor: c.card, borderWidth: 0.5, borderColor: c.goldBorder,
  },
  // Mitt i höjdled: en kolumn med ett ord står mitt för grannarna med två rader
  stripItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 4 },
  stripDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.borderStrong },
  stripText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, lineHeight: 16, color: c.text, textAlign: "center" },
  stripTextOff: { fontFamily: "Inter_500Medium", color: c.faint },

  ticketBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, marginTop: 22,
    borderRadius: 16, backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.goldBorder,
  },
  ticketBtnOff: { backgroundColor: c.card, borderColor: c.border },
  ticketText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.goldText },

  aboutText: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 23, color: c.muted },

  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingTop: 22,
  },
  calBtn: {
    height: 56, borderRadius: 28, backgroundColor: c.gold,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  calText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.onGold },
  roundBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: c.card, borderWidth: 1, borderColor: c.borderStrong,
  },
});
