/**
 * Eventets panel — det enda sättet ett evenemang visas på (platser är sidor, evenemang är paneler).
 * Finns en gång i appens rot (EventSheetHost); sidorna öppnar den med openEvent() (lib/eventSheet).
 *
 * Uppifrån: bilden med rubriken och datumrutan (samma 30/OKT som på korten), en ruta med
 * arrangör, datum och tid, adress och Dela, faktarutorna (bokning/biljett, inomhus, mat & dryck,
 * parkering — bock eller kryss, ifyllt av företaget), Köp biljett om det finns en länk, och
 * beskrivningen. Längst ner, alltid synligt: Lägg till i kalender, spara (hjärtat) och stäng.
 *
 * Man stänger med krysset, genom att trycka bredvid, eller genom att dra ner panelen.
 */
import { useEffect, useRef, useState } from "react";
import {
  View, Text, Image, Pressable, StyleSheet, Modal, Linking, Platform, Share, useWindowDimensions,
} from "react-native";
import Reanimated, {
  Easing, interpolate, interpolateColor, runOnJS, useAnimatedScrollHandler, useAnimatedStyle,
  useReducedMotion, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import {
  CalendarCheck, CalendarDays, CalendarPlus, Car, Check, ChevronRight, Globe, Home, MapPin,
  Share2, Store, Ticket, UtensilsCrossed, X, type LucideIcon,
} from "lucide-react-native";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import type { Event } from "@/hooks/useEvents";
import { saveEventFavorite, useIsFavorite } from "@/hooks/useFavorites";
import { supabase } from "@/integrations/supabase/client";
import { useOnModalShown } from "@/hooks/useOnModalShown";
import { closeEvent, useEventSheetRequest, type EventSheetRequest } from "@/lib/eventSheet";
import { addEventToCalendar } from "@/lib/addToCalendar";
import { eventWhen, lastDay } from "@/lib/events";
import { DateBox } from "@/components/events/EventCards";
import { HeartButton, LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import { PressableScale } from "@/components/PressableScale";
import { Skeleton } from "@/components/Skeleton";

const BG = "#121212";
const CARD = "#1A1A1D";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const GOLD_LT = "#E8C674";
const GOLD_SOFT = "rgba(197,160,89,0.14)";
const YES = "#34D399";
const NO = "#F87171";
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;
/** Bottenradens höjd (knapparna + luft), så sista texten aldrig hamnar bakom den */
const BAR_H = 56 + 32;

type EventDetail = Event & {
  place?: { id: number; name: string; logo_url: string | null; lat: number | null; lng: number | null } | null;
};

function useEventDetail(id: number) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, place:places!events_place_id_fkey(id, name, logo_url, lat, lng)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as EventDetail;
    },
  });
}

/** Panelen finns en gång, i appens rot */
export function EventSheetHost() {
  const request = useEventSheetRequest();
  if (!request) return null;
  return <EventSheet key={request.key} request={request} />;
}

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

function EventSheet({ request }: { request: EventSheetRequest }) {
  const { height: winH, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const sheetH = Math.round(winH * 0.93);
  const heroH = Math.round(width * 0.78);

  const { data: fetched } = useEventDetail(request.id);
  const event: EventDetail | null = fetched ?? (request.event as EventDetail | undefined) ?? null;
  const place = fetched?.place ?? null;
  const placeName = place?.name ?? request.event?.place?.name ?? null;

  // ── Spara: ändras direkt i panelen. Har sidan som öppnade den ett eget sparat-läge (Kalender,
  // Favoriter) får den veta; annars sparar panelen själv och resten av appen uppdateras när den stängs
  const savedInCache = useIsFavorite(undefined, request.id);
  const [saved, setSaved] = useState(request.saved ?? savedInCache);
  const savedDirty = useRef(false);
  const { burst, show: showBurst } = useLikeBurst();
  const toggleSave = () => {
    const next = !saved;
    setSaved(next);
    if (request.onToggleSave) { request.onToggleSave(request.id); return; }
    savedDirty.current = true;
    saveEventFavorite(request.id, next).catch(() => setSaved(!next));
  };

  // ── Öppna / stäng ──
  const translateY = useSharedValue(sheetH);
  const backdrop = useSharedValue(0);
  const onShow = useOnModalShown(() => {
    backdrop.value = withTiming(1, { duration: reduceMotion ? 0 : 260 });
    translateY.value = reduceMotion ? 0 : withSpring(0, { damping: 30, stiffness: 300, mass: 0.8 });
  });
  const afterClose = useRef<(() => void) | null>(null);
  const finish = () => {
    closeEvent();
    if (savedDirty.current) queryClient.invalidateQueries({ queryKey: ["favorites"] });
    afterClose.current?.();
  };
  const close = (then?: () => void) => {
    afterClose.current = then ?? null;
    backdrop.value = withTiming(0, { duration: reduceMotion ? 0 : 220 });
    translateY.value = withTiming(sheetH, { duration: reduceMotion ? 0 : 240, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(finish)();
    });
  };

  // Krysset: blir rött och vrider sig ett halvt varv, sen glider panelen ner
  const xAnim = useSharedValue(0);
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
  const scrollY = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  const settle = (velocityY: number) => {
    "worklet";
    if (translateY.value > CLOSE_DISTANCE || (velocityY > CLOSE_VELOCITY && translateY.value > 0)) {
      backdrop.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(sheetH, { duration: 220 }, (done) => {
        if (done) runOnJS(finish)();
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

  // ── Handlingar ──
  const goToPlace = () => {
    if (!place) return;
    close(() => router.push(`/place/${place.id}` as any));
  };
  const openMaps = () => {
    if (!event?.location && !place) return;
    const label = event?.location ?? place?.name ?? "";
    const hasCoords = place?.lat != null && place?.lng != null;
    const url = Platform.OS === "ios"
      ? `maps://?q=${encodeURIComponent(label)}${hasCoords ? `&ll=${place!.lat},${place!.lng}` : `, Österlen`}`
      : hasCoords
        ? `geo:${place!.lat},${place!.lng}?q=${place!.lat},${place!.lng}(${encodeURIComponent(label)})`
        : `geo:0,0?q=${encodeURIComponent(`${label}, Österlen`)}`;
    Linking.openURL(url).catch(() => {});
  };
  const share = () => {
    if (!event) return;
    const link = event.ticket_url ?? event.website_url;
    const lines = [
      "Följ med?",
      event.title,
      [eventWhen(event), event.location ?? placeName].filter(Boolean).join(" · "),
      link,
      "",
      "Hittat i Österlenappen",
    ].filter((l) => l !== null && l !== undefined) as string[];
    Share.share({ message: lines.join("\n") }).catch(() => {});
  };
  const addToCalendar = () => {
    if (!event) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    addEventToCalendar(event, event.location ?? placeName).catch(() => {});
  };

  const websiteHost = event?.website_url
    ? event.website_url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    : null;
  const relative = event ? relativeDay(event) : null;
  const facts: { Icon: LucideIcon; label: string; yes: boolean }[] = event ? [
    event.booking_required
      ? { Icon: CalendarCheck, label: "Bokning krävs", yes: true }
      : { Icon: Ticket, label: "Biljett krävs", yes: !!event.tickets_required },
    { Icon: Home, label: "Inomhus", yes: !!event.is_indoor },
    { Icon: UtensilsCrossed, label: "Mat & dryck", yes: !!event.has_food_drink },
    { Icon: Car, label: "Parkering", yes: !!event.has_parking },
  ] : [];
  const releaseAt = event?.tickets_release_at ? new Date(event.tickets_release_at) : null;
  const ticketState: "buy" | "soldOut" | "release" | null = !event ? null
    : event.is_sold_out ? "soldOut"
    : event.ticket_url && releaseAt && releaseAt > new Date() ? "release"
    : event.ticket_url ? "buy"
    : null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onShow={onShow} onRequestClose={() => close()}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
        </Reanimated.View>

        <Reanimated.View style={[s.sheet, { height: sheetH }, sheetStyle]}>
          <GestureDetector gesture={pan}>
            <View style={{ flex: 1 }}>
              <GestureDetector gesture={nativeScroll}>
                <Reanimated.ScrollView
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                  bounces={false}
                  overScrollMode="never"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: BAR_H + insets.bottom + 24 }}
                >
                  {/* ── Bilden, rubriken och datumrutan ── */}
                  <View style={{ height: heroH }}>
                    {event?.image_url
                      ? <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#2A2A2A" }]} />}
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
                    {event && <DateBox event={event} style={s.heroDate} />}
                    <View style={s.heroText}>
                      {event?.is_featured && (
                        <View style={s.featured}>
                          <Text style={s.featuredText}>UTVALT</Text>
                        </View>
                      )}
                      {event
                        ? <Text style={s.title} numberOfLines={3}>{event.title}</Text>
                        : <Skeleton tone="dark" width="70%" height={28} radius={8} />}
                    </View>
                  </View>

                  {!event ? (
                    <View style={s.body} pointerEvents="none">
                      <Skeleton tone="dark" height={220} radius={20} />
                    </View>
                  ) : (
                    <View style={s.body}>
                      {/* ── Var och när ── */}
                      <View style={s.infoCard}>
                        {place ? (
                          <InfoRow
                            icon={place.logo_url
                              ? <Image source={{ uri: place.logo_url }} style={s.logo} resizeMode="cover" />
                              : <Store size={20} color={GOLD} strokeWidth={2} />}
                            title={place.name}
                            sub="Arrangör"
                            onPress={goToPlace}
                          />
                        ) : websiteHost ? (
                          <InfoRow
                            icon={<Globe size={20} color={GOLD} strokeWidth={2} />}
                            title={websiteHost}
                            sub="Arrangörens webbplats"
                            onPress={() => Linking.openURL(event.website_url!).catch(() => {})}
                          />
                        ) : null}
                        <InfoRow
                          icon={<CalendarDays size={20} color={GOLD} strokeWidth={2} />}
                          title={dateLong(event)}
                          sub={[event.time, relative].filter(Boolean).join("  ·  ") || null}
                          subLive={relative === "I dag" || relative === "Pågår nu"}
                        />
                        {(event.location || place) && (
                          <InfoRow
                            icon={<MapPin size={20} color={GOLD} strokeWidth={2} />}
                            title={event.location ?? place!.name}
                            sub="Visa på kartan"
                            onPress={openMaps}
                          />
                        )}
                        <InfoRow
                          icon={<Share2 size={19} color={GOLD} strokeWidth={2} />}
                          title="Dela med en vän"
                          onPress={share}
                          last
                        />
                      </View>

                      {/* ── Bra att veta: bock eller kryss, ifyllt av företaget ── */}
                      <View style={s.facts}>
                        {facts.map(({ Icon, label, yes }) => (
                          <View key={label} style={[s.fact, { width: (width - 40 - 10) / 2 }]}>
                            <Icon size={18} color={GOLD} strokeWidth={2.2} />
                            <Text style={s.factText} numberOfLines={1}>{label}</Text>
                            <View style={[s.status, { backgroundColor: yes ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.20)" }]}>
                              {yes
                                ? <Check size={13} color={YES} strokeWidth={3.4} />
                                : <X size={13} color={NO} strokeWidth={3.4} />}
                            </View>
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
                        <View style={{ marginTop: 28 }}>
                          <Text style={s.aboutTitle}>Om evenemanget</Text>
                          <Text style={s.aboutText}>{event.description.trim()}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </Reanimated.ScrollView>
              </GestureDetector>
            </View>
          </GestureDetector>

          {/* ── Alltid synligt längst ner: kalender, spara, stäng ── */}
          <View style={[s.bar, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Rect x={0} y={0} width={width} height={BAR_H + insets.bottom + 40}>
                <LinearGradient start={vec(0, 0)} end={vec(0, 28)} colors={["rgba(18,18,18,0)", BG]} />
              </Rect>
            </Canvas>
            <PressableScale style={s.calBtn} scale={0.97} onPress={addToCalendar} disabled={!event}>
              <CalendarPlus size={20} color={BG} strokeWidth={2} />
              <Text style={s.calText}>Lägg till i kalender</Text>
            </PressableScale>
            <View style={s.roundBtn}>
              <HeartButton isFav={saved} onToggle={toggleSave} onBurst={showBurst} size={22} label="sparade" />
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
      </GestureHandlerRootView>
    </Modal>
  );
}

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
  heroText: { position: "absolute", left: 20, right: 20, bottom: 14, gap: 10, alignItems: "flex-start" },
  featured: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: GOLD },
  featuredText: { fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 1.4, color: BG },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 27, lineHeight: 33, letterSpacing: -0.4, color: "#FFFFFF" },

  body: { paddingHorizontal: 20, paddingTop: 10 },
  infoCard: { borderRadius: 20, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  rowIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: GOLD_SOFT, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF" },
  rowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 2 },

  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  fact: {
    flexDirection: "row", alignItems: "center", gap: 10, height: 52, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(197,160,89,0.18)",
  },
  factText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: FG },
  status: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  ticketBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, marginTop: 14,
    borderRadius: 16, backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.45)",
  },
  ticketBtnOff: { backgroundColor: CARD, borderColor: "rgba(255,255,255,0.08)" },
  ticketText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: GOLD_LT },

  aboutTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: FG, marginBottom: 10 },
  aboutText: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 23, color: "rgba(245,241,232,0.72)" },

  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 20, paddingTop: 22,
  },
  calBtn: {
    flex: 1, height: 56, borderRadius: 28, backgroundColor: GOLD,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  calText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: BG },
  roundBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
});
