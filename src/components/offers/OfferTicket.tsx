/**
 * Ett erbjudande som biljett: sidoband i kategorins färg (med perforering), bilden med rabatten
 * stort i guld, platsens namn och loggan. Samma biljett på Förmåner och på platssidan.
 *
 * Trycker man på biljetten mäts sidobandets plats på skärmen, och OfferDrawer river loss bandet
 * därifrån (se OfferDrawer). Medan panelen är öppen är bandet bortrivet (stubHidden) och biljetten
 * visar den vita, hackiga rivkanten som följer panelens (edge).
 */
import { useRef } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
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
const BLEED = 6;

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

export function OfferTicket({
  offer, used, stubHidden, edge, linkPlace = true, onArm, onOpen,
}: {
  offer: Offer;
  used: boolean;
  /** Bandet är bortrivet (panelen är öppen) */
  stubHidden: boolean;
  edge: TearEdge;
  /** Loggan öppnar platssidan — av när man redan står på den */
  linkPlace?: boolean;
  /** Fingret nuddade biljetten: bilden läses in i förväg (pappersbitarna klipps ur den) */
  onArm: (imageUrl: string | null) => void;
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
  const handlePress = () => {
    if (!stubRef.current) return onOpen(offer, null);
    stubRef.current.measureInWindow((x, y, w, h) => onOpen(offer, { x, y, w, h }));
  };

  return (
    // Yttre lagret bär skuggan, det inre klipper bilden till biljettens form (overflow: hidden tar bort skuggor)
    <Pressable
      onPressIn={() => onArm(imageUrl)}
      onPress={handlePress}
      // Ingen tryck-skala här: bandets mått mäts vid tryck, och en förminskad biljett gav ett band som var för litet
      style={[s.ticket, used && s.ticketUsed, stubHidden && s.ticketTorn]}
    >
      <View style={[s.ticketClip, stubHidden && { borderColor: "transparent" }]}>
        {/* Sidoband i kategorins färg: ikon överst, kategorin på högkant under */}
        <View ref={stubRef} collapsable={false} style={[s.stub, stubHidden && { opacity: 0 }]}>
          <VerticalGradient colors={[from, to]} />
          <View style={s.stubIcon}>
            <CategoryIcon size={18} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={s.stubTextZone}>
            <Text style={s.stubText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {offer.category ?? "Österlen"}
            </Text>
          </View>
        </View>

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
            // Loggan öppnar platssidan; resten av biljetten öppnar erbjudandet
            <Pressable
              style={s.logoWrap}
              hitSlop={8}
              disabled={!linkPlace}
              onPress={() => router.push(`/place/${offer.place_id}` as any)}
            >
              <Image source={{ uri: offer.place.logo_url }} style={s.logo} resizeMode="cover" />
            </Pressable>
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

        {!stubHidden && <Perforation />}

        {/* Kanten som blir kvar när bandet rivits bort: vit, hackig papperskant */}
        {stubHidden && (
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
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  ticket: {
    height: TICKET_H, borderRadius: 18, backgroundColor: c.tile,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14, elevation: 6,
  },
  ticketClip: {
    flex: 1, flexDirection: "row", borderRadius: 18, overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.tileBorder,
  },
  ticketUsed: { opacity: 0.55 },
  // Bandet är bortrivet: ingen tom "mall" kvar, bara den kvarvarande biten mot sidans bakgrund
  ticketTorn: { backgroundColor: "transparent", shadowOpacity: 0, elevation: 0 },
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
    position: "absolute", top: 10, right: 12,
    width: 34, height: 34, borderRadius: 17, overflow: "hidden",
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
