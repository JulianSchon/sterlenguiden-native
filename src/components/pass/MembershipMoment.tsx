/**
 * Ögonblicket när man blir medlem: en enda lugn rörelse, inga tryck för att "öppna" något — man vet
 * redan vad som händer när man löser in en kod (och senare: när man köper passet).
 *
 * Sidan tonar till temats bakgrund, ens kort glider fram och vänds till baksidan, nu upplåst: guldet
 * som rör sig, namnet och klockan, precis som personalen ser det i kassan. När kortet landar kommer
 * smällen, samma som i appens andra belöningar: guldstrålar, ett sken och konfetti, med vibration
 * (och ett klick när ljuden finns). Sedan texten och knappen. Är passet en gåva står det vem den är
 * från, och hälsningen.
 *
 * Kortfotot på baksidan krävs: utan det kan personalen inte känna igen en. Saknas det står vad fotot
 * är till för, och "Lägg till kortfoto" är det enda valet — först när fotot finns kommer "Se dina
 * förmåner".
 *
 * Tre varianter: aktiverat (kortet vänds), tiden sparad (passet förnyas redan, kortet vänds inte)
 * och startar senare (en gåva med startdatum, kortet förblir låst tills dess).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { CalendarClock, Gift, ScanFace, ShieldCheck } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl, useCardPhotoUrl } from "@/hooks/useAvatarUrl";
import { useChangeCardPhoto } from "@/hooks/useCardPhoto";
import { usePhotoMenu } from "@/hooks/usePhotoMenu";
import { CARD_H, CARD_W, MemberCard } from "@/components/MemberCard";
import { GoldButton, TextButton } from "@/components/auth/AuthParts";
import { Confetti, GOLD, GoldRays } from "@/components/checkin/CelebrationFx";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { formatDate } from "@/i18n/dates";
import { playSound } from "@/lib/sounds";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export type MomentKind = "activated" | "saved" | "scheduled";

export interface MomentInfo {
  kind: MomentKind;
  /** Passet gäller till (aktiverat) eller börjar (startar senare) */
  date: string | null;
  /** Dagar som sparats (tiden sparad) */
  days: number;
  /** Vem gåvan är från, och hälsningen (bara när någon annan köpt den) */
  fromName?: string | null;
  message?: string | null;
}

const ease = Easing.out(Easing.cubic);
/** Från att kortet börjar vändas tills det landar på baksidan */
const FLIP_LAND_MS = 520;

export function MembershipMoment({
  info, onOffers, onDone,
}: {
  info: MomentInfo | null;
  onOffers: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const cardPhotoUrl = useCardPhotoUrl();
  const changeCardPhoto = useChangeCardPhoto();
  const openPhotoMenu = usePhotoMenu(changeCardPhoto.mutateAsync, t("pass.card.title"));
  const needsPhoto = !profile?.profile_image_url;
  const kind = info?.kind ?? "activated";

  const backdrop = useSharedValue(0);
  const card = useSharedValue(0);
  const text = useSharedValue(0);
  const actions = useSharedValue(0);
  // Smällen: strålar, sken och konfetti när kortet landar
  const rays = useSharedValue(0);
  const glow = useSharedValue(0);
  const burst = useSharedValue(0);
  const [reveal, setReveal] = useState(false);

  // Start: när modalen syns och kortets design laddats — båda måste vara klara
  const shown = useRef(false);
  const ready = useRef(false);
  const started = useRef(false);
  const start = useCallback(() => {
    if (started.current || !shown.current || !ready.current) return;
    started.current = true;
    const impact = () => {
      playSound("unlock");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (reduced) return;
      rays.value = withTiming(1, { duration: 900, easing: ease });
      glow.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0.6, { duration: 900 }));
      burst.value = withTiming(1, { duration: 1500, easing: Easing.linear });
    };
    const flip = () => {
      if (kind !== "activated") return;
      setReveal(true);
      setTimeout(impact, FLIP_LAND_MS);
    };
    backdrop.value = withTiming(1, { duration: 280 });
    card.value = withDelay(180, withTiming(1, { duration: 520, easing: ease }, (done) => {
      if (done) runOnJS(flip)();
    }));
    const textAt = kind === "activated" ? 1500 : 800;
    text.value = withDelay(textAt, withTiming(1, { duration: 460, easing: ease }));
    actions.value = withDelay(textAt + 260, withTiming(1, { duration: 420, easing: ease }));
  }, [kind, reduced, backdrop, card, text, actions, rays, glow, burst]);
  // Laddar inte kortets bild börjar det ändå
  useEffect(() => {
    if (!info) return;
    const timer = setTimeout(() => { ready.current = true; start(); }, 1500);
    return () => clearTimeout(timer);
  }, [info, start]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: card.value,
    transform: [{ translateY: (1 - card.value) * 40 }, { scale: 0.94 + card.value * 0.06 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: (1 - text.value) * 10 }] }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actions.value }));

  const cardW = Math.min(width - 48, 380);
  const cardH = CARD_H * (cardW / CARD_W);
  const raysSize = Math.hypot(width, height) * 1.05;
  const glowSize = width * 1.2;
  const memberCard = useMemo(() => (
    <MemberCard
      width={cardW}
      displayName={profile?.display_name ?? ""}
      isMember={kind !== "scheduled"}
      memberSince={profile?.created_at ? formatDate(profile.created_at, "MMMM yyyy") : null}
      cardColor={profile?.card_color}
      avatarUrl={avatarUrl}
      circleColor={profile?.circle_color}
      avatarRing={profile?.avatar_ring}
      profileImageUrl={cardPhotoUrl}
      onBuyPress={() => {}}
      lockedBack={kind === "scheduled"}
      revealBack={reveal}
      onReady={() => { ready.current = true; start(); }}
    />
  ), [cardW, profile, avatarUrl, cardPhotoUrl, kind, reveal, start]);

  const title = kind === "saved" ? t("pass.moment.savedTitle")
    : kind === "scheduled" ? t("pass.moment.scheduledTitle", { date: info?.date ? formatDate(info.date, "d MMMM") : "" })
      : t("pass.moment.title");
  const body = kind === "saved" ? t("pass.moment.savedBody", { days: info?.days ?? 0 })
    : kind === "scheduled" ? t("pass.moment.scheduledBody")
      : info?.date ? t("pass.moment.until", { date: formatDate(info.date, "d MMMM yyyy") }) : "";
  const photoRows = [
    { icon: ScanFace, text: t("pass.moment.photoFace") },
    { icon: ShieldCheck, text: t("pass.moment.photoWhy") },
    { icon: CalendarClock, text: t("pass.moment.photoMonthly") },
  ];

  return (
    <Modal
      visible={!!info}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={() => { shown.current = true; start(); }}
      // Fotot måste finnas: tillbaka-knappen stänger inte förrän det gör det
      onRequestClose={() => { if (!needsPhoto) onDone(); }}
    >
      <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
      <View style={[s.root, { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={s.center}>
          {/* Kortet med smällen bakom (strålar och sken) och konfettin som skjuts ut ur det */}
          <View style={{ width: cardW, height: cardH }}>
            <View pointerEvents="none" style={[s.anchor, { left: (cardW - raysSize) / 2, top: (cardH - raysSize) / 2, width: raysSize, height: raysSize }]}>
              <GoldRays size={raysSize} visible={rays} color="#F5D88A" />
            </View>
            <Reanimated.View pointerEvents="none" style={[s.anchor, { left: (cardW - glowSize) / 2, top: (cardH - glowSize) / 2, width: glowSize, height: glowSize }, glowStyle]}>
              <RadialGlow size={glowSize} color={GOLD} opacity={0.36} radiusRatio={0.55} />
            </Reanimated.View>
            <Reanimated.View style={[s.cardWrap, cardStyle]}>{memberCard}</Reanimated.View>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Confetti progress={burst} count={40} power={1.15} />
            </View>
          </View>

          <Reanimated.View style={[s.text, textStyle]}>
            {info?.fromName ? (
              <View style={s.from}>
                <Gift size={15} color={colors.goldText} strokeWidth={2} />
                <Text style={s.fromText} numberOfLines={1}>{t("pass.moment.from", { name: info.fromName })}</Text>
              </View>
            ) : null}
            <Text style={s.title}>{title}</Text>
            {body ? <Text style={s.body}>{body}</Text> : null}
            {info?.message ? <Text style={s.message}>“{info.message}”</Text> : null}
          </Reanimated.View>

          {needsPhoto ? (
            <Reanimated.View style={[s.photoBox, textStyle]}>
              <Text style={s.photoTitle}>{t("pass.moment.photoTitle")}</Text>
              {photoRows.map(({ icon: Icon, text: rowText }) => (
                <View key={rowText} style={s.photoRow}>
                  <Icon size={18} color={colors.goldText} strokeWidth={1.9} />
                  <Text style={s.photoText}>{rowText}</Text>
                </View>
              ))}
            </Reanimated.View>
          ) : null}
        </View>

        <Reanimated.View style={[s.actions, actionsStyle]}>
          {needsPhoto ? (
            <GoldButton label={t("pass.moment.addPhoto")} onPress={openPhotoMenu} loading={changeCardPhoto.isPending} />
          ) : (
            <>
              <GoldButton label={t("pass.moment.offers")} onPress={onOffers} />
              <TextButton label={t("common.done")} onPress={onDone} />
            </>
          )}
        </Reanimated.View>
      </View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  backdrop: { backgroundColor: c.bg },
  root: { flex: 1, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 30 },
  anchor: { position: "absolute", alignItems: "center", justifyContent: "center" },
  cardWrap: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 12,
  },
  text: { alignItems: "center", gap: 10, maxWidth: 360 },
  from: {
    flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, height: 30, borderRadius: 15,
    backgroundColor: c.goldSoft, marginBottom: 2,
  },
  fromText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.goldText },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 30, lineHeight: 36, letterSpacing: -0.8, color: c.text, textAlign: "center" },
  body: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23, color: c.muted, textAlign: "center" },
  message: { fontFamily: "Inter_500Medium", fontStyle: "italic", fontSize: 15.5, lineHeight: 22, color: c.text, textAlign: "center", marginTop: 2 },
  photoBox: {
    alignSelf: "stretch", gap: 12, padding: 16, borderRadius: 18,
    backgroundColor: c.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  photoTitle: { fontFamily: "Inter_700Bold", fontSize: 14.5, color: c.text },
  photoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  photoText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.muted },
  actions: { gap: 4 },
});
