/**
 * OfferDrawer — panelen med en plats erbjudanden.
 *
 * Här kopplas hela aktiveringskedjan ihop:
 *   håll-inne-knapp → bekräftelseruta → 60-sekundersskärm
 *
 * Panelen går medvetet inte att svepa bort medan bekräftelse- eller
 * aktiv vy ligger ovanpå — man ska inte kunna råka stänga ner ett
 * erbjudande som precis börjat ticka.
 */
import { useRef, useState } from "react";
import {
  Modal, View, Text, Image, ScrollView, Pressable, StyleSheet, Dimensions,
  Animated, PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Crown, X, Clock, Timer, FileText, Check } from "lucide-react-native";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions, useActivateOffer } from "@/hooks/useOfferRedemptions";
import { useProfile } from "@/hooks/useProfile";
import { useIsBusiness } from "@/hooks/useUserRole";
import { offerEligibility, offerSavingsLabel, ACTIVE_SECS, type Offer } from "@/lib/offers";
import { HoldToActivate } from "./HoldToActivate";
import { OfferConfirmDialog } from "./OfferConfirmDialog";
import { ActiveOfferView } from "./ActiveOfferView";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const FG      = "#F5F1E8";
const GOLD    = "#C5A059";
const GOLD_LT = "#E8C674";

const { height: SH } = Dimensions.get("window");

export function OfferDrawer({
  visible,
  placeId,
  onClose,
}: {
  visible: boolean;
  placeId: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { data: offers = [] } = useOffers(placeId);
  const { data: redemptions = [] } = useOfferRedemptions();
  const { data: profile } = useProfile();
  const { isBusiness } = useIsBusiness();
  const activate = useActivateOffer();

  const [pending, setPending] = useState<Offer | null>(null);
  const [active, setActive] = useState<{ offer: Offer; activatedAt: number } | null>(null);

  const isMember = !!profile?.is_member;
  const place = offers[0]?.place ?? null;

  // Svep ner för att stänga. Låses medan bekräftelse/aktiv vy ligger ovanpå —
  // ett erbjudande som börjat ticka får inte kunna svepas bort av misstag.
  const dragY = useRef(new Animated.Value(0)).current;

  // Refs: PanResponder skapas bara en gång och skulle annars frysa fast
  // gamla värden i sin closure
  const lockedRef  = useRef(false);
  lockedRef.current = !!pending || !!active;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        !lockedRef.current && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          Animated.timing(dragY, { toValue: SH, duration: 180, useNativeDriver: true })
            .start(() => { dragY.setValue(0); onCloseRef.current(); });
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    })
  ).current;

  const handleConfirm = async () => {
    const offer = pending;
    if (!offer) return;
    setPending(null);

    const activatedAt = Date.now();
    activate.mutate(offer.id);

    // Kort paus så bekräftelserutan hinner fada ut innan helskärmen tar över
    setTimeout(() => setActive({ offer, activatedAt }), 180);
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        // Blockeras medan något ligger ovanpå — annars kan man svepa bort
        // panelen mitt i en aktivering
        onRequestClose={() => { if (!pending && !active) onClose(); }}
      >
        <View style={s.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => { if (!pending && !active) onClose(); }}
          />

          <Animated.View
            style={[
              s.sheet,
              { paddingBottom: insets.bottom + 12, transform: [{ translateY: dragY }] },
            ]}
          >
            <Pressable style={s.closeBtn} onPress={onClose} hitSlop={10}>
              <X size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </Pressable>

            {/* Greppyta för svep-ner: strecket OCH hela header-raden.
                Bara det tunna strecket är för litet att träffa. */}
            <View {...pan.panHandlers}>
              <View style={s.dragArea}>
                <View style={s.handle} />
              </View>

              {/* ── Header ── */}
              <View style={s.header}>
              <View style={s.logoCircle}>
                {place?.logo_url ? (
                  <Image source={{ uri: place.logo_url }} style={s.logo} resizeMode="cover" />
                ) : (
                  <Text style={s.logoFallback}>
                    {(place?.name ?? "?").charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.placeName} numberOfLines={1}>{place?.name ?? "Plats"}</Text>
                <Text style={s.offerCount}>
                  {offers.length === 1 ? "1 AKTIVT ERBJUDANDE" : `${offers.length} AKTIVA ERBJUDANDEN`}
                </Text>
              </View>
              </View>
            </View>

            {/* ── Erbjudanden ── */}
            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              {offers.map((offer, i) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  index={i}
                  redemptions={redemptions}
                  isMember={isMember}
                  isBusiness={isBusiness}
                  onActivate={() => setPending(offer)}
                />
              ))}

              {offers.length === 0 && (
                <Text style={s.empty}>Inga aktiva erbjudanden just nu.</Text>
              )}
            </ScrollView>
          </Animated.View>

          {/* Överläggen ligger INUTI drawerns modal — iOS visar inte en
              modal ovanpå en annan, så egna Modal-fönster hade blivit osynliga */}
          <OfferConfirmDialog
            visible={!!pending}
            dealText={pending?.title ?? ""}
            onCancel={() => setPending(null)}
            onConfirm={handleConfirm}
          />

          {active && (
            <ActiveOfferView
              visible
              activatedAt={active.activatedAt}
              placeName={active.offer.place?.name ?? "Plats"}
              placeLogoUrl={active.offer.place?.logo_url ?? null}
              dealText={active.offer.title}
              onClose={() => setActive(null)}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

// ─── Ett erbjudandekort ───────────────────────────────────────────────────────

function OfferCard({
  offer,
  index,
  redemptions,
  isMember,
  isBusiness,
  onActivate,
}: {
  offer: Offer;
  index: number;
  redemptions: { offer_id: string; activated_at: string }[];
  isMember: boolean;
  isBusiness: boolean;
  onActivate: () => void;
}) {
  const eligibility = offerEligibility(offer, redemptions);

  const validLabel = offer.expires_at
    ? `Giltigt: ${format(new Date(offer.expires_at), "d MMM yyyy", { locale: sv })}`
    : "Tillsvidare";

  // Företagskonton kan aldrig lösa in — de skulle kunna aktivera sina egna
  const blocked = isBusiness
    ? "Ej tillgängligt för företagskonton"
    : !eligibility.canUse
      ? eligibility.reason
      : null;

  return (
    <View style={c.card}>
      <View style={c.pill}>
        <Crown size={10} color={GOLD_LT} strokeWidth={2} />
        <Text style={c.pillText}>ERBJUDANDE {index + 1}</Text>
      </View>

      <Text style={c.title}>{offer.title}</Text>

      {!!offer.description && offer.description !== offer.title && (
        <Text style={c.description}>{offer.description}</Text>
      )}

      <View style={c.savingsPill}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGrad id={`savings${index}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%"   stopColor={GOLD_LT} />
              <Stop offset="100%" stopColor={GOLD} />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill={`url(#savings${index})`} />
        </Svg>
        <Text style={c.savingsText}>{offerSavingsLabel(offer)}</Text>
      </View>

      <View style={c.metaBlock}>
        <MetaRow icon={<Clock size={12} color={GOLD} strokeWidth={2} />} text={validLabel} />
        <MetaRow icon={<Timer size={12} color={GOLD} strokeWidth={2} />} text={`${ACTIVE_SECS} s aktivt`} />
        <MetaRow icon={<FileText size={12} color={GOLD} strokeWidth={2} />} text={eligibility.ruleLabel} />
      </View>

      <View style={{ marginTop: 20 }}>
        {blocked ? (
          <View style={c.blockedBox}>
            <Check size={16} color="rgba(255,255,255,0.45)" strokeWidth={2.5} />
            <Text style={c.blockedText}>{blocked}</Text>
          </View>
        ) : isMember ? (
          <HoldToActivate onComplete={onActivate} />
        ) : (
          <View style={c.buyBox}>
            <Text style={c.buyText}>Köp Österlenpasset</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={c.metaRow}>
      {icon}
      <Text style={c.metaText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    height: SH * 0.88,
    backgroundColor: "#141416",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  dragArea: { paddingTop: 10, paddingBottom: 8, alignItems: "center" },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  closeBtn: { position: "absolute", top: 16, right: 16, zIndex: 2, padding: 6 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
  },
  logoCircle: {
    width: 56, height: 56, borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#1F1F22",
    borderWidth: 1, borderColor: "rgba(230,199,122,0.40)",
    alignItems: "center", justifyContent: "center",
  },
  logo: { width: "100%", height: "100%" },
  logoFallback: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: GOLD_LT },
  placeName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG },
  offerCount: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: GOLD_LT,
    letterSpacing: 1.98, marginTop: 2,
  },

  list: { padding: 20, paddingTop: 8, gap: 16 },
  empty: {
    fontFamily: "Inter_400Regular", fontSize: 14,
    color: "rgba(255,255,255,0.45)", textAlign: "center", marginTop: 40,
  },
});

const c = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1, borderColor: "rgba(230,199,122,0.22)",
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(212,168,79,0.10)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.30)",
    marginBottom: 12,
  },
  pillText: {
    fontFamily: "Inter_600SemiBold", fontSize: 9.5, color: GOLD_LT,
    letterSpacing: 1.62,
  },
  title: {
    fontFamily: "PlayfairDisplay_700Bold", fontSize: 21, color: FG, lineHeight: 27,
  },
  description: {
    fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 20,
    color: "rgba(255,255,255,0.60)", marginTop: 8,
  },
  // Fast höjd: utan den klipps texten av när SVG-gradienten ligger absolut inuti
  savingsPill: {
    alignSelf: "flex-start",
    marginTop: 16,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  savingsText: {
    fontFamily: "Inter_700Bold", fontSize: 12, color: "#0B0B0D",
    lineHeight: 16,
  },

  // Radbrytande rad, inte staplade rader — tre korta fakta ska få plats på två
  metaBlock: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 20,
    rowGap: 9,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.55)" },

  blockedBox: {
    height: 48, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  blockedText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.45)" },

  buyBox: {
    height: 48, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(197,160,89,0.14)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.35)",
  },
  buyText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD },
});
