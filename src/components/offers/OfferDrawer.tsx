/**
 * OfferDrawer — panelen med en plats erbjudanden.
 *
 * Öppningen är en riven biljett: sidobandet lossnar från biljetten i listan (längs den
 * perforerade linjen), vrids från stående till liggande och blir panelens topp, medan
 * panelen glider upp under det. Stänger man går det åt andra hållet: bandet flyger tillbaka
 * och klickar fast på sin biljett. Utan biljett att riva (platssidan) glider bandet och
 * panelen upp underifrån på samma sätt.
 *
 * Panelen är ett lager på sidan, inte en Modal, så att bandet kan flyga från listan in i den.
 * Lagret måste ligga som barn direkt under en helskärmsyta (se SettingsScreen `overlay`).
 * Hela rörelsen styrs av ett enda tal, `p` (0 = biljetten, 1 = öppen panel), som också är
 * det man drar i när man sveper panelen nedåt: man backar bokstavligen animationen.
 *
 * Här kopplas också aktiveringskedjan ihop: håll-inne-knapp → bekräftelseruta → 60-sekundersskärm.
 * Panelen går medvetet inte att stänga medan bekräftelse- eller aktiv vy ligger ovanpå.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, ScrollView, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue,
  withSpring, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas, Fill, LinearGradient, vec } from "@shopify/react-native-skia";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Crown, X, Clock, Timer, FileText, Check } from "lucide-react-native";
import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions, useActivateOffer } from "@/hooks/useOfferRedemptions";
import { useMembership } from "@/hooks/useMembership";
import { useIsBusiness } from "@/hooks/useUserRole";
import { offerEligibility, offerSavingsLabel, ACTIVE_SECS, type Offer } from "@/lib/offers";
import { formatDate } from "@/i18n/dates";
import { findCategory, ticketColors } from "@/theme/categories";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { HoldToActivate } from "./HoldToActivate";
import { OfferConfirmDialog } from "./OfferConfirmDialog";
import { ActiveOfferView } from "./ActiveOfferView";

/** Sidobandets plats på skärmen (fönsterkoordinater) när biljetten trycktes */
export interface OriginRect { x: number; y: number; w: number; h: number }

// Måtten på sidobandet i biljetten (måste stämma med OfferListCard i app/offers.tsx)
const STUB_ICON_Y = 35;   // ikonens mitt, från bandets överkant
const STUB_TEXT_Y = 113;  // textens mitt, från bandets överkant
const STUB_TEXT_W = 114;  // hur bred text som ryms på högkant
const STUB_RADIUS = 18;

const BAND_H = 76;
const BAND_RADIUS = 24;
const TEXT_BOX_W = 260;
const OPEN_MS = 880;
const CLOSE_MS = 720;
const DRAG_RANGE = 420;    // hur långt man drar för att backa hela animationen
const ease = Easing.bezier(0.3, 0, 0.2, 1);
const easeOut = Easing.out(Easing.cubic);

export function OfferDrawer({
  visible,
  placeId,
  focusOffer,
  origin,
  onClose,
}: {
  visible: boolean;
  placeId: number;
  /** Erbjudandet som trycktes: hamnar först och ger bandet dess kategori från första bildrutan */
  focusOffer?: Offer | null;
  /** Var biljettens sidoband satt. Utan den öppnas panelen med en vanlig glidning underifrån. */
  origin?: OriginRect | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const s = useThemedStyles(createSheetStyles);
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { data: rawOffers = [] } = useOffers(placeId);
  const { data: redemptions = [] } = useOfferRedemptions();
  const { isMember } = useMembership();
  const { isBusiness } = useIsBusiness();
  const activate = useActivateOffer();

  const [pending, setPending] = useState<Offer | null>(null);
  const [active, setActive] = useState<{ offer: Offer; activatedAt: number } | null>(null);
  const locked = !!pending || !!active;

  const offers = useMemo(
    () => [...rawOffers].sort((a, b) => Number(b.id === focusOffer?.id) - Number(a.id === focusOffer?.id)),
    [rawOffers, focusOffer?.id],
  );
  const place = offers[0]?.place ?? null;
  const bandCategory = (focusOffer ?? rawOffers[0])?.category ?? null;
  const CategoryIcon = findCategory(bandCategory)?.icon ?? Crown;
  const [gradFrom, gradTo] = ticketColors(bandCategory);
  const label = (bandCategory ?? "Österlen").toUpperCase();
  // Etiketten på högkant krymps så den ryms, precis som på biljetten
  const fit = Math.min(1, STUB_TEXT_W / (label.length * 9.8));

  const bandTop = Math.max(insets.top + 10, screenH * 0.1);
  const sheetTop = bandTop + BAND_H;

  // ── Animationen ──
  const p = useSharedValue(0);
  const startP = useSharedValue(0);
  const ready = useSharedValue(0);
  const vert = useSharedValue(0);
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const ow = useSharedValue(0);
  const oh = useSharedValue(0);
  const lockedSV = useSharedValue(false);
  useEffect(() => { lockedSV.value = locked; }, [locked]);
  // Gester och animationer skapas en gång, så de läser onClose via en ref
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible) {
      ready.value = 0;
      p.value = 0;
      return;
    }
    const o = origin ?? { x: 0, y: screenH, w: screenW, h: BAND_H };
    ox.value = o.x; oy.value = o.y; ow.value = o.w; oh.value = o.h;
    vert.value = origin ? 1 : 0;
    p.value = 0;
    ready.value = 1;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    p.value = withTiming(1, { duration: OPEN_MS, easing: ease });
    const landed = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), OPEN_MS * 0.75);
    return () => clearTimeout(landed);
  }, [visible]);

  // Bandet har landat på sin biljett igen: lite klick, sedan lämnar lagret scenen
  const finishClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onCloseRef.current();
  };

  const requestClose = () => {
    if (locked) return;
    p.value = withTiming(0, { duration: Math.max(320, CLOSE_MS * p.value), easing: ease }, (done) => {
      if (done) runOnJS(finishClose)();
    });
  };

  // Svep nedåt backar animationen i takt med fingret
  const makePan = () => Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-30, 30])
    .onStart(() => { cancelAnimation(p); startP.value = p.value; })
    .onUpdate((e) => {
      if (lockedSV.value) return;
      p.value = Math.min(1, Math.max(0, startP.value - e.translationY / DRAG_RANGE));
    })
    .onEnd((e) => {
      if (lockedSV.value || (p.value >= 0.72 && e.velocityY <= 900)) {
        p.value = withSpring(1, { damping: 18, stiffness: 180 });
        return;
      }
      p.value = withTiming(0, { duration: Math.max(320, CLOSE_MS * p.value), easing: ease }, (done) => {
        if (done) runOnJS(finishClose)();
      });
    });
  const bandPan = useMemo(makePan, []);
  const headerPan = useMemo(makePan, []);

  // m: bandets resa från biljetten till panelens topp. rip: det korta ryck när det rivs loss.
  const m = useDerivedValue(() => easeOut(interpolate(p.value, [0.1, 0.72], [0, 1], "clamp")));
  const rip = useDerivedValue(() => interpolate(p.value, [0, 0.1, 0.26], [0, 1, 0], "clamp"));
  const bandW = useDerivedValue(() => ow.value + (screenW - ow.value) * m.value);
  const bandH = useDerivedValue(() => oh.value + (BAND_H - oh.value) * m.value);
  const gradEnd = useDerivedValue(() => vec(0, bandH.value));

  const rootStyle = useAnimatedStyle(() => ({ opacity: ready.value }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.45], [0, 1], "clamp") }));

  const bandStyle = useAnimatedStyle(() => ({
    left: ox.value + (0 - ox.value) * m.value - rip.value * 8,
    top: oy.value + (bandTop - oy.value) * m.value - rip.value * 5,
    width: bandW.value,
    height: bandH.value,
    borderTopLeftRadius: STUB_RADIUS + (BAND_RADIUS - STUB_RADIUS) * m.value,
    borderBottomLeftRadius: STUB_RADIUS * (1 - m.value),
    borderTopRightRadius: BAND_RADIUS * m.value,
    transform: [{ rotate: `${rip.value * -7}deg` }, { scale: 1 + rip.value * 0.05 }],
  }));

  // Etiketten: på högkant på biljetten, rak i bandet
  const labelStyle = useAnimatedStyle(() => {
    const cy = vert.value ? STUB_TEXT_Y + (BAND_H / 2 - STUB_TEXT_Y) * m.value : BAND_H / 2;
    const deg = vert.value ? -90 * (1 - m.value) : 0;
    const sc = vert.value ? fit + (1.1 - fit) * m.value : 1.1;
    return {
      left: bandW.value / 2 - TEXT_BOX_W / 2,
      top: cy - 10,
      transform: [{ rotate: `${deg}deg` }, { scale: sc }],
    };
  });
  // Ikonen ligger ovanför texten på biljetten och till vänster om den i bandet
  const iconStyleStub = useAnimatedStyle(() => ({
    left: bandW.value / 2 - 9,
    top: STUB_ICON_Y - 9 + (BAND_H / 2 - 9 - (STUB_ICON_Y - 9)) * m.value,
    opacity: vert.value ? 1 - Math.min(1, m.value * 2) : 0,
  }));
  const iconStyleBand = useAnimatedStyle(() => ({
    opacity: vert.value ? Math.max(0, m.value * 2 - 1) : 1,
  }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0.85, 1], [0, 1], "clamp") }));

  const sheetStyle = useAnimatedStyle(() => {
    const sp = easeOut(interpolate(p.value, [0.34, 1], [0, 1], "clamp"));
    return { transform: [{ translateY: (1 - sp) * (screenH - sheetTop) }] };
  });

  const handleConfirm = () => {
    const offer = pending;
    if (!offer) return;
    setPending(null);
    const activatedAt = Date.now();
    activate.mutate(offer.id);
    // Kort paus så bekräftelserutan hinner fada ut innan helskärmen tar över
    setTimeout(() => setActive({ offer, activatedAt }), 180);
  };

  const handleGetPass = () => {
    onCloseRef.current();
    router.push("/settings/pass-buy");
  };

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 50 }, rootStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
      </Animated.View>

      {/* Panelen under bandet */}
      <Animated.View style={[s.sheet, { top: sheetTop, paddingBottom: insets.bottom + 12 }, sheetStyle]}>
        <GestureDetector gesture={headerPan}>
          <View style={s.header}>
            <View style={s.logoCircle}>
              {place?.logo_url ? (
                <Image source={{ uri: place.logo_url }} style={s.logo} resizeMode="cover" />
              ) : (
                <Text style={s.logoFallback}>{(place?.name ?? "?").charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.placeName} numberOfLines={1}>{place?.name ?? t("offers.drawer.place")}</Text>
              <Text style={s.offerCount}>
                {offers.length === 1
                  ? t("offers.drawer.countOne")
                  : t("offers.drawer.count", { count: offers.length })}
              </Text>
            </View>
          </View>
        </GestureDetector>

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

      {/* Bandet: biljettens sidoband som blir panelens topp */}
      <GestureDetector gesture={bandPan}>
        <Animated.View style={[s.band, bandStyle]}>
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Fill>
              <LinearGradient start={vec(0, 0)} end={gradEnd} colors={[gradFrom, gradTo]} />
            </Fill>
          </Canvas>
          <Animated.View style={[s.bandIcon, iconStyleStub]} pointerEvents="none">
            <CategoryIcon size={18} color="#FFFFFF" strokeWidth={2} />
          </Animated.View>
          <Animated.View style={[s.bandIcon, { left: 22, top: BAND_H / 2 - 9 }, iconStyleBand]} pointerEvents="none">
            <CategoryIcon size={18} color="#FFFFFF" strokeWidth={2} />
          </Animated.View>
          <Animated.Text style={[s.bandLabel, labelStyle]} numberOfLines={1}>{label}</Animated.Text>
          <Animated.View style={[s.closeBtn, closeStyle]}>
            <Pressable onPress={requestClose} hitSlop={12} disabled={locked}>
              <X size={20} color="#FFFFFF" strokeWidth={2} />
            </Pressable>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Överläggen ligger inuti det här lagret så att de täcker hela skärmen */}
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
    </Animated.View>
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
  backdrop: { backgroundColor: c.overlay },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: c.card,
    borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderColor: c.border,
  },
  band: { position: "absolute", overflow: "hidden" },
  bandIcon: { position: "absolute", width: 18, height: 18 },
  // Textrutan är bredare än etiketten och centreras, så rotationen sker kring etikettens mitt
  bandLabel: {
    position: "absolute", width: TEXT_BOX_W, height: 20, textAlign: "center",
    fontFamily: "Montserrat_700Bold", fontSize: 11.5, letterSpacing: 2, lineHeight: 20, color: "#FFFFFF",
  },
  closeBtn: { position: "absolute", top: BAND_H / 2 - 12, right: 18, width: 24, height: 24, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
  },
  logoCircle: {
    width: 56, height: 56, borderRadius: 28,
    overflow: "hidden",
    backgroundColor: c.tile,
    borderWidth: 1, borderColor: c.goldBorder,
    alignItems: "center", justifyContent: "center",
  },
  logo: { width: "100%", height: "100%", transform: [{ scale: 1.2 }] },
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
