/**
 * Förmåner — alla erbjudanden på Österlen, synliga för alla.
 *
 * Sidan ser likadan ut för medlemmar och icke-medlemmar. Skillnaden syns först
 * när man öppnar ett erbjudande: medlemmen får håll-inne-knappen, den andra
 * får "Skaffa Österlenpasset" (se OfferDrawer). Att trycka på ett kort öppnar
 * samma panel som platssidan använder.
 *
 * Listan går att svepa åt sidan för att byta kategori, samma sak som att trycka
 * på nästa/föregående piller. Svepet startar inte vid skärmens kant, den zonen
 * är reserverad för iOS "tillbaka".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fingerprint, Smartphone, Check, Clock, Crown } from "lucide-react-native";
import { Canvas, Fill, LinearGradient, vec } from "@shopify/react-native-skia";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useMembership } from "@/hooks/useMembership";
import { useProfile } from "@/hooks/useProfile";
import { useAvailableOffers } from "@/hooks/useAvailableOffers";
import {
  offerEligibility, offerSavingsLabel, estimateOfferValue, formatKr, type Offer,
} from "@/lib/offers";
import { OfferDrawer } from "@/components/offers/OfferDrawer";
import { CategoryChips } from "@/components/CategoryChips";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { findCategory, shade, type CategoryId } from "@/theme/categories";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// ─── Kategorifilter ──────────────────────────────────────────────────────────
// Sex pillers över de åtta kategorierna. Erbjudanden utan känd kategori syns bara under "Alla".
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

/** Sidobandets toning: kategorins färg mot en mörkare ton, guld för okänd kategori */
function stubColors(category: string | null): [string, string] {
  const base = findCategory(category)?.screen ?? "#D4A84F";
  return [base, shade(base, 0.4)];
}

const EDGE_ZONE = 24;     // px från kanten där svepet inte tar över
const SWIPE_DISTANCE = 70; // hur långt man måste dra för att byta
const SWIPE_SPEED = 600;   // eller hur snabbt (px/s)

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

  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [drawerPlaceId, setDrawerPlaceId] = useState<number | null>(null);

  // Svep mellan kategorier: innehållet följer fingret, glider ut åt ena hållet och in från det andra
  const { width: screenW } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const pendingDir = useRef<1 | -1 | null>(null);
  const filterIndex = FILTER_IDS.indexOf(activeFilter);

  const commitSwipe = (dir: 1 | -1) => {
    pendingDir.current = dir;
    setActiveFilter(FILTER_IDS[filterIndex + dir]);
  };

  // Nya innehållet är på plats: starta utanför skärmen på motsatt sida och glid in
  useEffect(() => {
    const dir = pendingDir.current;
    if (dir === null) return;
    pendingDir.current = null;
    translateX.value = dir * screenW;
    translateX.value = withTiming(0, { duration: 200 });
  }, [activeFilter]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      if (e.absoluteX - e.translationX < EDGE_ZONE) return;
      const dir = e.translationX < 0 ? 1 : -1;
      const hasTarget = filterIndex + dir >= 0 && filterIndex + dir < FILTER_IDS.length;
      // Motstånd i ändarna: det går att dra lite, men inget byts
      translateX.value = hasTarget ? e.translationX : e.translationX * 0.2;
    })
    .onEnd((e) => {
      const dir = e.translationX < 0 ? 1 : -1;
      const hasTarget = filterIndex + dir >= 0 && filterIndex + dir < FILTER_IDS.length;
      const fastEnough = Math.abs(e.translationX) > SWIPE_DISTANCE || Math.abs(e.velocityX) > SWIPE_SPEED;
      if (hasTarget && fastEnough && e.absoluteX - e.translationX >= EDGE_ZONE) {
        translateX.value = withTiming(-dir * screenW, { duration: 140 }, (done) => {
          if (done) runOnJS(commitSwipe)(dir);
        });
      } else {
        translateX.value = withTiming(0, { duration: 180 });
      }
    });

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const chips = FILTER_IDS.map((id) => ({ id, label: t(`offers.filters.${id}`) }));

  const { available, redeemed } = useMemo(() => {
    const filtered = activeFilter === "all"
      ? offers
      : offers.filter((o) => matchesFilter(o.category, activeFilter));

    const withState = filtered.map((offer) => ({ offer, used: !offerEligibility(offer, redemptions).canUse }));
    // Det som snart går ut först, därefter det nyaste
    const byUrgency = (a: Offer, b: Offer) => {
      const ae = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
      const be = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
      if (ae !== be) return ae - be;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };
    return {
      available: withState.filter((x) => !x.used).map((x) => x.offer).sort(byUrgency),
      redeemed: withState.filter((x) => x.used).map((x) => x.offer).sort(byUrgency),
    };
  }, [offers, redemptions, activeFilter]);

  // Det som går att lösa in just nu, oberoende av valt filter
  const totalValue = usable.reduce((sum, o) => sum + estimateOfferValue(o), 0);
  const firstName = profile?.display_name?.trim().split(/\s+/)[0];

  return (
    <SettingsScreen
      title={t("offers.title")}
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

          {/* Chips går kant i kant: tar ut sidomarginalen och lägger tillbaka den som inset */}
          <View style={s.chipsBleed}>
            <CategoryChips chips={chips} activeId={activeFilter} onChange={(id) => setActiveFilter(id as FilterId)} inset={16} />
          </View>

          <GestureDetector gesture={swipe}>
            <Animated.View style={[s.swipeArea, slideStyle]}>
              {available.length === 0 && redeemed.length === 0 && (
                <Text style={[s.muted, s.noneInFilter]}>{t("offers.noneInFilter")}</Text>
              )}

              {available.length > 0 && (
                <Section title={t("offers.sections.available")}>
                  {available.map((offer) => (
                    <OfferListCard key={offer.id} offer={offer} used={false} onPress={() => setDrawerPlaceId(offer.place_id)} />
                  ))}
                </Section>
              )}

              {redeemed.length > 0 && (
                <Section title={t("offers.sections.redeemed")}>
                  {redeemed.map((offer) => (
                    <OfferListCard key={offer.id} offer={offer} used onPress={() => setDrawerPlaceId(offer.place_id)} />
                  ))}
                </Section>
              )}
            </Animated.View>
          </GestureDetector>
        </>
      )}

      <OfferDrawer
        visible={drawerPlaceId != null}
        placeId={drawerPlaceId ?? 0}
        onClose={() => setDrawerPlaceId(null)}
      />
    </SettingsScreen>
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
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <LinearGradient start={vec(0, 0)} end={vec(0, TICKET_H)} colors={colors} />
      </Fill>
    </Canvas>
  );
}

function OfferListCard({ offer, used, onPress }: { offer: Offer; used: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const imageUrl = offer.image_url ?? offer.place?.logo_url ?? null;
  const badge = offerBadge(offer, used);
  const savings = offerSavingsLabel(offer);
  const [from, to] = stubColors(offer.category);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.ticket, used && s.ticketUsed, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      {/* Sidoband i kategorins färg, kategorin skriven på högkant */}
      <View style={s.stub}>
        <VerticalGradient colors={[from, to]} />
        <Text style={s.stubText} numberOfLines={1}>{offer.category ?? "Österlen"}</Text>
      </View>

      <View style={s.body}>
        {imageUrl && <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}

        {/* Mörkare mot botten där texten ligger; texten på bilden är alltid ljus, oavsett tema */}
        <VerticalGradient colors={["rgba(6,6,10,0.15)", "rgba(6,6,10,0.3)", "rgba(6,6,10,0.88)"]} />

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
          <Text style={s.placeName} numberOfLines={1}>{offer.place?.name ?? "Österlen"}</Text>
          <Text style={s.dealText} numberOfLines={1}>{offer.title}</Text>
          {savings && (
            <View style={s.savingsPill}>
              <Text style={s.savingsText}>{savings}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Hack ur biljetten: halvcirklar i sidans färg mitt på varje kortsida */}
      <View style={[s.notch, s.notchLeft, { backgroundColor: colors.bg }]} />
      <View style={[s.notch, s.notchRight, { backgroundColor: colors.bg }]} />
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
  // Minst så hög att man kan svepa även när en kategori är nästan tom
  swipeArea: { gap: 22, minHeight: 360 },
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

  chipsBleed: { marginHorizontal: -16 },

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
    flexDirection: "row", height: TICKET_H, borderRadius: 18, overflow: "hidden",
    backgroundColor: c.tile,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.tileBorder,
  },
  ticketUsed: { opacity: 0.55 },
  stub: { width: STUB_W, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  // Bredden är biljettens höjd så texten får plats efter rotationen
  stubText: {
    width: TICKET_H, textAlign: "center", transform: [{ rotate: "-90deg" }],
    fontFamily: "Montserrat_700Bold", fontSize: 12, letterSpacing: 2.2,
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
    width: 30, height: 30, borderRadius: 15, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(230,199,122,0.55)", backgroundColor: c.tile,
  },
  logo: { width: "100%", height: "100%" },
  bottom: { position: "absolute", left: 16, right: 14, bottom: 12, gap: 1 },
  placeName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: "#FFFFFF" },
  dealText: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.75)" },
  savingsPill: {
    alignSelf: "flex-start", marginTop: 6,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
    backgroundColor: "#E8C674",
  },
  savingsText: { fontFamily: "Inter_700Bold", fontSize: 11.5, color: "#0B0B0D" },
});
