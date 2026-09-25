/**
 * Inställningar › Österlenpasset — hubben: status överst, vad passet ger,
 * presentkoder, köphistorik och pass man gett bort. Köpet ligger på en egen
 * skärm (settings/pass-buy.tsx), presenten på settings/pass-gift.tsx.
 * Tomma listor visas inte alls.
 */
import { Text, TouchableOpacity, Alert, Share, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays } from "date-fns";
import { Crown, Tag, Ticket, Gift, Receipt, Copy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMembership } from "@/hooks/useMembership";
import { useIsBusiness } from "@/hooks/useUserRole";
import { useOffers } from "@/hooks/useOffers";
import { usePassProducts } from "@/hooks/usePassProducts";
import { usePassPurchases, usePassGifts } from "@/hooks/usePassHistory";
import { usePeriodLabel } from "@/hooks/usePeriodLabel";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { GradientCard } from "@/components/GradientCard";
import { QuietButton } from "@/components/QuietButton";
import { PrimaryButton } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const longDate = (d: Date | string) => formatDate(d, "d MMMM yyyy");

export default function PassHub() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const periodLabel = usePeriodLabel();
  const membership = useMembership();
  const { isBusiness } = useIsBusiness();
  const { data: offers = [] } = useOffers();
  const { data: products = [] } = usePassProducts();
  const { data: purchases = [] } = usePassPurchases();
  const { data: gifts = [] } = usePassGifts();

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

  const offersHint =
    offers.length === 0 ? t("pass.offers.none")
    : offers.length === 1 ? t("pass.offers.one")
    : t("pass.offers.count", { count: offers.length });

  return (
    <SettingsScreen title={t("pass.title")}>
      {/* Status: det första du ser */}
      <GradientCard>
        <View style={s.cardBody}>
          <View style={s.statusRow}>
            <View style={s.crown}>
              <Crown size={20} color={colors.goldText} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{membership.isMember ? t("pass.status.active") : t("pass.status.none")}</Text>
              <Text style={s.hint}>
                {membership.isMember
                  ? `${periodLabel(membership.period)}${membership.period ? " · " : ""}${validity}`
                  : t("pass.status.pitch")}
              </Text>
            </View>
          </View>

          {membership.isMember && daysLeft !== null && (
            <Text style={s.daysLeft}>{daysLeft === 1 ? t("pass.status.dayLeft") : t("pass.status.daysLeft", { count: daysLeft })}</Text>
          )}
          {membership.waitingBonusDays > 0 && (
            <Text style={s.hint}>{t("pass.status.bonus", { count: membership.waitingBonusDays })}</Text>
          )}

          {membership.isMember && membership.autoRenews ? (
            <QuietButton
              label={t("pass.status.manage")}
              onPress={() => Alert.alert(t("pass.status.manage"), t("pass.status.manageSoon"), [{ text: t("common.ok") }])}
            />
          ) : (
            <>
              <PrimaryButton
                label={membership.isMember ? t("pass.status.extend") : t("pass.status.get")}
                onPress={() => router.push("/settings/pass-buy" as any)}
              />
              {!membership.isMember && cheapest !== null && <Text style={s.from}>{t("pass.status.from", { price: cheapest })}</Text>}
            </>
          )}
        </View>
      </GradientCard>

      <SettingsGroup>
        <SettingsRow icon={Tag} label={t("pass.offers.title")} subtitle={offersHint} onPress={() => router.push("/offers" as any)} />
      </SettingsGroup>

      <SettingsGroup label={t("pass.gifts.label")}>
        <SettingsRow icon={Ticket} label={t("pass.gifts.redeem")} subtitle={t("pass.gifts.redeemHint")} onPress={() => router.push("/settings/redeem" as any)} />
        <SettingsRow icon={Gift} label={t("pass.gifts.give")} subtitle={t("pass.gifts.giveHint")} onPress={() => router.push("/settings/pass-gift" as any)} />
      </SettingsGroup>

      {purchases.length > 0 && (
        <SettingsGroup label={t("pass.history.title")}>
          {purchases.map((p) => (
            <SettingsRow
              key={p.id}
              icon={Receipt}
              label={p.kind === "gift" ? t("pass.history.gift", { period: periodLabel(p.period) }) : periodLabel(p.period)}
              subtitle={longDate(p.createdAt)}
              value={`${p.priceSek} kr`}
            />
          ))}
        </SettingsGroup>
      )}

      {gifts.length > 0 && (
        <SettingsGroup label={t("pass.given.title")}>
          {gifts.map((g) => (
            <SettingsRow
              key={g.id}
              icon={Gift}
              label={g.recipientName || t("pass.given.fallbackName")}
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
        </SettingsGroup>
      )}
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  cardBody: { padding: 20, gap: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  crown: {
    width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center",
    backgroundColor: c.goldSoft, borderWidth: 0.5, borderColor: c.goldBorder,
  },
  cardTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: c.text },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, color: c.muted, marginTop: 2 },
  daysLeft: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.goldText },
  from: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, textAlign: "center" },
  codePill: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, backgroundColor: c.goldSoft,
  },
  codePillText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.goldText },
});
