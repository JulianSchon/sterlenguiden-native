/**
 * Ett erbjudande som biljett: sidoband i kategorins färg (med perforering), bilden med rabatten
 * stort i guld, platsens namn och loggan. Samma biljett på Förmåner och på platssidan.
 *
 * Trycker man på biljetten mäts sidobandets plats på skärmen, och OfferDrawer river loss bandet
 * därifrån (se OfferDrawer). Medan panelen är öppen är bandet bortrivet och biljetten visar den vita,
 * hackiga rivkanten som följer panelens (edge). Bandet göms i samma bildruta som panelens band
 * börjar röra sig (edge.active), inte när man trycker.
 *
 * Bara ett riktigt tryck öppnar: rör sig fingret mer än några punkter är det en scroll, och rör
 * man en lista som fortfarande glider (för att stoppa den) räknas det inte heller (scrollAt).
 */
import { memo, useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Reanimated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check, Clock, Crown } from "lucide-react-native";
import { Canvas, Fill, LinearGradient, Line, Path, DashPathEffect, vec } from "@shopify/react-native-skia";
import { offerSavingsLabel, splitSavings, type Offer } from "@/lib/offers";
import type { OriginRect, TearEdge } from "./OfferDrawer";
import { tornEdgeLine, tornCutRegion, TEAR_DEPTH, EDGE_STROKE } from "./tear";
import { findCategory, ticketColors } from "@/theme/categories";
import { formatDate } from "@/i18n/dates";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// Måtten måste stämma med OfferDrawer (bandet som rivs loss har samma mått)
export const TICKET_H = 190;
const STUB_W = 58;
const NOTCH = 28;
// Loggans plats uppe till höger (samma som logoWrap) och hur nära man får trycka
const LOGO = 34;
const LOGO_TOP = 10;
const LOGO_RIGHT = 12;
const LOGO_SLOP = 8;
const BLEED = 6;

// ── Bilden till pappersbitarna ──
// Läses in så fort fingret nuddar en biljett. Hålls här (inte i sidans state) så att bara panelen
// ritas om — att rita om hela sidan vid varje nudd gjorde scrollen trög.
let armedImage: string | null = null;
const armedListeners = new Set<() => void>();

function armTicketImage(url: string | null) {
  if (url === armedImage) return;
  armedImage = url;
  armedListeners.forEach((l) => l());
}

/** Biljettbilden som senast nuddades (OfferDrawer läser in den i Skia) */
export function useArmedTicketImage(): string | null {
  return useSyncExternalStore(
    (l) => { armedListeners.add(l); return () => { armedListeners.delete(l); }; },
    () => armedImage,
  );
}

/** Så länge efter en scrollrörelse ett nudd räknas som att stoppa listan, inte som ett tryck */
const SCROLL_SETTLE_MS = 140;

const DAY_MS = 86_400_000;
const SOON_MS = 3 * DAY_MS;

/** Snart-slut och nytt är de enda etiketterna som säger något sant och användbart */
function offerBadge(offer: Offer, used: boolean): "redeemed" | "endingSoon" | "new" | null {
  if (used) return "redeemed";
  if (offer.expires_at) {
    const left = new Date(offer.expires_at).getTime() - Date.now();
    if (left > 0 && left <= SOON_MS) return "endingSoon";
  }
  if (Date.now() - new Date(offer.created_at).getTime() <= SOON_MS) return "new";
  return null;
}

/** Lodrät toning över hela biljettens höjd (den är fast, så Skia behöver inte mäta något) */
function VerticalGradient({ colors }: { colors: string[] }) {
  return (
    // Ritytan sticker ut förbi kanten (klipps av biljettens form) så ingen remsa blir kvar längst ner
    <Canvas style={{ position: "absolute", left: 0, right: 0, top: -BLEED, bottom: -BLEED }} pointerEvents="none">
      <Fill>
        <LinearGradient start={vec(0, BLEED)} end={vec(0, BLEED + TICKET_H)} colors={colors} />
      </Fill>
    </Canvas>
  );
}

/** Perforerad linje mellan sidobandet och bilden */
function Perforation() {
  return (
    <Canvas style={{ position: "absolute", left: STUB_W - 1, top: 0, width: 2, height: TICKET_H }} pointerEvents="none">
      <Line p1={vec(1, NOTCH / 2)} p2={vec(1, TICKET_H - NOTCH / 2)} color="rgba(255,255,255,0.55)" style="stroke" strokeWidth={1.5}>
        <DashPathEffect intervals={[3, 5]} />
      </Line>
    </Canvas>
  );
}

/** Ritas bara om när den egna biljetten ändras (inte när sidan runt den gör det) */
export const OfferTicket = memo(function OfferTicket({
  offer, used, torn, edge, scrollAt, linkPlace = true, onOpen,
}: {
  offer: Offer;
  used: boolean;
  /** Det här är biljetten som är öppen (bandet rivs eller är bortrivet) */
  torn: boolean;
  edge: TearEdge;
  /** När sidan senast scrollade (Date.now(), sätts av sidans scroll) */
  scrollAt?: SharedValue<number>;
  /** Loggan öppnar platssidan — av när man redan står på den */
  linkPlace?: boolean;
  onOpen: (offer: Offer, origin: OriginRect | null) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const imageUrl = offer.image_url ?? offer.place?.logo_url ?? null;
  const badge = offerBadge(offer, used);
  const savings = offerSavingsLabel(offer);
  const parts = savings ? splitSavings(savings) : null;
  const category = findCategory(offer.category);
  const CategoryIcon = category?.icon ?? Crown;
  const [from, to] = ticketColors(offer.category);
  const stubRef = useRef<View>(null);
  // Biljettens rivkant följer panelens (samma tal som bandet ritas med)
  const edgePath = useDerivedValue(() => tornEdgeLine(TICKET_H, edge.amt.value, edge.prog.value));
  const cutPath = useDerivedValue(() => tornCutRegion(TICKET_H, edge.amt.value, edge.prog.value));

  // Mät sidobandets plats på skärmen så panelen kan riva loss det därifrån
  const open = useCallback(() => {
    if (!stubRef.current) return onOpen(offer, null);
    stubRef.current.measureInWindow((x, y, w, h) => onOpen(offer, { x, y, w, h }));
  }, [offer, onOpen]);
  const arm = useCallback(() => armTicketImage(imageUrl), [imageUrl]);
  const openPlace = useCallback(() => router.push(`/place/${offer.place_id}` as never), [router, offer.place_id]);

  // Ett tryck: fingret får inte röra sig mer än 10 punkter, och listan får inte ha glidit nyss. Trycket
  // på loggan (uppe till höger, med lite marginal) öppnar platssidan i stället för erbjudandet
  const width = useSharedValue(0);
  const logoTap = linkPlace && !!offer.place?.logo_url;
  const stillScrolling = useSharedValue(false);
  const tap = useMemo(() => Gesture.Tap()
    .maxDistance(10)
    .onBegin(() => {
      stillScrolling.value = scrollAt ? Date.now() - scrollAt.value < SCROLL_SETTLE_MS : false;
      runOnJS(arm)();
    })
    .onEnd((e, success) => {
      if (!success || stillScrolling.value) return;
      const onLogo = logoTap && e.y <= LOGO_TOP + LOGO + LOGO_SLOP && e.x >= width.value - LOGO_RIGHT - LOGO - LOGO_SLOP;
      runOnJS(onLogo ? openPlace : open)();
    }), [arm, open, openPlace, logoTap, scrollAt, stillScrolling, width]);

  // Bandet göms och skuggan försvinner först när panelens band faktiskt börjat röra sig
  // Under biljetten: sidans egen färg (syns aldrig, men en hel bakgrund gör att skuggan räknas ut en
  // gång i stället för vid varje bildruta när man scrollar)
  const ticketStyle = useAnimatedStyle(() => {
    const gone = torn && edge.active.value === 1;
    return { shadowOpacity: gone ? 0 : 0.28, elevation: gone ? 0 : 6, backgroundColor: gone ? "transparent" : colors.bg };
  });
  const stubStyle = useAnimatedStyle(() => ({ opacity: torn && edge.active.value === 1 ? 0 : 1 }));

  return (
    // Yttre lagret bär skuggan, det inre klipper bilden till biljettens form (overflow: hidden tar bort skuggor).
    // Ingen tryck-skala: bandets mått mäts vid tryck, och en förminskad biljett gav ett band som var för litet
    <GestureDetector gesture={tap}>
    <Reanimated.View
      style={[s.ticket, used && s.ticketUsed, ticketStyle]}
      onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
    >
      <View style={[s.ticketClip, torn && { borderColor: "transparent" }]}>
        {/* Sidoband i kategorins färg: ikon överst, kategorin på högkant under */}
        <Reanimated.View style={[s.stub, stubStyle]}>
          {/* Mätpunkten för bandets plats (panelen river loss det därifrån) */}
          <View ref={stubRef} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <VerticalGradient colors={[from, to]} />
          <View style={s.stubIcon}>
            <CategoryIcon size={18} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={s.stubTextZone}>
            <Text style={s.stubText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {offer.category ?? "Österlen"}
            </Text>
          </View>
        </Reanimated.View>

        <View style={s.body}>
          {imageUrl && <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}

          {/* Mörkare mot botten där texten ligger; texten på bilden är alltid ljus, oavsett tema */}
          <VerticalGradient colors={["rgba(6,6,10,0.1)", "rgba(6,6,10,0.35)", "rgba(6,6,10,0.92)"]} />

          {badge && (
            <View style={[s.badge, badge === "redeemed" && s.badgeGrey]}>
              {badge === "redeemed" && <Check size={10} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />}
              {badge === "endingSoon" && <Clock size={10} color="#E8C674" strokeWidth={2.5} />}
              <Text style={[s.badgeText, badge === "redeemed" && s.badgeTextGrey]}>{t(`offers.badge.${badge}`)}</Text>
            </View>
          )}

          {offer.place?.logo_url && (
            // Loggan öppnar platssidan; resten av biljetten öppnar erbjudandet (se trycket ovan)
            <View style={s.logoWrap}>
              <Image source={{ uri: offer.place.logo_url }} style={s.logo} resizeMode="cover" />
            </View>
          )}

          <View style={s.bottom}>
            {parts && (
              <View style={s.savings}>
                {!!parts.before && <Text style={s.savingsSmall}>{parts.before}</Text>}
                <Text style={s.savingsBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{parts.big}</Text>
                {!!parts.after && <Text style={[s.savingsSmall, s.savingsAfter]}>{parts.after}</Text>}
              </View>
            )}
            <Text style={s.placeName} numberOfLines={1}>{offer.place?.name ?? "Österlen"}</Text>
            <View style={s.dealRow}>
              <Text style={s.dealText} numberOfLines={1}>{offer.title}</Text>
              {offer.expires_at && (
                <Text style={s.until}>
                  {new Date(offer.expires_at).getTime() < Date.now()
                    ? t("offers.expired")
                    : t("offers.until", { date: formatDate(offer.expires_at, "d MMM") })}
                </Text>
              )}
            </View>
          </View>
        </View>

        {!torn && <Perforation />}

        {/* Kanten som blir kvar när bandet rivits bort: vit, hackig papperskant (syns först när rivningen börjat) */}
        {torn && (
          <View
            style={{ position: "absolute", left: STUB_W, top: 0, width: TEAR_DEPTH + EDGE_STROKE * 2 + 1, height: TICKET_H }}
            pointerEvents="none"
          >
            <Canvas style={StyleSheet.absoluteFill}>
              <Path path={cutPath} color={colors.bg} />
              <Path path={edgePath} color="rgba(244,240,230,0.9)" style="stroke" strokeWidth={EDGE_STROKE} />
            </Canvas>
          </View>
        )}

        {/* Hack ur biljetten: halvcirklar i sidans färg mitt på varje kortsida */}
        <View style={[s.notch, s.notchLeft, { backgroundColor: colors.bg }]} />
        <View style={[s.notch, s.notchRight, { backgroundColor: colors.bg }]} />
      </View>
    </Reanimated.View>
    </GestureDetector>
  );
});

const createStyles = (c: ThemeColors) => StyleSheet.create({
  ticket: {
    height: TICKET_H, borderRadius: 18, backgroundColor: c.bg,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 6,
  },
  ticketClip: {
    flex: 1, flexDirection: "row", borderRadius: 18, overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.tileBorder,
  },
  ticketUsed: { opacity: 0.55 },
  stub: { width: STUB_W, alignItems: "center", overflow: "hidden" },
  stubIcon: { height: 50, alignItems: "center", justifyContent: "flex-end", paddingBottom: 6 },
  stubTextZone: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", paddingBottom: 14 },
  // Bredden är zonens höjd så texten får plats efter rotationen
  stubText: {
    width: TICKET_H - 76, textAlign: "center", transform: [{ rotate: "-90deg" }],
    fontFamily: "Montserrat_700Bold", fontSize: 11.5, letterSpacing: 2,
    textTransform: "uppercase", color: "#FFFFFF",
  },
  body: { flex: 1, backgroundColor: c.tile },
  notch: { position: "absolute", top: (TICKET_H - NOTCH) / 2, width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2 },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  badge: {
    position: "absolute", top: 10, left: 12,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(230,199,122,0.45)",
  },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#E8C674", letterSpacing: 0.6, textTransform: "uppercase" },
  // Inlöst är en historik, inte något att agera på: grå i stället för guld
  badgeGrey: { borderColor: "rgba(255,255,255,0.3)" },
  badgeTextGrey: { color: "rgba(255,255,255,0.7)" },
  logoWrap: {
    position: "absolute", top: LOGO_TOP, right: LOGO_RIGHT,
    width: LOGO, height: LOGO, borderRadius: LOGO / 2, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(230,199,122,0.55)", backgroundColor: c.tile,
  },
  // Lite förstorad så att den fyller hela cirkeln även när loggan är en kvadrat med luft i hörnen
  logo: { width: "100%", height: "100%", transform: [{ scale: 1.2 }] },
  bottom: { position: "absolute", left: 16, right: 14, bottom: 12, gap: 1 },
  placeName: { fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: -0.3, color: "#FFFFFF" },
  dealText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.75)" },
  // Rabatten är det viktiga: stor guldsiffra direkt på bilden, ingen ruta runt
  savings: { marginBottom: 6 },
  savingsSmall: {
    fontFamily: "Inter_600SemiBold", fontSize: 10.5, letterSpacing: 1.4, textTransform: "uppercase",
    color: "rgba(255,255,255,0.8)", marginBottom: -3,
  },
  savingsBig: {
    flexShrink: 1, fontFamily: "PlayfairDisplay_700Bold", fontSize: 38, lineHeight: 44, color: "#E8C674",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  // "RABATT" under siffran ser ut som "SPARA" ovanför den
  savingsAfter: { marginBottom: 0, marginTop: 2 },
  dealRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  until: { fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.7)" },
});
