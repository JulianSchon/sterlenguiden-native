/**
 * Förmåner — alla erbjudanden på Österlen, synliga för alla.
 *
 * Sidan gör dubbelt jobb: den ska sälja passet till icke-medlemmar (därför
 * värde-hero:n högst upp) och fungera som en nyttokatalog för medlemmar
 * (därför kort-listan och filtren). Att trycka på ett erbjudande öppnar
 * samma OfferDrawer som platssidan använder — ingen ny aktiverings-UI
 * behövdes, den fanns redan.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Animated, Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Crown, Clock, Flame, Check, Tag, Store } from "lucide-react-native";
import Svg, {
  Defs, LinearGradient as SvgGrad, Stop,
  Rect as SvgRect, Text as SvgText,
} from "react-native-svg";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useProfile } from "@/hooks/useProfile";
import { useMembership } from "@/hooks/useMembership";
import { useAuth } from "@/hooks/useAuth";
import {
  offerEligibility, offerSavingsLabel, estimateOfferValue, formatKr, type Offer,
} from "@/lib/offers";
import { OfferDrawer } from "@/components/offers/OfferDrawer";
import { MemberCard, CARD_W, CARD_H } from "@/components/MemberCard";
import { CategoryChips } from "@/components/CategoryChips";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const BG        = "#121212";
const CARD      = "#1C1C1C";
const FG        = "#F5F1E8";
const MUTED     = "rgba(245,241,232,0.55)";
const GOLD      = "#C5A059";
const GREEN     = "#4ADE80"; // "Aktivt"-status — grönt läses som "på", guld är redan appens vanliga accent
const GOLD_LT   = "#E8C674";

// ─── Kategorifilter — samma grupper/stil som Favoriter, matchar offers.category ──
interface OfferFilter { id: string; label: string; dbValues?: string[] }
const OFFER_FILTERS: OfferFilter[] = [
  { id: "alla" , label: "Alla" },
  { id: "ata",    label: "Mat",         dbValues: ["Mat & Dryck", "Mat", "Café & Bageri", "Cafe & Bageri"] },
  { id: "sova",   label: "Boende",      dbValues: ["Hotell & B&B", "Boende"] },
  { id: "gora",   label: "Upplevelser", dbValues: ["Natur & Upplevelser", "Natur", "Upplevelser", "Aktiviteter", "Sevärdheter"] },
  { id: "handla", label: "Shopping",    dbValues: ["Butiker", "Shopping", "Hantverk & Service", "Hantverk"] },
];

function matchesCategory(category: string | null, dbValues: string[]): boolean {
  if (!category) return false;
  const c = category.trim().toLowerCase();
  return dbValues.some((v) => {
    const t = v.toLowerCase();
    return c === t || c.includes(t) || t.includes(c);
  });
}

export default function OffersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: offers = [], isLoading } = useOffers();
  const { data: redemptions = [] } = useOfferRedemptions();
  const { data: profile } = useProfile();
  const { user } = useAuth();

  const [activeFilter, setActiveFilter] = useState("alla");
  const [drawerPlaceId, setDrawerPlaceId] = useState<number | null>(null);

  // Samma beräkning som profilsidan — det ska kännas som SAMMA kort, inte en kopia
  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Gäst";
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy", { locale: sv })
    : null;
  const safeTop = Math.max(insets.top, 44);
  const { isMember } = useMembership();

  const filter = OFFER_FILTERS.find((f) => f.id === activeFilter) ?? OFFER_FILTERS[0];
  const filtered = useMemo(() => {
    if (filter.id === "alla") return offers;
    return offers.filter((o) => matchesCategory(o.category, filter.dbValues ?? []));
  }, [offers, filter]);

  // Inlösta/spärrade sist, i övrigt högst värde först — de mest lockande
  // erbjudandena ska synas direkt, det är hela poängen med sidan
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aElig = offerEligibility(a, redemptions);
      const bElig = offerEligibility(b, redemptions);
      if (aElig.canUse !== bElig.canUse) return aElig.canUse ? -1 : 1;
      return estimateOfferValue(b) - estimateOfferValue(a);
    });
  }, [filtered, redemptions]);

  // Värde-hero: summan av det som faktiskt går att lösa in just nu
  const { totalValue, businessCount, redeemedCount } = useMemo(() => {
    const usable = offers.filter((o) => offerEligibility(o, redemptions).canUse);
    const total = usable.reduce((sum, o) => sum + estimateOfferValue(o), 0);
    const businesses = new Set(offers.map((o) => o.place_id));
    const redeemed = offers.filter((o) => offerEligibility(o, redemptions).used).length;
    return { totalValue: total, businessCount: businesses.size, redeemedCount: redeemed };
  }, [offers, redemptions]);

  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const id = countAnim.addListener(({ value }) => setDisplayValue(Math.round(value)));
    Animated.timing(countAnim, {
      toValue: totalValue,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => countAnim.removeListener(id);
  }, [totalValue]);

  const handleCardPress = (offer: Offer) => {
    if (!isMember) {
      router.push("/settings/pass-buy" as any);
      return;
    }
    setDrawerPlaceId(offer.place_id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: safeTop }]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGrad id="offersHeaderFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={BG} stopOpacity={1}    />
              <Stop offset="55%"  stopColor={BG} stopOpacity={0.98} />
              <Stop offset="100%" stopColor={BG} stopOpacity={0.78} />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#offersHeaderFade)" />
        </Svg>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Förmåner</Text>
        </View>
      </View>

      {isLoading && (
        <View style={s.center}>
          <Text style={s.loadingText}>Laddar erbjudanden…</Text>
        </View>
      )}

      {!isLoading && offers.length === 0 && (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Crown size={28} color={GOLD} strokeWidth={1.5} />
          </View>
          <Text style={s.emptyTitle}>Inga erbjudanden just nu</Text>
          <Text style={s.emptyBody}>Nya förmåner från Österlens företag dyker upp här löpande.</Text>
        </View>
      )}

      {!isLoading && offers.length > 0 && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {/* ── Medlemskap-kortet ──
              Bara medlemskap-boxen: status + en liten vinklad förhandsvisning
              av det riktiga kortet (samma perspective/rotateY-trick som
              kortets egen flip-animation redan använder). Ingen guldglöd —
              en enkel mörk ruta med guldkant läser som mer genomtänkt. */}
          <View style={s.heroOuter}>
            {/* Rent visningskort — inte tryckbart, ingen navigering */}
            <View style={s.membershipCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.membershipLabel}>DITT MEDLEMSKAP</Text>
                <Text style={s.membershipTitle}>Österlenpasset</Text>
                <View style={s.membershipStatusRow}>
                  <View style={[s.statusDot, isMember && s.statusDotActive]} />
                  <Text style={[s.membershipStatus, isMember && s.membershipStatusActive]}>
                    {isMember ? "Aktivt" : "Inte aktiverat"}
                  </Text>
                </View>
              </View>

              {/* Liten, vinklad förhandsvisning av det riktiga kortet — egen
                  skugga på den roterade ytan själv, så den ser ut att sväva */}
              <View style={s.miniCardBox} pointerEvents="none">
                <View style={s.miniCardTilt}>
                  <MemberCard
                    displayName={displayName}
                    isMember={isMember}
                    memberSince={memberSince}
                    cardColor={(profile as any)?.card_color}
                    avatarUrl={(profile as any)?.avatar_url ?? null}
                    profileImageUrl={(profile as any)?.profile_image_url ?? null}
                    onBuyPress={() => {}}
                    disableFlip
                  />
                </View>
              </View>
            </View>

            {/* ── Värde-info ── ligger direkt på bakgrunden, inget eget kort */}
            <View style={s.valueSection}>
              <Text style={s.heroLabel}>SPARA UPP TILL</Text>

              <Svg width="100%" height={64}>
                <Defs>
                  <SvgGrad id="heroValueGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%"   stopColor="#F6E7BC" />
                    <Stop offset="45%"  stopColor={GOLD_LT} />
                    <Stop offset="100%" stopColor="#B8934A" />
                  </SvgGrad>
                </Defs>
                <SvgText
                  x="0" y={48} textAnchor="start"
                  fontSize={46} fontFamily="PlayfairDisplay_700Bold"
                  fill="url(#heroValueGrad)"
                >
                  {formatKr(displayValue)}
                </SvgText>
              </Svg>

              <Text style={s.heroDescription}>
                Exklusiva erbjudande hos lokala favoriter — direkt i mobilen.
              </Text>

              <View style={s.statRow}>
                <View style={s.statItem}>
                  <Tag size={13} color={GOLD} strokeWidth={2} />
                  <Text style={s.statText}>
                    {offers.length === 1 ? "1 förmån" : `${offers.length} förmåner`}
                  </Text>
                </View>
                <View style={s.statItem}>
                  <Store size={13} color={GOLD} strokeWidth={2} />
                  <Text style={s.statText}>
                    {businessCount === 1 ? "1 företag" : `${businessCount} företag`}
                  </Text>
                </View>
                {redeemedCount > 0 && (
                  <View style={s.statItem}>
                    <Check size={13} color={GOLD} strokeWidth={2} />
                    <Text style={s.statText}>
                      {redeemedCount === 1 ? "1 inlöst" : `${redeemedCount} inlösta`}
                    </Text>
                  </View>
                )}
              </View>

              {!isMember && (
                <TouchableOpacity
                  style={s.heroCta}
                  activeOpacity={0.9}
                  onPress={() => router.push("/settings/pass-buy" as any)}
                >
                  <Text style={s.heroCtaText}>Skaffa Österlenpasset</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Kategorifilter ── */}
          <View style={{ marginTop: 26 }}>
            <CategoryChips chips={OFFER_FILTERS} activeId={activeFilter} onChange={setActiveFilter} />
          </View>

          {/* ── Erbjudandekort ── */}
          <View style={s.list}>
            {sorted.map((offer) => (
              <OfferListCard
                key={offer.id}
                offer={offer}
                redemptions={redemptions}
                onPress={() => handleCardPress(offer)}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <OfferDrawer
        visible={drawerPlaceId != null}
        placeId={drawerPlaceId ?? 0}
        onClose={() => setDrawerPlaceId(null)}
      />
    </View>
  );
}

// ─── Ett erbjudandekort i listan ────────────────────────────────────────────────

function OfferListCard({
  offer,
  redemptions,
  onPress,
}: {
  offer: Offer;
  redemptions: { offer_id: string; activated_at: string }[];
  onPress: () => void;
}) {
  const eligibility = offerEligibility(offer, redemptions);
  const badge = getBadge(offer, eligibility);
  const imageUrl = offer.image_url ?? offer.place?.logo_url ?? null;

  return (
    <TouchableOpacity style={oc.card} activeOpacity={0.92} onPress={onPress}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#242424" }]} />
      )}

      {/* Gradient-overlay — mörkare mot botten där texten ligger.
          Kraftigare om erbjudandet är förbrukat, ger "avstängd"-känsla
          utan att behöva gråskala (kräver ett bildfilter-bibliotek vi inte har). */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <SvgGrad id={`cardFade${offer.id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor="#06060A" stopOpacity={eligibility.canUse ? 0.15 : 0.55} />
            <Stop offset="45%"  stopColor="#06060A" stopOpacity={eligibility.canUse ? 0.20 : 0.60} />
            <Stop offset="100%" stopColor="#06060A" stopOpacity={eligibility.canUse ? 0.92 : 0.95} />
          </SvgGrad>
        </Defs>
        <SvgRect width="100%" height="100%" fill={`url(#cardFade${offer.id})`} />
      </Svg>

      {/* Badge */}
      <View style={[oc.badge, badge.tone === "muted" && oc.badgeMuted]}>
        {badge.Icon && <badge.Icon size={11} color={badge.tone === "muted" ? "rgba(255,255,255,0.6)" : GOLD_LT} strokeWidth={2} />}
        <Text style={[oc.badgeText, badge.tone === "muted" && oc.badgeTextMuted]}>{badge.label}</Text>
      </View>

      {/* Logotyp */}
      {offer.place?.logo_url && (
        <View style={oc.logoWrap}>
          <Image source={{ uri: offer.place.logo_url }} style={oc.logo} resizeMode="cover" />
        </View>
      )}

      {/* Botteninnehåll */}
      <View style={oc.bottom}>
        {!!offer.category && <Text style={oc.category}>{offer.category.toUpperCase()}</Text>}
        <Text style={oc.placeName} numberOfLines={1}>{offer.place?.name ?? "Österlen"}</Text>
        <Text style={oc.dealText} numberOfLines={1}>{offer.title}</Text>
        <View style={oc.savingsPill}>
          <Text style={oc.savingsText}>{offerSavingsLabel(offer)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function getBadge(offer: Offer, eligibility: ReturnType<typeof offerEligibility>) {
  if (!eligibility.canUse) {
    return { label: "Inlöst", tone: "muted" as const, Icon: Check };
  }
  if (offer.expires_at) {
    const hoursLeft = (new Date(offer.expires_at).getTime() - Date.now()) / 3_600_000;
    if (hoursLeft > 0 && hoursLeft <= 72) {
      return { label: "Snart slut", tone: "gold" as const, Icon: Clock };
    }
  }
  const hoursOld = (Date.now() - new Date(offer.created_at).getTime()) / 3_600_000;
  if (hoursOld <= 72) return { label: "Nytt", tone: "gold" as const, Icon: undefined };
  if (estimateOfferValue(offer) >= 200) return { label: "Populärt", tone: "gold" as const, Icon: Flame };
  return { label: "Exklusivt", tone: "glass" as const, Icon: Crown };
}

const s = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    height: 72, paddingHorizontal: 16, gap: 12,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(197,160,89,0.10)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.22)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, textAlign: "center" },
  emptyBody: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, textAlign: "center", lineHeight: 19 },

  scroll: { paddingBottom: 60 },

  heroOuter: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Medlemskap-kortet — enkel mörk ruta med guldkant, ingen glöd. Status till
  // vänster, ditt riktiga kort litet och vinklat till höger. Ren visningsyta,
  // inte tryckbar — bara View, ingen TouchableOpacity/navigering.
  membershipCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 20,
    paddingTop: 14, paddingBottom: 18, paddingLeft: 20, paddingRight: 8,
    borderWidth: 1,
    borderColor: "rgba(197,160,89,0.30)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },
  membershipLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10.5, color: "rgba(255,255,255,0.40)", letterSpacing: 1.8 },
  membershipTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG, marginTop: 4 },
  membershipStatusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  statusDotActive: { backgroundColor: GREEN },
  membershipStatus: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: MUTED },
  membershipStatusActive: { color: GREEN },

  // Mini-kortet: samma perspective/rotateY-teknik som kortets egen flip,
  // bara statisk, nedskalad och icke-interaktiv (pointerEvents none).
  // Skjuts in längre från högerkanten (marginRight) och nudgas ytterligare
  // åt vänster med en translateX i transform-kedjan.
  miniCardBox: {
    width: 96, height: 104,
    marginRight: 18,
    alignItems: "center", justifyContent: "center",
  },
  miniCardTilt: {
    width: CARD_W, height: CARD_H,
    transform: [
      { perspective: 700 },
      { scale: 0.40 },
      { rotateY: "-18deg" },
      { rotateX: "5deg" },
      { translateX: -18 },
    ],
    // Skugga på den roterade ytan själv (inte boxen runt om) — det är det
    // som säljer 3D-känslan, annars ser skuggan ut som en rak rektangel
    shadowColor: "#000",
    shadowOffset: { width: -10, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },

  // Värde-infon — ligger direkt på sidans bakgrund, inget eget kort
  valueSection: {
    alignItems: "flex-start",
    marginTop: 22,
  },
  heroLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 2.4, marginBottom: 2 },
  heroDescription: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED,
    marginTop: 10, lineHeight: 19,
  },
  statRow: { flexDirection: "row", gap: 18, marginTop: 12 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: FG },

  heroCta: {
    marginTop: 18, height: 50, paddingHorizontal: 28,
    borderRadius: 14,
    alignSelf: "flex-start",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(197,160,89,0.16)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.45)",
  },
  heroCtaText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD },

  list: { padding: 20, paddingTop: 16, gap: 14 },
});

const oc = StyleSheet.create({
  card: {
    height: 230,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: CARD,
    borderWidth: 0.5,
    borderColor: "rgba(230,199,122,0.30)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  badge: {
    position: "absolute", top: 14, left: 14,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(230,199,122,0.45)",
  },
  badgeMuted: { borderColor: "rgba(255,255,255,0.20)" },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: GOLD_LT, letterSpacing: 0.6 },
  badgeTextMuted: { color: "rgba(255,255,255,0.60)" },

  logoWrap: {
    position: "absolute", top: 14, right: 14,
    width: 36, height: 36, borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(230,199,122,0.55)",
    backgroundColor: "#1A1A1D",
  },
  logo: { width: "100%", height: "100%" },

  bottom: { position: "absolute", left: 16, right: 16, bottom: 14, gap: 2 },
  category: { fontFamily: "Inter_600SemiBold", fontSize: 9.5, color: GOLD_LT, letterSpacing: 1.4 },
  placeName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 19, color: "#FFFFFF", marginTop: 2 },
  dealText: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.70)" },
  savingsPill: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: GOLD_LT,
  },
  savingsText: { fontFamily: "Inter_700Bold", fontSize: 11.5, color: "#0B0B0D" },
});
