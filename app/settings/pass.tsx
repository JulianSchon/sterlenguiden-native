/**
 * Inställningar › Österlenpasset — hubben. Medlemskortet överst, sedan status,
 * snabbknappar, kortfoto, köphistorik och pass man gett bort. Köpet ligger på en
 * egen skärm (settings/pass-buy.tsx), presenten på settings/pass-gift.tsx och
 * medlemskapet hanteras på settings/pass-manage.tsx. Tomma listor visas inte alls.
 */
import { useMemo } from "react";
import { View, Text, Pressable, TouchableOpacity, Alert, Share, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays } from "date-fns";
import { ArrowDown, ArrowUp, Camera, Copy, Gift, Settings2, Tag, Ticket, type LucideIcon } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/hooks/useProfile";
import { useMembership } from "@/hooks/useMembership";
import { useIsBusiness } from "@/hooks/useUserRole";
import { useOffers } from "@/hooks/useOffers";
import { usePassProducts } from "@/hooks/usePassProducts";
import { usePassPurchases, usePassGifts, useRedeemedGifts } from "@/hooks/usePassHistory";
import { usePeriodLabel } from "@/hooks/usePeriodLabel";
import { useAvatarUrl, useCardPhotoUrl } from "@/hooks/useAvatarUrl";
import { useChangeCardPhoto, nextCardPhotoChange } from "@/hooks/useCardPhoto";
import { usePhotoMenu } from "@/hooks/usePhotoMenu";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { GradientCard } from "@/components/GradientCard";
import { MemberCard, CARD_W, CARD_H } from "@/components/MemberCard";
import { ActivityRow, AmountColumn, CardLine } from "@/components/pass/ActivityRow";
import { PrimaryButton } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const longDate = (d: Date | string) => formatDate(d, "d MMMM yyyy");

/** Kortet visas något mindre än sin fulla bredd så att det ryms i statusrutan */
const CARD_SCALE = 0.84;

/** Rund snabbknapp med etikett under, som i bankappar. */
function QuickAction({ icon: Icon, label, badge, onPress }: { icon: LucideIcon; label: string; badge?: number; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <Pressable
      style={({ pressed }) => [s.action, pressed && { opacity: 0.6 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
    >
      <View style={s.actionCircle}>
        <Icon size={22} color={colors.text} strokeWidth={1.6} />
        {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge > 99 ? "99+" : badge}</Text></View> : null}
      </View>
      <Text style={s.actionLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function PassHub() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const periodLabel = usePeriodLabel();
  const { data: profile } = useProfile();
  const membership = useMembership();
  const { isBusiness } = useIsBusiness();
  const { data: offers = [] } = useOffers();
  const { data: products = [] } = usePassProducts();
  const { data: purchases = [] } = usePassPurchases();
  const { data: gifts = [] } = usePassGifts();
  const { data: redeemed = [] } = useRedeemedGifts();
  const avatarUrl = useAvatarUrl();
  const cardPhotoUrl = useCardPhotoUrl();
  const changeCardPhoto = useChangeCardPhoto();
  const openPhotoMenu = usePhotoMenu(changeCardPhoto.mutateAsync, t("pass.card.title"));

  if (isBusiness) {
    return (
      <SettingsScreen title={t("pass.title")}>
        <GradientCard>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>{t("pass.visitorsOnly.title")}</Text>
            <Text style={s.hint}>{t("pass.visitorsOnly.body")}</Text>
          </View>
        </GradientCard>
      </SettingsScreen>
    );
  }

  // "Förnyas om 12 dagar" (eller "Går ut om …" om passet inte förnyas) med datumet under
  const daysLeft = membership.until ? Math.max(0, differenceInCalendarDays(membership.until, new Date())) : null;
  const renews = membership.autoRenews;
  const countdown = daysLeft === null ? t("pass.status.unlimited")
    : daysLeft === 0 ? t(renews ? "pass.status.renewsToday" : "pass.status.endsToday")
    : daysLeft === 1 ? t(renews ? "pass.status.renewsInOne" : "pass.status.endsInOne")
    : t(renews ? "pass.status.renewsIn" : "pass.status.endsIn", { count: daysLeft });
  // Hur stor del av passperioden som gått, för tidslinjen under kortet
  const startedAt = profile?.member_started_at ? new Date(profile.member_started_at).getTime() : null;
  const progress = startedAt !== null && membership.until && membership.until.getTime() > startedAt
    ? Math.min(1, Math.max(0, (Date.now() - startedAt) / (membership.until.getTime() - startedAt)))
    : null;
  const cheapest = products.length ? Math.round(Math.min(...products.map((p) => p.priceSek))) : null;
  const nextPhotoChange = nextCardPhotoChange(profile);

  // Köp och inlösta koder i en lista, nyast först
  const history = useMemo(() => [
    ...purchases.map((p) => ({ type: "purchase" as const, id: p.id, at: p.createdAt, purchase: p })),
    ...redeemed.map((r) => ({ type: "redeemed" as const, id: r.id, at: r.claimedAt, gift: r })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [purchases, redeemed]);

  const changePhoto = () => {
    if (nextPhotoChange) Alert.alert(t("pass.card.title"), t("pass.card.next", { date: longDate(nextPhotoChange) }));
    else openPhotoMenu();
  };

  const photoHint = !profile?.profile_image_url
    ? t("pass.card.missing")
    : nextPhotoChange
      ? t("pass.card.next", { date: longDate(nextPhotoChange) })
      : t("pass.card.change");

  return (
    <SettingsScreen title={t("pass.title")}>
      {/* Statusruta: status och pass överst, kortet (baksidan först, går att vända)
          i mitten och nedräkning med tidslinje under. Genomskinlig; guldkant för medlemmar. */}
      <View style={[s.hero, membership.isMember && s.heroActive]}>
        <View style={s.heroTop}>
          <View style={s.statusRow}>
            <View style={[s.dot, membership.isMember && { backgroundColor: colors.success }]} />
            <Text style={[s.statusLabel, membership.isMember && { color: colors.success }]}>
              {membership.isMember ? t("pass.status.active") : t("pass.status.none")}
            </Text>
          </View>
          {membership.isMember && <Text style={s.period}>{periodLabel(membership.period)}</Text>}
        </View>

        <View style={s.cardShadow}>
          <View style={{ width: CARD_W * CARD_SCALE, height: CARD_H * CARD_SCALE }}>
            <View style={s.cardScaler}>
              <MemberCard
                displayName={profile?.display_name ?? ""}
                isMember={membership.isMember}
                memberSince={profile?.created_at ? formatDate(profile.created_at, "MMMM yyyy") : null}
                cardColor={profile?.card_color}
                avatarUrl={avatarUrl}
                circleColor={profile?.circle_color}
                profileImageUrl={cardPhotoUrl}
                onBuyPress={() => router.push("/settings/pass-buy" as any)}
                startOnBack
              />
            </View>
          </View>
        </View>

        {membership.isMember ? (
          <View style={{ gap: 10 }}>
            {progress !== null && (
              <View style={s.track}>
                <View style={[s.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            )}
            <View style={s.countdownRow}>
              <Text style={s.countdown}>{countdown}</Text>
              {membership.until && <Text style={s.hint}>{formatDate(membership.until, "d MMM yyyy")}</Text>}
            </View>
          </View>
        ) : (
          <Text style={[s.hint, { textAlign: "center" }]}>{t("pass.status.pitch")}</Text>
        )}
      </View>
      {membership.waitingBonusDays > 0 && (
        <Text style={s.bonus}>{t("pass.status.bonus", { count: membership.waitingBonusDays })}</Text>
      )}

      {!membership.isMember && (
        <View style={{ gap: 8 }}>
          <PrimaryButton label={t("pass.status.get")} onPress={() => router.push("/settings/pass-buy" as any)} />
          {cheapest !== null && <Text style={s.from}>{t("pass.status.from", { price: cheapest })}</Text>}
        </View>
      )}

      <View style={s.actions}>
        <QuickAction icon={Tag} label={t("pass.actions.offers")} badge={offers.length} onPress={() => router.push("/offers" as any)} />
        <QuickAction icon={Ticket} label={t("pass.actions.redeem")} onPress={() => router.push("/settings/redeem" as any)} />
        <QuickAction icon={Gift} label={t("pass.actions.give")} onPress={() => router.push("/settings/pass-gift" as any)} />
        {membership.isMember && (
          <QuickAction icon={Settings2} label={t("pass.actions.manage")} onPress={() => router.push("/settings/pass-manage" as any)} />
        )}
      </View>

      {membership.isMember && (
        <SettingsGroup>
          <SettingsRow
            icon={Camera}
            label={t("pass.card.title")}
            subtitle={photoHint}
            tint={profile?.profile_image_url ? undefined : colors.goldText}
            onPress={changePhoto}
          />
        </SettingsGroup>
      )}

      {history.length > 0 && (
        <View>
          <Text style={s.groupLabel}>{t("pass.history.title")}</Text>
          <View style={{ gap: 10 }}>
            {history.map((entry) => entry.type === "purchase" ? (
              <ActivityRow
                key={`purchase-${entry.id}`}
                icon={entry.purchase.kind === "gift" ? Gift : ArrowUp}
                title={periodLabel(entry.purchase.period)}
                subtitle={entry.purchase.cardLast4
                  ? <CardLine brand={entry.purchase.cardBrand} last4={entry.purchase.cardLast4} />
                  : entry.purchase.kind === "gift" ? t("pass.history.gift") : t("pass.history.self")}
                right={<AmountColumn amount={`− ${entry.purchase.priceSek} kr`} date={formatDate(entry.at, "d MMM yyyy")} />}
              />
            ) : (
              <ActivityRow
                key={`redeemed-${entry.id}`}
                icon={ArrowDown}
                tone="success"
                title={periodLabel(entry.gift.period)}
                subtitle={t("pass.history.redeemed")}
                right={<AmountColumn positive amount={`+ ${entry.gift.priceSek} kr`} date={formatDate(entry.at, "d MMM yyyy")} />}
              />
            ))}
          </View>
        </View>
      )}

      {gifts.length > 0 && (
        <View>
          <Text style={s.groupLabel}>{t("pass.given.title")}</Text>
          <View style={{ gap: 10 }}>
            {gifts.map((g) => (
              <ActivityRow
                key={g.id}
                icon={Gift}
                tone="gold"
                title={g.recipientName || t("pass.given.fallbackName")}
                subtitle={[
                  periodLabel(g.period),
                  g.claimed ? t("pass.given.claimed") : t("pass.given.unclaimed"),
                  g.deliveryMethod === "print" ? t("pass.given.byPrint") : g.deliveryMethod === "email" ? t("pass.given.byEmail") : null,
                ].filter(Boolean).join(" · ")}
                right={!g.claimed ? (
                  <TouchableOpacity
                    style={s.codePill}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      Share.share({ message: g.claimCode });
                    }}
                  >
                    <Copy size={14} color={colors.goldText} strokeWidth={2} />
                    <Text style={s.codePillText}>{g.claimCode}</Text>
                  </TouchableOpacity>
                ) : undefined}
              />
            ))}
          </View>
        </View>
      )}
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  groupLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, marginBottom: 8, textTransform: "uppercase",
  },
  cardBody: { padding: 20, gap: 8 },
  cardTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: c.text },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, color: c.muted },

  hero: { gap: 18, padding: 18, borderRadius: 28, borderWidth: 1, borderColor: c.borderStrong },
  heroActive: { borderColor: c.goldBorder },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.faint },
  statusLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: c.muted },
  // Samma stil som sidans rubrik
  period: { fontFamily: "Montserrat_700Bold", fontSize: 14, letterSpacing: 1.5, textTransform: "uppercase", color: c.text },
  cardShadow: {
    alignSelf: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  // Kortet skalas runt sin mitt och läggs så att det övre vänstra hörnet hamnar i sin ruta
  cardScaler: {
    position: "absolute", width: CARD_W, height: CARD_H,
    left: -(CARD_W * (1 - CARD_SCALE)) / 2, top: -(CARD_H * (1 - CARD_SCALE)) / 2,
    transform: [{ scale: CARD_SCALE }],
  },
  track: { height: 4, borderRadius: 2, backgroundColor: c.fill, overflow: "hidden" },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: c.gold },
  countdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countdown: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.goldText },
  bonus: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.muted, textAlign: "center" },
  from: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, textAlign: "center" },

  actions: { flexDirection: "row", justifyContent: "space-evenly" },
  action: { alignItems: "center", gap: 8, width: 78 },
  actionCircle: {
    width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center",
    backgroundColor: c.card, borderWidth: 0.5, borderColor: c.borderStrong,
  },
  actionLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.text },
  badge: {
    position: "absolute", top: -2, right: -4, minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: c.gold,
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, color: c.onGold },

  codePill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, backgroundColor: c.goldSoft,
  },
  codePillText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.goldText },
});
