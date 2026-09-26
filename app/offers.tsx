/**
 * Förmåner — alla erbjudanden på Österlen, synliga för alla.
 *
 * Sidan ser likadan ut för medlemmar och icke-medlemmar. Skillnaden syns först
 * när man öppnar ett erbjudande: medlemmen får håll-inne-knappen, den andra
 * får "Skaffa Österlenpasset" (se OfferDrawer). Att trycka på ett kort öppnar
 * samma panel som platssidan använder.
 *
 * Kategorierna är sidor bredvid varandra: man sveper åt sidan och ser nästa
 * kategori glida in medan man drar. Rubriken visar var man är, pilarna och
 * prickarna visar att det finns fler. Svepet startar inte vid skärmens kant, den zonen
 * är reserverad för iOS "tillbaka".
 */
import { useMemo, useRef, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, cancelAnimation, runOnJS, FadeIn,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fingerprint, Smartphone, Check, Clock, Crown, ChevronLeft, ChevronRight } from "lucide-react-native";
import { Canvas, Fill, LinearGradient, Line, Path, DashPathEffect, vec } from "@shopify/react-native-skia";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useMembership } from "@/hooks/useMembership";
import { useProfile } from "@/hooks/useProfile";
import { useAvailableOffers } from "@/hooks/useAvailableOffers";
import {
  offerEligibility, offerSavingsLabel, estimateOfferValue, formatKr, type Offer,
} from "@/lib/offers";
import { OfferDrawer, type OriginRect } from "@/components/offers/OfferDrawer";
import { tornEdgePath, TEAR_DEPTH, TEAR_FRINGE } from "@/components/offers/tear";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { findCategory, ticketColors, type CategoryId } from "@/theme/categories";
import { formatDate } from "@/i18n/dates";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// ─── Kategorifilter ──────────────────────────────────────────────────────────
// Sex sidor över de åtta kategorierna. Erbjudanden utan känd kategori syns bara under "Alla".
type FilterId = "all" | "food" | "stay" | "cafe" | "shopping" | "activities";

const FILTER_CATEGORIES: Record<Exclude<FilterId, "all">, CategoryId[]> = {
  food:       ["mat-dryck"],
  stay:       ["hotell-bb"],
  cafe:       ["cafe-bageri"],
  shopping:   ["butiker", "hantverk-service"],
  activities: ["aktiviteter", "natur-upplevelser", "sevardheter"],
};
const FILTER_IDS: FilterId[] = ["all", "food", "stay", "cafe", "shopping", "activities"];

function matchesFilter(category: string | null, filter: Exclude<FilterId, "all">): boolean {
  const def = findCategory(category);
  return !!def && FILTER_CATEGORIES[filter].includes(def.id);
}

const TICKET_H = 190;
const STUB_W = 58;
const NOTCH = 28;
const BLEED = 6;
const TORN_EDGE = tornEdgePath(TICKET_H); // papperskanten som blir kvar när bandet rivits bort

/**
 * Delar företagets rabatt-text i det som ska synas stort ("20 %", "450 kr") och resten.
 * "Spara 450 kr" → före "Spara", stort "450 kr". "2 för 1" och annat utan enhet visas som helhet.
 */
function splitSavings(label: string): { before: string; big: string; after: string } {
  const m = label.match(/\d[\d\s.,]*\s?(%|kr|:-|sek)/i);
  if (!m || m.index === undefined) return { before: "", big: label, after: "" };
  return {
    before: label.slice(0, m.index).trim(),
    big: m[0].trim(),
    after: label.slice(m.index + m[0].length).trim(),
  };
}

const EDGE_ZONE = 24;     // px från kanten där svepet inte tar över
const SWIPE_DISTANCE = 70; // hur långt man måste dra för att byta
const SWIPE_SPEED = 600;   // eller hur snabbt (px/s)
const AREA_SLACK = 100;    // skärmhöjd minus rubrikfältet, ungefär
const PAGE_GAP = 16;       // mellanrum mellan sidorna medan man drar
const SIDE_MARGIN = 16;    // sidans egen sidomarginal (SettingsScreen)

interface PageData { available: Offer[]; redeemed: Offer[] }

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

export default function OffersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { isMember } = useMembership();
  const { data: profile } = useProfile();
  const { available: usable } = useAvailableOffers();
  const { data: offers = [], isLoading } = useOffers();
  const { data: redemptions = [] } = useOfferRedemptions();

  // Vilken biljett som är öppen och var dess sidoband satt (bandet flyger därifrån och tillbaka)
  const [open, setOpen] = useState<{ offer: Offer; origin: OriginRect | null } | null>(null);

  // Svep mellan kategorier. Alla sidor ligger i en rad och raden förskjuts i sidled; att byta
  // sida är bara att glida till nästa plats, inget innehåll byts ut (annars blinkar det).
  const { width: screenW, height: screenH } = useWindowDimensions();
  const pageW = screenW - SIDE_MARGIN * 2;
  const step = pageW + PAGE_GAP;
  const [active, setActive] = useState(0);
  const offsetX = useSharedValue(0);
  const startX = useSharedValue(0);
  const fromEdge = useSharedValue(false);
  const [heights, setHeights] = useState<number[]>([]);
  // Sidan är minst så hög som skärmen: hela ytan går att svepa även med ett enda erbjudande,
  // och det finns alltid något att scrolla upp till rubriken på, så en kort sida inte får vyn att hoppa
  const areaH = Math.max(heights[active] ?? 0, screenH - AREA_SLACK);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);

  // Vid varje sidbyte glider vyn upp till toppen, samma överallt, så en kortare sida inte får vyn att hoppa
  const settleScroll = () => {
    if (scrollY.current > 0) scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const arrived = (index: number) => setActive(index);

  // Pilarna: glid till grannsidan
  const slideTo = (target: number) => {
    if (target < 0 || target >= FILTER_IDS.length) return;
    settleScroll();
    offsetX.value = withTiming(-target * step, { duration: 220 }, (done) => {
      if (done) runOnJS(arrived)(target);
    });
  };

  // Svepet följer fingret och går att avbryta med ett nytt svep mitt i glidet. Ett snabbt
  // kast räknas ut med fart och når flera sidor på en gång, så man snabbt kan ta sig till ändarna.
  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onStart((e) => {
      cancelAnimation(offsetX);
      startX.value = offsetX.value;
      fromEdge.value = e.absoluteX - e.translationX < EDGE_ZONE;
    })
    .onUpdate((e) => {
      if (fromEdge.value) return;
      const min = -(FILTER_IDS.length - 1) * step;
      const raw = startX.value + e.translationX;
      // Motstånd utanför första och sista sidan
      offsetX.value = raw > 0 ? raw * 0.2 : raw < min ? min + (raw - min) * 0.2 : raw;
    })
    .onEnd((e) => {
      const last = FILTER_IDS.length - 1;
      const startIdx = Math.round(-startX.value / step);
      let target = startIdx;
      if (!fromEdge.value) {
        const projected = offsetX.value + e.velocityX * 0.18;
        target = Math.min(last, Math.max(0, Math.round(-projected / step)));
        const intent = Math.abs(e.translationX) > SWIPE_DISTANCE || Math.abs(e.velocityX) > SWIPE_SPEED;
        if (target === startIdx && intent) {
          target = Math.min(last, Math.max(0, startIdx + (e.translationX < 0 ? 1 : -1)));
        }
      }
      if (target !== startIdx) runOnJS(settleScroll)();
      const pagesAway = Math.max(1, Math.abs(Math.round(-offsetX.value / step) - target));
      offsetX.value = withTiming(-target * step, { duration: 150 + 40 * (pagesAway - 1) }, (done) => {
        if (done) runOnJS(arrived)(target);
      });
    });

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offsetX.value }] }));

  // Innehållet till varje sida (sex små listor, billigt att räkna om)
  const pages = useMemo(() => {
    // Det som snart går ut först, därefter det nyaste
    const byUrgency = (a: Offer, b: Offer) => {
      const ae = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
      const be = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
      if (ae !== be) return ae - be;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };
    const usedIds = new Set(offers.filter((o) => !offerEligibility(o, redemptions).canUse).map((o) => o.id));
    return FILTER_IDS.map((id): PageData => {
      const filtered = id === "all" ? offers : offers.filter((o) => matchesFilter(o.category, id));
      return {
        available: filtered.filter((o) => !usedIds.has(o.id)).sort(byUrgency),
        redeemed: filtered.filter((o) => usedIds.has(o.id)).sort(byUrgency),
      };
    });
  }, [offers, redemptions]);

  // Det som går att lösa in just nu, oberoende av valt filter
  const totalValue = usable.reduce((sum, o) => sum + estimateOfferValue(o), 0);
  const firstName = profile?.display_name?.trim().split(/\s+/)[0];

  return (
    <SettingsScreen
      title={t("offers.title")}
      scrollRef={scrollRef}
      overlay={
        <OfferDrawer
          visible={open != null}
          placeId={open?.offer.place_id ?? 0}
          focusOffer={open?.offer}
          origin={open?.origin}
          onClose={() => setOpen(null)}
        />
      }
      onScroll={(y) => { scrollY.current = y; }}
      right={
        <Pressable
          disabled={isMember}
          onPress={() => router.push("/settings/pass-buy")}
          style={[s.status, isMember && s.statusActive]}
        >
          <View style={[s.statusDot, { backgroundColor: isMember ? colors.success : colors.faint }]} />
          <Text style={[s.statusText, isMember && { color: colors.success }]}>
            {isMember ? t("offers.member") : t("offers.notMember")}
          </Text>
        </Pressable>
      }
    >
      {isLoading && (
        <View style={s.center}>
          <Text style={s.muted}>{t("offers.loading")}</Text>
        </View>
      )}

      {!isLoading && offers.length === 0 && (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Crown size={28} color={colors.goldText} strokeWidth={1.5} />
          </View>
          <Text style={s.emptyTitle}>{t("offers.emptyTitle")}</Text>
          <Text style={[s.muted, s.emptyBody]}>{t("offers.emptyBody")}</Text>
        </View>
      )}

      {!isLoading && offers.length > 0 && (
        <>
          <View>
            <Text style={s.greeting} numberOfLines={1}>
              {firstName ? t("offers.greeting", { name: firstName }) : t("offers.greetingNoName")}
            </Text>
            <Text style={s.greetingLine} numberOfLines={1} adjustsFontSizeToFit>
              {isMember
                ? usable.length === 0
                  ? t("offers.haveNone")
                  : usable.length === 1 ? t("offers.haveOne") : t("offers.have", { count: usable.length })
                : usable.length === 1 ? t("offers.waitingOne") : t("offers.waiting", { count: usable.length })}
            </Text>
            <Text style={s.saveLine}>
              {t(isMember ? "offers.saveUpTo" : "offers.saveUpToWithPass", { amount: formatKr(totalValue) })}
            </Text>
          </View>

          {/* Förklaringen visas bara tills man löst in något första gången */}
          {redemptions.length === 0 && <HowItWorks />}

          <CategoryHeader
            index={active}
            labels={FILTER_IDS.map((id) => t(`offers.filters.${id}`))}
            onStep={(dir) => slideTo(active + dir)}
          />

          <GestureDetector gesture={swipe}>
            {/* Höjden följer aktuella sidan; alla sidor ligger bredvid varandra, klippta till samma höjd */}
            <Animated.View style={[{ height: areaH }, slideStyle]}>
              {pages.map((page, i) => (
                // Alla sidor finns med hela tiden: ett snabbt kast passerar flera sidor
                (
                  <View
                    key={FILTER_IDS[i]}
                    pointerEvents={i === active ? "auto" : "none"}
                    style={[s.page, { left: i * step, width: pageW, height: areaH }]}
                  >
                    <View
                      onLayout={(e) => {
                        const h = e.nativeEvent.layout.height;
                        setHeights((prev) => (prev[i] === h ? prev : Object.assign([...prev], { [i]: h })));
                      }}
                    >
                      <OfferPage data={page} hiddenOfferId={open?.origin ? open.offer.id : null} onOpen={(offer, origin) => setOpen({ offer, origin })} />
                    </View>
                  </View>
                )
              ))}
            </Animated.View>
          </GestureDetector>

        </>
      )}

    </SettingsScreen>
  );
}

/** En kategorisida: listorna "Att använda" och "Inlösta" (eller ett tomt-meddelande) */
function OfferPage({
  data, hiddenOfferId, onOpen,
}: { data: PageData; hiddenOfferId: string | null; onOpen: (offer: Offer, origin: OriginRect | null) => void }) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const empty = data.available.length === 0 && data.redeemed.length === 0;
  return (
    <View style={s.pageContent}>
      {empty && <Text style={[s.muted, s.noneInFilter]}>{t("offers.noneInFilter")}</Text>}
      {data.available.length > 0 && (
        <Section title={t("offers.sections.available")}>
          {data.available.map((offer) => (
            <OfferListCard key={offer.id} offer={offer} used={false} stubHidden={offer.id === hiddenOfferId} onOpen={onOpen} />
          ))}
        </Section>
      )}
      {data.redeemed.length > 0 && (
        <Section title={t("offers.sections.redeemed")}>
          {data.redeemed.map((offer) => (
            <OfferListCard key={offer.id} offer={offer} used stubHidden={offer.id === hiddenOfferId} onOpen={onOpen} />
          ))}
        </Section>
      )}
    </View>
  );
}

/**
 * ‹ ── NAMN ── › (linjerna som kortdesignen i Utseende) med prickar under. Pilarna är
 * för den som inte hittar svepet; de försvinner i ändarna.
 */
function CategoryHeader({
  index, labels, onStep,
}: { index: number; labels: string[]; onStep: (dir: 1 | -1) => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const arrow = (dir: 1 | -1) => {
    const hidden = index + dir < 0 || index + dir >= labels.length;
    const Icon = dir === 1 ? ChevronRight : ChevronLeft;
    return (
      <Pressable onPress={() => onStep(dir)} disabled={hidden} hitSlop={12} style={[s.arrow, hidden && { opacity: 0 }]}>
        <Icon size={22} color={colors.muted} strokeWidth={2} />
      </Pressable>
    );
  };
  return (
    <View style={s.catHeader}>
      <View style={s.catRow}>
        {arrow(-1)}
        <View style={s.catMiddle}>
          <View style={s.rule} />
          <Text style={s.catTitle} numberOfLines={1}>{labels[index].toUpperCase()}</Text>
          <View style={s.rule} />
        </View>
        {arrow(1)}
      </View>
      <View style={s.dots}>
        {labels.map((label, i) => (
          <View key={label} style={[s.dot, i === index && s.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.list}>{children}</View>
    </View>
  );
}

// ─── Tre steg: så här löser du in ────────────────────────────────────────────

function HowItWorks() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const steps = [
    { Icon: Fingerprint, label: t("offers.how.hold") },
    { Icon: Smartphone,  label: t("offers.how.show") },
    { Icon: Check,       label: t("offers.how.done") },
  ];
  return (
    <View style={s.how}>
      {steps.map(({ Icon, label }) => (
        <View key={label} style={s.howStep}>
          <View style={s.howIcon}>
            <Icon size={18} color={colors.goldText} strokeWidth={2} />
          </View>
          <Text style={s.howLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Ett erbjudandekort i listan ─────────────────────────────────────────────

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

function OfferListCard({
  offer, used, stubHidden, onOpen,
}: { offer: Offer; used: boolean; stubHidden: boolean; onOpen: (offer: Offer, origin: OriginRect | null) => void }) {
  const { t } = useTranslation();
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

  // Mät sidobandets plats på skärmen så panelen kan riva loss det därifrån
  const handlePress = () => {
    if (!stubRef.current) return onOpen(offer, null);
    stubRef.current.measureInWindow((x, y, w, h) => onOpen(offer, { x, y, w, h }));
  };

  return (
    // Yttre lagret bär skuggan, det inre klipper bilden till biljettens form (overflow: hidden tar bort skuggor)
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [s.ticket, used && s.ticketUsed, stubHidden && s.ticketTorn, pressed && { transform: [{ scale: 0.98 }] }]}
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
            <View style={s.badge}>
              {badge === "redeemed" && <Check size={10} color="#E8C674" strokeWidth={2.5} />}
              {badge === "endingSoon" && <Clock size={10} color="#E8C674" strokeWidth={2.5} />}
              <Text style={s.badgeText}>{t(`offers.badge.${badge}`)}</Text>
            </View>
          )}

          {offer.place?.logo_url && (
            <View style={s.logoWrap}>
              <Image source={{ uri: offer.place.logo_url }} style={s.logo} resizeMode="cover" />
            </View>
          )}

          <View style={s.bottom}>
            {parts && (
              <View style={s.savings}>
                {!!parts.before && <Text style={s.savingsSmall}>{parts.before}</Text>}
                <View style={s.savingsRow}>
                  <Text style={s.savingsBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{parts.big}</Text>
                  {!!parts.after && <Text style={s.savingsAfter} numberOfLines={1}>{parts.after}</Text>}
                </View>
              </View>
            )}
            <Text style={s.placeName} numberOfLines={1}>{offer.place?.name ?? "Österlen"}</Text>
            <View style={s.dealRow}>
              <Text style={s.dealText} numberOfLines={1}>{offer.title}</Text>
              {offer.expires_at && (
                <Text style={s.until}>{t("offers.until", { date: formatDate(offer.expires_at, "d MMM") })}</Text>
              )}
            </View>
          </View>
        </View>

        {!stubHidden && <Perforation />}

        {/* Kanten som blir kvar när bandet rivits bort: vit, hackig papperskant */}
        {stubHidden && (
          <Animated.View
            entering={FadeIn.delay(220).duration(260)}
            style={{ position: "absolute", left: STUB_W, top: 0, width: TEAR_DEPTH + TEAR_FRINGE + 1, height: TICKET_H }}
            pointerEvents="none"
          >
            <Canvas style={StyleSheet.absoluteFill}>
              <Path path={TORN_EDGE} color="#F4F0E6" />
            </Canvas>
          </Animated.View>
        )}

        {/* Hack ur biljetten: halvcirklar i sidans färg mitt på varje kortsida */}
        <View style={[s.notch, s.notchLeft, { backgroundColor: colors.bg }]} />
        <View style={[s.notch, s.notchRight, { backgroundColor: colors.bg }]} />
      </View>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24, paddingTop: 80 },
  muted: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.goldBorder,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: c.text, textAlign: "center" },
  emptyBody: { textAlign: "center", lineHeight: 19 },
  noneInFilter: { textAlign: "center", paddingVertical: 32 },

  how: {
    flexDirection: "row",
    backgroundColor: c.tile, borderWidth: 1, borderColor: c.tileBorder,
    borderRadius: 18, paddingVertical: 16, paddingHorizontal: 8,
  },
  howStep: { flex: 1, alignItems: "center", gap: 8 },
  howIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: c.goldSoft, alignItems: "center", justifyContent: "center",
  },
  howLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.text, textAlign: "center" },

  catHeader: { alignItems: "center", gap: 10 },
  catRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  catMiddle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 6 },
  arrow: { width: 32, alignItems: "center" },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.goldBorder },
  catTitle: { fontFamily: "Montserrat_700Bold", fontSize: 13, letterSpacing: 3, color: c.text },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderStrong },
  dotActive: { width: 18, backgroundColor: c.gold },

  page: { position: "absolute", top: 0, overflow: "hidden" },
  pageContent: { gap: 22 },
  section: { gap: 12 },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold", fontSize: 11, letterSpacing: 1.5,
    textTransform: "uppercase", color: c.muted,
  },
  list: { gap: 14 },

  greeting: { fontFamily: "Montserrat_700Bold", fontSize: 24, lineHeight: 30, letterSpacing: -0.5, color: c.text },
  greetingLine: { fontFamily: "Montserrat_700Bold", fontSize: 24, lineHeight: 30, letterSpacing: -0.5, color: c.goldText },
  saveLine: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, marginTop: 8 },
  status: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  statusActive: { borderColor: c.success },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.muted },

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
  logoWrap: {
    position: "absolute", top: 10, right: 12,
    width: 34, height: 34, borderRadius: 17, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(230,199,122,0.55)", backgroundColor: c.tile,
  },
  // Lite förstorad så att den fyller hela cirkeln även när loggan är en kvadrat med luft i hörnen
  logo: { width: "100%", height: "100%", transform: [{ scale: 1.2 }] },
  bottom: { position: "absolute", left: 16, right: 14, bottom: 12, gap: 1 },
  placeName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 17, color: "#FFFFFF" },
  dealText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.75)" },
  // Rabatten är det viktiga: stor guldsiffra direkt på bilden, ingen ruta runt
  savings: { marginBottom: 6 },
  savingsSmall: {
    fontFamily: "Inter_600SemiBold", fontSize: 10.5, letterSpacing: 1.4, textTransform: "uppercase",
    color: "rgba(255,255,255,0.8)", marginBottom: 1,
  },
  savingsRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  savingsBig: {
    flexShrink: 1, fontFamily: "PlayfairDisplay_700Bold", fontSize: 38, lineHeight: 44, color: "#E8C674",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  savingsAfter: {
    flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  dealRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  until: { fontFamily: "Inter_500Medium", fontSize: 11, color: "rgba(255,255,255,0.7)" },
});
