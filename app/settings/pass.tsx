/**
 * Inställningar › Österlenpasset — hubben. Medlemskortet överst, sedan status,
 * snabbknappar, kortfoto, köphistorik och pass man gett bort. Köpet ligger på en
 * egen skärm (settings/pass-buy.tsx), presenten på settings/pass-gift.tsx och
 * medlemskapet hanteras på settings/pass-manage.tsx. Tomma listor visas inte alls.
 */
import { View, Text, Image, Pressable, TouchableOpacity, Alert, Share, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays } from "date-fns";
import { ArrowUp, Camera, Copy, Gift, Settings2, Tag, Ticket, type LucideIcon } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/hooks/useProfile";
import { useMembership } from "@/hooks/useMembership";
import { useIsBusiness } from "@/hooks/useUserRole";
import { useOffers } from "@/hooks/useOffers";
import { usePassProducts } from "@/hooks/usePassProducts";
import { usePassPurchases, usePassGifts } from "@/hooks/usePassHistory";
import { usePeriodLabel } from "@/hooks/usePeriodLabel";
import { useAvatarUrl, useCardPhotoUrl } from "@/hooks/useAvatarUrl";
import { useChangeCardPhoto, nextCardPhotoChange } from "@/hooks/useCardPhoto";
import { usePhotoMenu } from "@/hooks/usePhotoMenu";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { GradientCard } from "@/components/GradientCard";
import { MemberCard } from "@/components/MemberCard";
import { ActivityRow, AmountColumn, CardLine } from "@/components/pass/ActivityRow";
import { PrimaryButton } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const longDate = (d: Date | string) => formatDate(d, "d MMMM yyyy");

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

  const validity = membership.renewsOn
    ? t("pass.status.renews", { date: longDate(membership.renewsOn) })
    : membership.until
      ? t("pass.status.until", { date: longDate(membership.until) })
      : t("pass.status.unlimited");

  const daysLeft = membership.until ? Math.max(0, differenceInCalendarDays(membership.until, new Date())) : null;
  const cheapest = products.length ? Math.round(Math.min(...products.map((p) => p.priceSek))) : null;
  const nextPhotoChange = nextCardPhotoChange(profile);

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
      <MemberCard
        displayName={profile?.display_name ?? ""}
        isMember={membership.isMember}
        memberSince={profile?.created_at ? formatDate(profile.created_at, "MMMM yyyy") : null}
        cardColor={profile?.card_color}
        avatarUrl={avatarUrl}
        circleColor={profile?.circle_color}
        profileImageUrl={cardPhotoUrl}
        onBuyPress={() => router.push("/settings/pass-buy" as any)}
      />

      {/* Status under kortet */}
      <View style={s.status}>
        {membership.isMember ? (
          <>
            <Text style={s.statusLine}>
              {periodLabel(membership.period)}{membership.period ? " · " : ""}{validity}
            </Text>
            {daysLeft !== null && (
              <Text style={s.daysLeft}>{daysLeft === 1 ? t("pass.status.dayLeft") : t("pass.status.daysLeft", { count: daysLeft })}</Text>
            )}
            {membership.waitingBonusDays > 0 && (
              <Text style={s.hint}>{t("pass.status.bonus", { count: membership.waitingBonusDays })}</Text>
            )}
          </>
        ) : (
          <Text style={s.statusLine}>{t("pass.status.pitch")}</Text>
        )}
      </View>

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
            right={cardPhotoUrl ? <Image source={{ uri: cardPhotoUrl }} style={s.thumb} /> : undefined}
          />
        </SettingsGroup>
      )}

      {purchases.length > 0 && (
        <View>
          <Text style={s.groupLabel}>{t("pass.history.title")}</Text>
          <View style={{ gap: 10 }}>
            {purchases.map((p) => (
              <ActivityRow
                key={p.id}
                icon={p.kind === "gift" ? Gift : ArrowUp}
                title={periodLabel(p.period)}
                subtitle={p.cardLast4
                  ? <CardLine brand={p.cardBrand} last4={p.cardLast4} />
                  : p.kind === "gift" ? t("pass.history.gift") : t("pass.history.self")}
                right={<AmountColumn amount={`− ${p.priceSek} kr`} date={formatDate(p.createdAt, "d MMM yyyy")} />}
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
                gold
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

  status: { alignItems: "center", gap: 4, paddingHorizontal: 8 },
  statusLine: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20, color: c.muted, textAlign: "center" },
  daysLeft: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.goldText },
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

  thumb: { width: 40, height: 40, borderRadius: 20 },

  codePill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, backgroundColor: c.goldSoft,
  },
  codePillText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.goldText },
});
