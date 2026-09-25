/**
 * Välj och köp Österlenpasset: förmåner, pass att välja mellan (priser ur
 * pass_products), pris och köpknapp. Själva betalningen är inte inkopplad än —
 * köpknappen säger tills vidare att den öppnar vid lansering.
 * Status och historik finns på hubben i settings/pass.tsx.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Check, Ticket } from "lucide-react-native";
import Svg, { Defs, RadialGradient, Stop, Ellipse, Path, LinearGradient, Rect } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useIsBusiness } from "@/hooks/useUserRole";
import { usePassProducts, type PassProduct } from "@/hooks/usePassProducts";
import { usePeriodLabel } from "@/hooks/usePeriodLabel";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { PrimaryButton } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const DEFAULT_PRODUCT = "month";

/** Kortet är en mörk guldillustration och ser likadant ut i båda lägena. */
function GoldMiniCard() {
  return (
    <Svg width={320} height={180} viewBox="0 0 320 180" style={{ borderRadius: 20, overflow: "hidden" }}>
      <Defs>
        <LinearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1a1a1a" />
          <Stop offset="1" stopColor="#0e0e0e" />
        </LinearGradient>
        <LinearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#F0D080" />
          <Stop offset="0.5" stopColor="#C5A059" />
          <Stop offset="1" stopColor="#9B7A2E" />
        </LinearGradient>
        <RadialGradient id="glow" cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#C5A059" stopOpacity="0.18" />
          <Stop offset="1" stopColor="#C5A059" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={320} height={180} rx={20} fill="url(#cardGrad)" />
      <Ellipse cx={160} cy={70} rx={200} ry={110} fill="url(#glow)" />
      {[50, 66, 82].map((y, i) => (
        <Path
          key={i}
          d={`M -10 ${y} Q 80 ${y - 12 + i * 3} 160 ${y + 6 - i * 2} T 330 ${y - 4}`}
          stroke="url(#goldGrad)" strokeWidth={0.8} fill="none" strokeOpacity={0.55 - i * 0.1}
        />
      ))}
      <Rect x={8} y={8} width={304} height={164} rx={14} stroke="url(#goldGrad)" strokeWidth={0.8} fill="none" strokeOpacity={0.35} />
    </Svg>
  );
}

export default function PassBuyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const periodLabel = usePeriodLabel();
  const { isBusiness } = useIsBusiness();
  const { data: products = [], isLoading } = usePassProducts();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = products.find((x) => x.id === (selectedId ?? DEFAULT_PRODUCT)) ?? products[0];
  const price = (p: PassProduct) => `${Math.round(p.priceSek)} kr`;
  // Kända perioder översätts; nya pass som bara finns i tabellen visas med sitt namn
  const productName = (p: PassProduct) => { const label = periodLabel(p.id); return label === p.id ? p.name : label; };

  if (isBusiness) {
    return (
      <SettingsScreen title={t("pass.buy.title")}>
        <GradientCard>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>{t("pass.visitorsOnly.title")}</Text>
            <Text style={s.hint}>{t("pass.visitorsOnly.body")}</Text>
          </View>
        </GradientCard>
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen title={t("pass.buy.title")}>
      <View style={{ alignItems: "center" }}>
        <GoldMiniCard />
      </View>

      <View>
        <Text style={s.groupLabel}>{t("pass.buy.included")}</Text>
        <GradientCard>
          <View style={[s.cardBody, { gap: 12 }]}>
            {(["pass.buy.perk1", "pass.buy.perk2", "pass.buy.perk3"] as const).map((key) => (
              <View key={key} style={s.perk}>
                <View style={s.checkCircle}><Check size={11} color={colors.onGold} strokeWidth={2.8} /></View>
                <Text style={s.perkText}>{t(key)}</Text>
              </View>
            ))}
          </View>
        </GradientCard>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.gold} />
      ) : (
        <>
          <View>
            <Text style={s.groupLabel}>{t("pass.buy.choose")}</Text>
            <View style={{ gap: 10 }}>
              {products.map((product) => {
                const active = selected?.id === product.id;
                return (
                  <TouchableOpacity
                    key={product.id}
                    style={[s.plan, active && s.planActive]}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSelectedId(product.id);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.planName}>{productName(product)}</Text>
                      {product.description ? <Text style={s.hint}>{product.description}</Text> : null}
                    </View>
                    <Text style={[s.planPrice, active && { color: colors.goldText }]}>{price(product)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {selected && (
            <GradientCard>
              <View style={[s.cardBody, { alignItems: "center" }]}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <Text style={s.price}>{price(selected)}</Text>
                  <Text style={s.hint}>{selected.autoRenew ? t("pass.buy.renews") : t("pass.buy.oneTime")}</Text>
                </View>
                <View style={{ alignSelf: "stretch" }}>
                  <PrimaryButton
                    label={t("pass.buy.cta")}
                    onPress={() => Alert.alert(t("pass.title"), t("pass.buy.soon"), [{ text: t("common.ok") }])}
                  />
                </View>
                <Text style={s.footer}>{selected.autoRenew ? t("pass.buy.footerRenews") : t("pass.buy.footerOnce")}</Text>
              </View>
            </GradientCard>
          )}
        </>
      )}

      <TouchableOpacity style={s.codeLink} onPress={() => router.push("/settings/redeem" as any)}>
        <Ticket size={15} color={colors.muted} strokeWidth={2} />
        <Text style={s.codeLinkText}>{t("pass.buy.haveCode")}</Text>
      </TouchableOpacity>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  groupLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, marginBottom: 8, textTransform: "uppercase",
  },
  cardBody: { padding: 20, gap: 10 },
  cardTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: c.text },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, color: c.muted },

  perk: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: c.gold,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  perkText: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.text, flex: 1, lineHeight: 20 },

  plan: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  planActive: { borderColor: c.goldBorder, backgroundColor: c.goldSoft },
  planName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  planPrice: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.muted },

  price: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 38, color: c.text },
  footer: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: c.faint, textAlign: "center", lineHeight: 17 },

  codeLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  codeLinkText: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted },
});
