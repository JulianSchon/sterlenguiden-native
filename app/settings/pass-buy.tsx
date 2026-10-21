/**
 * Köpsidan för Österlenpasset (paywall). Glider upp över hela skärmen var man än är: från kortet på
 * Profil, Förmåner, ett erbjudande man inte kan lösa in än och Österlenpasset i Inställningar.
 *
 * Överst ens eget medlemskort, som lugnt vänder sig och visar den låsta baksidan — det är den man
 * visar vid kassan. Sedan vad passet är (med det riktiga antalet ställen), valet Till mig / Ge bort
 * och tre boxar: Vecka, Månad (förvald, Populärast) och År (Bäst värde, med hur mycket man sparar).
 * Priserna kommer från tabellen pass_products, som bara du kan ändra (migration 044).
 *
 * Betalningen är inte inkopplad än (Stripe kommer när företaget finns): Fortsätt säger det. Ge bort
 * går vidare till gåvans uppgifter (settings/pass-gift) med passet redan valt.
 */
import { useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useIsBusiness } from "@/hooks/useUserRole";
import { usePassProducts, type PassProduct } from "@/hooks/usePassProducts";
import { useOffers } from "@/hooks/useOffers";
import { useProfile } from "@/hooks/useProfile";
import { useMembership } from "@/hooks/useMembership";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { MemberCard } from "@/components/MemberCard";
import { GoldButton } from "@/components/auth/AuthParts";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { LEGAL_URLS } from "@/lib/appInfo";
import { roundedCountText } from "@/lib/roundedCount";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

type Mode = "self" | "gift";

const GUTTER = 20;
const GAP = 10;
const DEFAULT_PRODUCT = "month";

export default function PassPaywall() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { scheme } = useTheme();
  const s = useThemedStyles(createStyles);
  const { isBusiness } = useIsBusiness();
  const { data: products = [], isLoading } = usePassProducts();
  const { data: offers = [] } = useOffers();
  const { data: profile } = useProfile();
  const membership = useMembership();
  const avatarUrl = useAvatarUrl();

  const [mode, setMode] = useState<Mode>(params.mode === "gift" ? "gift" : "self");
  const [selectedId, setSelectedId] = useState(DEFAULT_PRODUCT);
  const selected = products.find((p) => p.id === selectedId) ?? products[0];

  // Hur många ställen som har rabatter just nu (avrundat nedåt, så det alltid stämmer)
  const placesWithOffers = useMemo(() => new Set(offers.map((o) => o.place_id)).size, [offers]);
  // Året jämfört med tolv månader
  const month = products.find((p) => p.id === "month");
  const year = products.find((p) => p.id === "year");
  const savePercent = month && year && month.priceSek > 0
    ? Math.round((1 - year.priceSek / (month.priceSek * 12)) * 100)
    : 0;

  const cardW = Math.min(width - 72, 330);
  const boxW = Math.floor((width - GUTTER * 2 - GAP * 2) / 3);
  const legal = { terms: LEGAL_URLS.terms, privacy: LEGAL_URLS.privacy };

  const choose = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedId(id);
  };

  const proceed = () => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (mode === "gift") {
      router.push({ pathname: "/settings/pass-gift", params: { period: selected.id } } as never);
      return;
    }
    Alert.alert(t("pass.title"), t("pass.buy.soon"), [{ text: t("common.ok") }]);
  };

  const fine = !selected ? ""
    : mode === "gift" ? t("pass.paywall.giftNote")
      : selected.autoRenew ? `${t(selected.id === "year" ? "pass.paywall.renewsYear" : "pass.paywall.renewsMonth")} ${t("pass.paywall.priceNote")}`
        : t("pass.paywall.onceNote");

  if (isBusiness) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <CloseButton onPress={() => router.back()} top={insets.top + 8} />
        <Text style={s.title}>{t("pass.visitorsOnly.title")}</Text>
        <Text style={[s.pitch, { marginTop: 10 }]}>{t("pass.visitorsOnly.body")}</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 56 }]}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
      >
        <Rise index={0}>
          <View style={[s.cardWrap, { width: cardW }]}>
            <MemberCard
              width={cardW}
              displayName={profile?.display_name ?? ""}
              isMember={membership.isMember}
              memberSince={null}
              cardColor={profile?.card_color}
              avatarUrl={avatarUrl}
              circleColor={profile?.circle_color}
              avatarRing={profile?.avatar_ring}
              onBuyPress={() => {}}
              readOnly
              lockedBack
              autoFlip={!membership.isMember}
            />
          </View>
        </Rise>

        <Rise index={1}>
          <View style={s.heading}>
            <Text style={s.title}>{t("pass.title")}</Text>
            <Text style={s.pitch}>
              {placesWithOffers > 0 ? t("pass.paywall.pitch", { count: roundedCountText(placesWithOffers) }) : t("pass.paywall.pitchNone")}
            </Text>
          </View>
        </Rise>

        <Rise index={2}>
          <ModeSwitch mode={mode} onChange={(m) => { Haptics.selectionAsync().catch(() => {}); setMode(m); }} />
        </Rise>

        <Rise index={3}>
          <View style={s.plans}>
            {isLoading && products.length === 0
              ? [0, 1, 2].map((i) => <Skeleton key={i} width={boxW} height={150} radius={20} />)
              : products.map((p) => (
                <PlanBox
                  key={p.id}
                  product={p}
                  width={boxW}
                  selected={selected?.id === p.id}
                  mode={mode}
                  badge={p.id === "month" ? t("pass.paywall.popular") : p.id === "year" ? t("pass.paywall.best") : null}
                  savePercent={p.id === "year" && savePercent > 0 ? savePercent : 0}
                  onPress={() => choose(p.id)}
                />
              ))}
          </View>
        </Rise>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <GoldButton label={mode === "gift" ? t("pass.paywall.ctaGift") : t("pass.paywall.cta")} onPress={proceed} />
        {fine ? <Text style={s.fine}>{fine}</Text> : null}
        <View style={s.links}>
          {legal.terms ? <FooterLink label={t("pass.paywall.terms")} onPress={() => Linking.openURL(legal.terms!)} /> : null}
          {legal.privacy ? <FooterLink label={t("pass.paywall.privacy")} onPress={() => Linking.openURL(legal.privacy!)} /> : null}
          <FooterLink label={t("pass.paywall.haveCode")} onPress={() => router.push("/settings/redeem" as never)} />
          <FooterLink label={t("pass.paywall.notNow")} onPress={() => router.back()} />
        </View>
      </View>

      <CloseButton onPress={() => router.back()} top={insets.top + 8} />
    </View>
  );
}

function CloseButton({ onPress, top }: { onPress: () => void; top: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <TouchableOpacity style={[s.close, { top }]} onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("pass.paywall.close")}>
      <X size={20} color={colors.text} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} activeOpacity={0.6} accessibilityRole="link">
      <Text style={s.link}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Till mig / Ge bort */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const options: { id: Mode; label: string }[] = [
    { id: "self", label: t("pass.paywall.forMe") },
    { id: "gift", label: t("pass.paywall.gift") },
  ];
  return (
    <View style={s.switch}>
      {options.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => onChange(o.id)}
          style={[s.switchItem, mode === o.id && s.switchItemOn]}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === o.id }}
        >
          <Text style={[s.switchText, mode === o.id && s.switchTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** En av de tre boxarna: namn, pris och vad priset betyder, med märke överst (Populärast, Bäst värde) */
function PlanBox({
  product, width, selected, mode, badge, savePercent, onPress,
}: {
  product: PassProduct; width: number; selected: boolean; mode: Mode; badge: string | null; savePercent: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const known = product.id === "week" || product.id === "month" || product.id === "year";
  const name = known ? t(`pass.paywall.plans.${product.id as "week" | "month" | "year"}`) : product.name;
  const price = Math.round(product.priceSek);
  // Vad priset betyder: per månad / per år / engångsköp (en gåva är alltid ett engångsköp för en period)
  const unit = mode === "gift"
    ? t(`pass.periods.${product.id as "week" | "month" | "year"}`, { defaultValue: product.name })
    : product.id === "year" ? t("pass.paywall.monthlyEquiv", { price: Math.round(product.priceSek / 12) })
      : product.autoRenew ? t("pass.paywall.perMonth") : t("pass.paywall.once");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.plan, { width }, selected && s.planOn, pressed && { opacity: 0.85 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}, ${price} kr`}
    >
      {badge ? (
        <View style={[s.badge, selected && s.badgeOn]}>
          <Text style={[s.badgeText, selected && s.badgeTextOn]} numberOfLines={1}>{badge}</Text>
        </View>
      ) : null}
      <Text style={[s.planName, selected && s.planNameOn]} numberOfLines={1}>{name}</Text>
      <Text style={s.planPrice} numberOfLines={1}>{price} kr</Text>
      <Text style={s.planUnit} numberOfLines={2}>{unit}</Text>
      {savePercent > 0 && mode === "self" ? <Text style={s.save}>{t("pass.paywall.save", { percent: savePercent })}</Text> : null}
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  scroll: { paddingHorizontal: GUTTER, paddingBottom: 24, gap: 26 },
  close: {
    position: "absolute", right: 16, width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
  },
  cardWrap: {
    alignSelf: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.35, shadowRadius: 22, elevation: 10,
  },
  heading: { alignItems: "center", gap: 10 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 32, lineHeight: 38, letterSpacing: -1, color: c.text, textAlign: "center" },
  pitch: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23, color: c.muted, textAlign: "center", maxWidth: 330 },

  switch: {
    flexDirection: "row", alignSelf: "center", padding: 4, borderRadius: 999,
    backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  switchItem: { paddingHorizontal: 22, height: 38, borderRadius: 999, justifyContent: "center" },
  switchItemOn: { backgroundColor: c.card, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  switchText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.muted },
  switchTextOn: { color: c.text },

  plans: { flexDirection: "row", gap: GAP, paddingTop: 12 },
  plan: {
    minHeight: 150, borderRadius: 20, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.raised,
    paddingHorizontal: 8, paddingTop: 24, paddingBottom: 14, alignItems: "center", gap: 6,
  },
  planOn: { borderWidth: 2, borderColor: c.gold, backgroundColor: c.goldSoft },
  badge: {
    position: "absolute", top: -12, alignSelf: "center", paddingHorizontal: 10, height: 24, borderRadius: 12,
    justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.borderStrong,
  },
  badgeOn: { backgroundColor: c.gold, borderColor: c.gold },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: c.muted },
  badgeTextOn: { color: c.onGold },
  planName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.muted },
  planNameOn: { color: c.text },
  planPrice: { fontFamily: "Montserrat_700Bold", fontSize: 22, letterSpacing: -0.5, color: c.text },
  planUnit: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, color: c.muted, textAlign: "center" },
  save: { fontFamily: "Inter_700Bold", fontSize: 11.5, color: c.goldText, marginTop: 2 },

  footer: { paddingHorizontal: GUTTER, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.bg },
  fine: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, color: c.muted, textAlign: "center" },
  links: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", columnGap: 20, rowGap: 6, paddingTop: 2 },
  link: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.faint },
});
