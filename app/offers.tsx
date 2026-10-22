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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle, withTiming, cancelAnimation, runOnJS, type SharedValue,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fingerprint, Smartphone, Check, Crown } from "lucide-react-native";
import { useOffers, useRedeemedOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useMembership } from "@/hooks/useMembership";
import { useProfile } from "@/hooks/useProfile";
import { useAvailableOffers } from "@/hooks/useAvailableOffers";
import { offerEligibility, estimateOfferValue, formatKr, type Offer } from "@/lib/offers";
import { OfferDrawer, type OriginRect, type TearEdge } from "@/components/offers/OfferDrawer";
import { OfferTicket, TICKET_H } from "@/components/offers/OfferTicket";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { CategoryHeader } from "@/components/CategoryHeader";
import { Skeleton } from "@/components/Skeleton";
import { findCategory, type CategoryId } from "@/theme/categories";
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

const EDGE_ZONE = 24;     // px från kanten där svepet inte tar över
const SWIPE_DISTANCE = 70; // hur långt man måste dra för att byta
const SWIPE_SPEED = 600;   // eller hur snabbt (px/s)
const AREA_SLACK = 100;    // skärmhöjd minus rubrikfältet, ungefär
const PAGE_GAP = 16;       // mellanrum mellan sidorna medan man drar
const SIDE_MARGIN = 16;    // sidans egen sidomarginal (SettingsScreen)

interface PageData { available: Offer[]; redeemed: Offer[] }

export default function OffersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { isMember } = useMembership();
  const { data: profile } = useProfile();
  const { available: usable } = useAvailableOffers();
  const { data: offers = [], isLoading } = useOffers();
  const { data: redeemedOffers = [] } = useRedeemedOffers();
  const { data: redemptions = [] } = useOfferRedemptions();

  // Vilken biljett som är öppen och var dess sidoband satt (bandet flyger därifrån och tillbaka)
  // Rivkantens läge, delas mellan panelen (skriver) och biljetterna (läser)
  const edgeAmt = useSharedValue(0);
  const edgeProg = useSharedValue(0);
  const edgeActive = useSharedValue(0);
  // Samma objekt hela tiden, så biljetterna (memo) inte ritas om när sidan gör det
  const edge: TearEdge = useMemo(() => ({ amt: edgeAmt, prog: edgeProg, active: edgeActive }), [edgeAmt, edgeProg, edgeActive]);
  // När listan senast scrollade: ett nudd på en biljett medan den glider stoppar bara listan
  const scrollAt = useSharedValue(0);
  const [open, setOpen] = useState<{ offer: Offer; origin: OriginRect | null } | null>(null);
  const openTicket = useCallback((offer: Offer, origin: OriginRect | null) => setOpen({ offer, origin }), []);
  const closeDrawer = useCallback(() => setOpen(null), []);
  const openPlace = useCallback(() => {
    if (open) router.push(`/place/${open.offer.place_id}?from=offers` as never);
  }, [open, router]);
  // Panelen byggs i förväg (osynlig) strax efter att sidan öppnats, så rivningen alltid syns —
  // men inte medan sidan själv glider fram
  const [drawerReady, setDrawerReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawerReady(true), 450);
    return () => clearTimeout(t);
  }, []);

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
        // 0.18 gjorde att ett bara måttligt snabbt svep redan projicerades förbi grannsidan och
        // hoppade 2 sidor i stället för 1 — sänkt så det krävs ett genuint snabbt kast för det.
        const projected = offsetX.value + e.velocityX * 0.1;
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
    // Senast tillagda först, oavsett kategori
    const byNewest = (a: Offer, b: Offer) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    // Senast inlöst först i "Inlösta"
    const lastRedeemed = new Map<string, number>();
    for (const r of redemptions) {
      lastRedeemed.set(r.offer_id, Math.max(lastRedeemed.get(r.offer_id) ?? 0, new Date(r.activated_at).getTime()));
    }
    const byLastRedeemed = (a: Offer, b: Offer) => (lastRedeemed.get(b.id) ?? 0) - (lastRedeemed.get(a.id) ?? 0);

    const usedIds = new Set(offers.filter((o) => !offerEligibility(o, redemptions).canUse).map((o) => o.id));
    // Inlösta erbjudanden som gått ut eller stängts av finns kvar i historiken
    const validIds = new Set(offers.map((o) => o.id));
    const gone = redeemedOffers.filter((o) => !validIds.has(o.id));
    return FILTER_IDS.map((id): PageData => {
      const inFilter = (o: Offer) => id === "all" || matchesFilter(o.category, id);
      return {
        available: offers.filter((o) => inFilter(o) && !usedIds.has(o.id)).sort(byNewest),
        redeemed: [...offers.filter((o) => inFilter(o) && usedIds.has(o.id)), ...gone.filter(inFilter)].sort(byLastRedeemed),
      };
    });
  }, [offers, redeemedOffers, redemptions]);

  // Det som går att lösa in just nu, oberoende av valt filter
  const totalValue = usable.reduce((sum, o) => sum + estimateOfferValue(o), 0);
  const firstName = profile?.display_name?.trim().split(/\s+/)[0];

  return (
    <SettingsScreen
      title={t("offers.title")}
      page
      scrollRef={scrollRef}
      overlay={(drawerReady || open) &&
        <OfferDrawer
          visible={open != null}
          placeId={open?.offer.place_id ?? 0}
          focusOffer={open?.offer}
          origin={open?.origin}
          edge={edge}
          onOpenPlace={openPlace}
          onClose={closeDrawer}
        />
      }
      onScroll={(y) => { scrollY.current = y; scrollAt.value = Date.now(); }}
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
      {/* Sidan i grått medan erbjudandena laddas: hälsningen, kategorin och biljetterna */}
      {isLoading && (
        <View style={s.skeleton} pointerEvents="none">
          <View style={{ gap: 8 }}>
            <Skeleton width="45%" height={24} radius={7} />
            <Skeleton width="80%" height={24} radius={7} />
            <Skeleton width="55%" height={12} radius={5} style={{ marginTop: 4 }} />
          </View>
          <Skeleton width={170} height={16} radius={6} style={{ alignSelf: "center" }} />
          {[0, 1, 2].map((i) => <Skeleton key={i} height={TICKET_H} radius={18} />)}
        </View>
      )}

      {!isLoading && offers.length === 0 && redeemedOffers.length === 0 && (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Crown size={28} color={colors.goldText} strokeWidth={1.5} />
          </View>
          <Text style={s.emptyTitle}>{t("offers.emptyTitle")}</Text>
          <Text style={[s.muted, s.emptyBody]}>{t("offers.emptyBody")}</Text>
        </View>
      )}

      {!isLoading && (offers.length > 0 || redeemedOffers.length > 0) && (
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
                      <OfferPage data={page} openOfferId={open?.origin ? open.offer.id : null} edge={edge} scrollAt={scrollAt} onOpen={openTicket} />
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

/** Snabb inglidning för de första biljetterna, kort efter varandra (samma som korten på Favoriter) */
const enterAt = (index: number) => (index < 8 ? FadeInDown.delay(index * 45).duration(300) : undefined);

/** En kategorisida: listorna "Att använda" och "Inlösta" (eller ett tomt-meddelande) */
function OfferPage({
  data, openOfferId, edge, scrollAt, onOpen,
}: { data: PageData; openOfferId: string | null; edge: TearEdge; scrollAt: SharedValue<number>; onOpen: (offer: Offer, origin: OriginRect | null) => void }) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const empty = data.available.length === 0 && data.redeemed.length === 0;
  return (
    <View style={s.pageContent}>
      {empty && <Text style={[s.muted, s.noneInFilter]}>{t("offers.noneInFilter")}</Text>}
      {data.available.length > 0 && (
        <Section title={t("offers.sections.available")}>
          {data.available.map((offer, i) => (
            <Animated.View key={offer.id} entering={enterAt(i)}>
              <OfferTicket offer={offer} used={false} torn={offer.id === openOfferId} edge={edge} scrollAt={scrollAt} onOpen={onOpen} />
            </Animated.View>
          ))}
        </Section>
      )}
      {data.redeemed.length > 0 && (
        <Section title={t("offers.sections.redeemed")}>
          {data.redeemed.map((offer, i) => (
            <Animated.View key={offer.id} entering={enterAt(data.available.length + i)}>
              <OfferTicket offer={offer} used torn={offer.id === openOfferId} edge={edge} scrollAt={scrollAt} onOpen={onOpen} />
            </Animated.View>
          ))}
        </Section>
      )}
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

const createStyles = (c: ThemeColors) => StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24, paddingTop: 80 },
  skeleton: { gap: 22 },
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
});
