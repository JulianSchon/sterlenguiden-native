/**
 * OfferDrawer — panelen med en plats erbjudanden.
 *
 * Här kopplas hela aktiveringskedjan ihop:
 *   håll-inne-knapp → bekräftelseruta → 60-sekundersskärm
 *
 * Panelen går medvetet inte att svepa bort medan bekräftelse- eller
 * aktiv vy ligger ovanpå — man ska inte kunna råka stänga ner ett
 * erbjudande som precis börjat ticka.
 *
 * Den som inte har Österlenpasset ser exakt samma panel, men i stället för
 * håll-inne-knappen står "Skaffa Österlenpasset".
 */
import { useRef, useState } from "react";
import {
  Modal, View, Text, Image, ScrollView, Pressable, StyleSheet, Dimensions,
  Animated, PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Crown, X, Clock, Timer, FileText, Check } from "lucide-react-native";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions, useActivateOffer } from "@/hooks/useOfferRedemptions";
import { useMembership } from "@/hooks/useMembership";
import { useIsBusiness } from "@/hooks/useUserRole";
import { offerEligibility, offerSavingsLabel, ACTIVE_SECS, type Offer } from "@/lib/offers";
import { formatDate } from "@/i18n/dates";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { HoldToActivate } from "./HoldToActivate";
import { OfferConfirmDialog } from "./OfferConfirmDialog";
import { ActiveOfferView } from "./ActiveOfferView";

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
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createSheetStyles);
  const insets = useSafeAreaInsets();
  const { data: offers = [] } = useOffers(placeId);
  const { data: redemptions = [] } = useOfferRedemptions();
  const { isMember } = useMembership();
  const { isBusiness } = useIsBusiness();
  const activate = useActivateOffer();

  const [pending, setPending] = useState<Offer | null>(null);
  const [active, setActive] = useState<{ offer: Offer; activatedAt: number } | null>(null);

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

  const handleGetPass = () => {
    onClose();
    router.push("/settings/pass-buy");
  };

  return (
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
            <X size={20} color={colors.muted} strokeWidth={2} />
          </Pressable>

          {/* Greppyta för svep-ner: strecket OCH hela header-raden.
              Bara det tunna strecket är för litet att träffa. */}
          <View {...pan.panHandlers}>
            <View style={s.dragArea}>
              <View style={s.handle} />
            </View>

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
                <Text style={s.placeName} numberOfLines={1}>
                  {place?.name ?? t("offers.drawer.place")}
                </Text>
                <Text style={s.offerCount}>
                  {offers.length === 1
                    ? t("offers.drawer.countOne")
                    : t("offers.drawer.count", { count: offers.length })}
                </Text>
              </View>
            </View>
          </View>

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
                onGetPass={handleGetPass}
              />
            ))}

            {offers.length === 0 && <Text style={s.empty}>{t("offers.drawer.none")}</Text>}
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
            placeName={active.offer.place?.name ?? ""}
            placeLogoUrl={active.offer.place?.logo_url ?? null}
            dealText={active.offer.title}
            onClose={() => setActive(null)}
          />
        )}
      </View>
    </Modal>
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
  onGetPass,
}: {
  offer: Offer;
  index: number;
  redemptions: { offer_id: string; activated_at: string }[];
  isMember: boolean;
  isBusiness: boolean;
  onActivate: () => void;
  onGetPass: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const c = useThemedStyles(createCardStyles);
  const eligibility = offerEligibility(offer, redemptions);
  const savings = offerSavingsLabel(offer);

  const validLabel = offer.expires_at
    ? t("offers.drawer.valid", { date: formatDate(offer.expires_at, "d MMM yyyy") })
    : t("offers.drawer.forever");

  // Företagskonton kan aldrig lösa in — de skulle kunna aktivera sina egna
  const blocked = isBusiness
    ? t("offers.drawer.business")
    : isMember && !eligibility.canUse
      ? eligibility.reason
      : null;

  return (
    <View style={c.card}>
      <View style={c.pill}>
        <Crown size={10} color={colors.goldText} strokeWidth={2} />
        <Text style={c.pillText}>{t("offers.drawer.offerN", { n: index + 1 })}</Text>
      </View>

      <Text style={c.title}>{offer.title}</Text>

      {!!offer.description && offer.description !== offer.title && (
        <Text style={c.description}>{offer.description}</Text>
      )}

      {savings && (
        <View style={c.savingsPill}>
          <Text style={c.savingsText}>{savings}</Text>
        </View>
      )}

      <View style={c.metaBlock}>
        <MetaRow icon={<Clock size={12} color={colors.goldText} strokeWidth={2} />} text={validLabel} />
        <MetaRow
          icon={<Timer size={12} color={colors.goldText} strokeWidth={2} />}
          text={t("offers.drawer.activeSecs", { secs: ACTIVE_SECS })}
        />
        <MetaRow icon={<FileText size={12} color={colors.goldText} strokeWidth={2} />} text={eligibility.ruleLabel} />
      </View>

      <View style={{ marginTop: 20 }}>
        {blocked ? (
          <View style={c.blockedBox}>
            <Check size={16} color={colors.muted} strokeWidth={2.5} />
            <Text style={c.blockedText}>{blocked}</Text>
          </View>
        ) : isMember ? (
          <HoldToActivate onComplete={onActivate} />
        ) : (
          <Pressable
            onPress={onGetPass}
            style={({ pressed }) => [c.buyBox, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <Crown size={15} color={colors.onGold} strokeWidth={2} />
            <Text style={c.buyText}>{t("offers.drawer.getPass")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  const c = useThemedStyles(createCardStyles);
  return (
    <View style={c.metaRow}>
      {icon}
      <Text style={c.metaText}>{text}</Text>
    </View>
  );
}

const createSheetStyles = (c: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  sheet: {
    height: SH * 0.88,
    backgroundColor: c.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: c.border,
  },
  dragArea: { paddingTop: 10, paddingBottom: 8, alignItems: "center" },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.borderStrong },
  closeBtn: { position: "absolute", top: 16, right: 16, zIndex: 2, padding: 6 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
  },
  logoCircle: {
    width: 56, height: 56, borderRadius: 28,
    overflow: "hidden",
    backgroundColor: c.tile,
    borderWidth: 1, borderColor: c.goldBorder,
    alignItems: "center", justifyContent: "center",
  },
  logo: { width: "100%", height: "100%" },
  logoFallback: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: c.goldText },
  placeName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: c.text },
  offerCount: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: c.goldText,
    letterSpacing: 1.98, marginTop: 2, textTransform: "uppercase",
  },

  list: { padding: 20, paddingTop: 8, gap: 16 },
  empty: {
    fontFamily: "Inter_400Regular", fontSize: 14,
    color: c.muted, textAlign: "center", marginTop: 40,
  },
});

const createCardStyles = (c: ThemeColors) => StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 20,
    backgroundColor: c.tile,
    borderWidth: 1, borderColor: c.goldBorder,
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: c.goldSoft,
    borderWidth: 1, borderColor: c.goldBorder,
    marginBottom: 12,
  },
  pillText: {
    fontFamily: "Inter_600SemiBold", fontSize: 9.5, color: c.goldText,
    letterSpacing: 1.62, textTransform: "uppercase",
  },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 21, color: c.text, lineHeight: 27 },
  description: {
    fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 20,
    color: c.muted, marginTop: 8,
  },
  // Fast höjd så texten centreras exakt i pillen
  savingsPill: {
    alignSelf: "flex-start",
    marginTop: 16,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: c.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  savingsText: { fontFamily: "Inter_700Bold", fontSize: 12, color: c.onGold, lineHeight: 16 },

  // Radbrytande rad, inte staplade rader — tre korta fakta ska få plats på två
  metaBlock: { marginTop: 18, flexDirection: "row", flexWrap: "wrap", columnGap: 20, rowGap: 9 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: c.muted },

  blockedBox: {
    height: 52, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: c.fill,
    borderWidth: 1, borderColor: c.border,
  },
  blockedText: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.muted },

  buyBox: {
    height: 52, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: c.gold,
  },
  buyText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.onGold },
});
