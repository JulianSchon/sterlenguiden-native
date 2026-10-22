/**
 * Ögonblicket när man blir medlem: en enda lugn rörelse, inga tryck för att "öppna" något — man vet
 * redan vad som händer när man löser in en kod (och senare: när man köper passet).
 *
 * Sidan tonar till temats bakgrund, ens kort glider fram och vänds till baksidan, nu upplåst: guldet
 * som rör sig, namnet och klockan, precis som personalen ser det i kassan. En kort vibration (och,
 * när ljuden finns, ett klick) när kortet landar. Sedan texten och knappen.
 *
 * Kortfotot på baksidan krävs: utan det kan personalen inte känna igen en. Saknas det är "Lägg till
 * kortfoto" det enda valet — först när fotot finns kommer "Se dina förmåner".
 *
 * Tre varianter: aktiverat (kortet vänds), tiden sparad (passet förnyas redan, kortet vänds inte)
 * och startar senare (en gåva med startdatum, kortet förblir låst tills dess).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl, useCardPhotoUrl } from "@/hooks/useAvatarUrl";
import { useChangeCardPhoto } from "@/hooks/useCardPhoto";
import { usePhotoMenu } from "@/hooks/usePhotoMenu";
import { MemberCard } from "@/components/MemberCard";
import { GoldButton, TextButton } from "@/components/auth/AuthParts";
import { formatDate } from "@/i18n/dates";
import { playSound } from "@/lib/sounds";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export type MomentKind = "activated" | "saved" | "scheduled";

export interface MomentInfo {
  kind: MomentKind;
  /** Passet gäller till (aktiverat) eller börjar (startar senare) */
  date: string | null;
  /** Dagar som sparats (tiden sparad) */
  days: number;
}

const ease = Easing.out(Easing.cubic);

export function MembershipMoment({
  info, onOffers, onDone,
}: {
  info: MomentInfo | null;
  onOffers: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
  const [reveal, setReveal] = useState(false);

  // Start: när modalen syns och kortets design laddats — båda måste vara klara
  const shown = useRef(false);
  const ready = useRef(false);
  const started = useRef(false);
  const start = useCallback(() => {
    if (started.current || !shown.current || !ready.current) return;
    started.current = true;
    const flip = () => {
      if (kind !== "activated") return;
      setReveal(true);
      // Kortet landar på baksidan efter ungefär en halv sekund
      setTimeout(() => {
        playSound("unlock");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }, 520);
    };
    backdrop.value = withTiming(1, { duration: 280 });
    card.value = withDelay(180, withTiming(1, { duration: 520, easing: ease }, (done) => {
      if (done) runOnJS(flip)();
    }));
    const textAt = kind === "activated" ? 1500 : 800;
    text.value = withDelay(textAt, withTiming(1, { duration: 460, easing: ease }));
    actions.value = withDelay(textAt + 260, withTiming(1, { duration: 420, easing: ease }));
  }, [kind, backdrop, card, text, actions]);
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
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value, transform: [{ translateY: (1 - text.value) * 10 }] }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actions.value }));

  const cardW = Math.min(width - 48, 380);
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
      <View style={[s.root, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={s.center}>
          <Reanimated.View style={[s.cardWrap, cardStyle]}>{memberCard}</Reanimated.View>
          <Reanimated.View style={[s.text, textStyle]}>
            <Text style={s.title}>{title}</Text>
            {body ? <Text style={s.body}>{body}</Text> : null}
            {needsPhoto ? <Text style={s.photoNote}>{t("pass.moment.photoNote")}</Text> : null}
          </Reanimated.View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 34 },
  cardWrap: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 12,
  },
  text: { alignItems: "center", gap: 10, maxWidth: 360 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 30, lineHeight: 36, letterSpacing: -0.8, color: c.text, textAlign: "center" },
  body: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23, color: c.muted, textAlign: "center" },
  photoNote: { fontFamily: "Inter_500Medium", fontSize: 14.5, lineHeight: 21, color: c.goldText, textAlign: "center", marginTop: 6 },
  actions: { gap: 4 },
});
