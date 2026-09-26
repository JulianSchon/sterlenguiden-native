/**
 * Förmåner — alla erbjudanden på Österlen, synliga för alla.
 *
 * Sidan ser likadan ut för medlemmar och icke-medlemmar. Skillnaden syns först
 * när man öppnar ett erbjudande: medlemmen får håll-inne-knappen, den andra
 * får "Skaffa Österlenpasset" (se OfferDrawer). Att trycka på ett kort öppnar
 * samma panel som platssidan använder.
 */
import { useMemo, useState } from "react";
import { View, Text, Image, ScrollView, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Fingerprint, Smartphone, Check, Clock, Crown } from "lucide-react-native";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { offerEligibility, offerSavingsLabel, type Offer } from "@/lib/offers";
import { OfferDrawer } from "@/components/offers/OfferDrawer";
import { CategoryChips } from "@/components/CategoryChips";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// ─── Kategorifilter — matchar offers.category ────────────────────────────────
type FilterId = "all" | "food" | "stay" | "experiences" | "shopping";

const FILTER_DB_VALUES: Record<Exclude<FilterId, "all">, string[]> = {
  food:        ["Mat & Dryck", "Mat", "Café & Bageri", "Cafe & Bageri"],
  stay:        ["Hotell & B&B", "Boende"],
  experiences: ["Natur & Upplevelser", "Natur", "Upplevelser", "Aktiviteter", "Sevärdheter"],
  shopping:    ["Butiker", "Shopping", "Hantverk & Service", "Hantverk"],
};
const FILTER_IDS: FilterId[] = ["all", "food", "stay", "experiences", "shopping"];

function matchesCategory(category: string | null, dbValues: string[]): boolean {
  if (!category) return false;
  const c = category.trim().toLowerCase();
  return dbValues.some((v) => {
    const t = v.toLowerCase();
    return c === t || c.includes(t) || t.includes(c);
  });
}

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
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { data: offers = [], isLoading } = useOffers();
  const { data: redemptions = [] } = useOfferRedemptions();

  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [drawerPlaceId, setDrawerPlaceId] = useState<number | null>(null);

  const chips = FILTER_IDS.map((id) => ({ id, label: t(`offers.filters.${id}`) }));

  const { available, redeemed } = useMemo(() => {
    const filtered = activeFilter === "all"
      ? offers
      : offers.filter((o) => matchesCategory(o.category, FILTER_DB_VALUES[activeFilter]));

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

  const businessCount = useMemo(() => new Set(offers.map((o) => o.place_id)).size, [offers]);

  return (
    <SettingsScreen title={t("offers.title")}>
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
          <Text style={s.summary}>
            {offers.length === 1 ? t("offers.summaryOne") : t("offers.summary", { count: offers.length })}
            {"  ·  "}
            {businessCount === 1 ? t("offers.placesOne") : t("offers.places", { count: businessCount })}
          </Text>

          {/* Förklaringen visas bara tills man löst in något första gången */}
          {redemptions.length === 0 && <HowItWorks />}

          {/* Chips går kant i kant: tar ut sidomarginalen och lägger tillbaka den som inset */}
          <View style={s.chipsBleed}>
            <CategoryChips chips={chips} activeId={activeFilter} onChange={(id) => setActiveFilter(id as FilterId)} inset={16} />
          </View>

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

function OfferListCard({ offer, used, onPress }: { offer: Offer; used: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const imageUrl = offer.image_url ?? offer.place?.logo_url ?? null;
  const badge = offerBadge(offer, used);
  const savings = offerSavingsLabel(offer);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, used && s.cardUsed, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      {imageUrl && <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}

      {/* Mörkare mot botten där texten ligger; texten på bilden är alltid ljus, oavsett tema */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <SvgGrad id={`cardFade${offer.id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor="#06060A" stopOpacity={0.12} />
            <Stop offset="50%"  stopColor="#06060A" stopOpacity={0.2} />
            <Stop offset="100%" stopColor="#06060A" stopOpacity={0.9} />
          </SvgGrad>
        </Defs>
        <SvgRect width="100%" height="100%" fill={`url(#cardFade${offer.id})`} />
      </Svg>

      {badge && (
        <View style={s.badge}>
          {badge === "redeemed" && <Check size={11} color={colors.goldText} strokeWidth={2.5} />}
          {badge === "endingSoon" && <Clock size={11} color={colors.goldText} strokeWidth={2.5} />}
          <Text style={s.badgeText}>{t(`offers.badge.${badge}`)}</Text>
        </View>
      )}

      {offer.place?.logo_url && (
        <View style={s.logoWrap}>
          <Image source={{ uri: offer.place.logo_url }} style={s.logo} resizeMode="cover" />
        </View>
      )}

      <View style={s.bottom}>
        {!!offer.category && <Text style={s.category}>{offer.category}</Text>}
        <Text style={s.placeName} numberOfLines={1}>{offer.place?.name ?? "Österlen"}</Text>
        <Text style={s.dealText} numberOfLines={1}>{offer.title}</Text>
        {savings && (
          <View style={s.savingsPill}>
            <Text style={s.savingsText}>{savings}</Text>
          </View>
        )}
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

  summary: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, marginTop: -8 },

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

  card: {
    height: 210, borderRadius: 22, overflow: "hidden",
    backgroundColor: c.tile,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.goldBorder,
  },
  cardUsed: { opacity: 0.55 },
  badge: {
    position: "absolute", top: 14, left: 14,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(230,199,122,0.45)",
  },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#E8C674", letterSpacing: 0.6, textTransform: "uppercase" },
  logoWrap: {
    position: "absolute", top: 14, right: 14,
    width: 36, height: 36, borderRadius: 18, overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(230,199,122,0.55)", backgroundColor: c.tile,
  },
  logo: { width: "100%", height: "100%" },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 14, gap: 2 },
  category: { fontFamily: "Inter_600SemiBold", fontSize: 9.5, color: "#E8C674", letterSpacing: 1.4, textTransform: "uppercase" },
  placeName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 19, color: "#FFFFFF", marginTop: 2 },
  dealText: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.75)" },
  savingsPill: {
    alignSelf: "flex-start", marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "#E8C674",
  },
  savingsText: { fontFamily: "Inter_700Bold", fontSize: 11.5, color: "#0B0B0D" },
});
