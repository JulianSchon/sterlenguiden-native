/**
 * Inställningar › Ge bort ett pass (spec: Lovables GiftPassSheet). Köparen väljer
 * period och leveranssätt, fyller i mottagare och betalar; databasen skapar en kod
 * som mottagaren löser in under Lös in kod.
 *
 * Betalningen är inte inkopplad än, så köpknappen säger att den öppnar vid
 * lansering och ingen present skapas utan betalning. När betalningen finns tillkommer
 * resultatvyn med presentkortet (kopiera, dela, konfetti) och en riktig datumväljare
 * (kräver paket i nästa EAS-bygge). Tills dess skrivs startdatumet som dag/månad/år.
 */
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Gift, Send, Printer, User, Mail, Calendar, MessageSquareText } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { usePassProducts, type PassProduct } from "@/hooks/usePassProducts";
import { usePeriodLabel } from "@/hooks/usePeriodLabel";
import { formatDate } from "@/i18n/dates";
import { toIsoDate } from "@/lib/birthDate";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { PrimaryButton } from "@/components/Sheet";
import { LabeledField as Field } from "@/components/LabeledField";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

type Delivery = "email" | "print";

const DEFAULT_PRODUCT = "month";
const EMAIL_PATTERN = /\S+@\S+\.\S+/;

/** Dagens datum som "ÅÅÅÅ-MM-DD" på användarens klocka (samma form som toIsoDate ger). */
function todayIso(): string {
  const now = new Date();
  return toIsoDate(String(now.getDate()), String(now.getMonth() + 1), String(now.getFullYear())) ?? "";
}

export default function GiftPassScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const periodLabel = usePeriodLabel();
  const { data: products = [] } = usePassProducts();

  const today = new Date();
  const [periodId, setPeriodId] = useState(DEFAULT_PRODUCT);
  const [delivery, setDelivery] = useState<Delivery>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [day, setDay] = useState(String(today.getDate()));
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [message, setMessage] = useState("");

  const selected: PassProduct | undefined = products.find((p) => p.id === periodId) ?? products[0];
  const productName = (p: PassProduct) => { const label = periodLabel(p.id); return label === p.id ? p.name : label; };

  const startDate = toIsoDate(day, month, year);
  const dateValid = startDate !== null && startDate >= todayIso();
  const valid = !!selected && (delivery === "print" || (name.trim().length > 1 && EMAIL_PATTERN.test(email.trim()) && dateValid));

  const pick = (apply: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    apply();
  };

  const choiceStyle = (active: boolean) => [s.choice, active && s.choiceActive];

  return (
    <SettingsScreen title={t("pass.gift.title")}>
      <View style={{ gap: 8 }}>
        <View style={s.badge}>
          <Gift size={12} color={colors.onGold} strokeWidth={2.2} />
          <Text style={s.badgeText}>{t("pass.gift.badge")}</Text>
        </View>
        <Text style={s.subtitle}>{t("pass.gift.subtitle")}</Text>
      </View>

      <View>
        <Text style={s.groupLabel}>{t("pass.gift.period")}</Text>
        <View style={s.grid}>
          {products.map((p) => {
            const active = selected?.id === p.id;
            return (
              <TouchableOpacity key={p.id} style={[choiceStyle(active), s.periodCard]} activeOpacity={0.85} onPress={() => pick(() => setPeriodId(p.id))}>
                <Text style={s.choiceTitle}>{productName(p)}</Text>
                <Text style={[s.price, active && { color: colors.goldText }]}>{Math.round(p.priceSek)} kr</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={s.groupLabel}>{t("pass.gift.delivery")}</Text>
        <View style={{ gap: 10 }}>
          {([
            { id: "email", icon: Send, title: t("pass.gift.emailTitle"), desc: t("pass.gift.emailDesc") },
            { id: "print", icon: Printer, title: t("pass.gift.printTitle"), desc: t("pass.gift.printDesc") },
          ] as const).map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[...choiceStyle(delivery === option.id), s.deliveryRow]}
              activeOpacity={0.85}
              onPress={() => pick(() => setDelivery(option.id))}
            >
              <View style={s.tile}>
                <option.icon size={16} color={colors.goldText} strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.choiceTitle}>{option.title}</Text>
                <Text style={s.hint}>{option.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ gap: 14 }}>
        <Text style={s.groupLabel}>{t("pass.gift.recipient")}</Text>
        <Field
          icon={User}
          label={delivery === "print" ? t("pass.gift.nameOptional") : t("pass.gift.name")}
          value={name}
          onChangeText={setName}
          placeholder={t("pass.gift.namePlaceholder")}
          autoCapitalize="words"
          maxLength={60}
        />
        {delivery === "email" && (
          <>
            <Field
              icon={Mail}
              label={t("pass.gift.email")}
              value={email}
              onChangeText={setEmail}
              placeholder={t("pass.gift.emailPlaceholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ gap: 6 }}>
              <View style={s.fieldLabelRow}>
                <Calendar size={13} color={colors.muted} strokeWidth={1.8} />
                <Text style={s.fieldLabel}>{t("pass.gift.startDate")}</Text>
              </View>
              <View style={s.dateRow}>
                <TextInput style={[s.input, s.dateInput]} value={day} onChangeText={setDay} placeholder={t("account.about.day")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={2} />
                <TextInput style={[s.input, s.dateInput]} value={month} onChangeText={setMonth} placeholder={t("account.about.month")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={2} />
                <TextInput style={[s.input, s.dateInputYear]} value={year} onChangeText={setYear} placeholder={t("account.about.year")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={4} />
              </View>
              <Text style={[s.hint, !dateValid && { color: colors.danger }]}>
                {dateValid ? t("pass.gift.startDateNote", { date: formatDate(startDate!, "d MMMM yyyy") }) : t("pass.gift.invalidDate")}
              </Text>
            </View>
          </>
        )}
        <Field
          icon={MessageSquareText}
          label={t("pass.gift.message")}
          value={message}
          onChangeText={setMessage}
          placeholder={t("pass.gift.messagePlaceholder")}
          multiline
          maxLength={220}
        />
      </View>

      {selected && (
        <GradientCard>
          <View style={s.summary}>
            <View style={s.summaryRow}>
              <Text style={[s.hint, { flex: 1 }]}>{t("pass.gift.summary", { period: productName(selected) })}</Text>
              <Text style={s.summaryPrice}>{Math.round(selected.priceSek)} kr</Text>
            </View>
            <Text style={s.note}>
              {t("pass.gift.onceNote")} {delivery === "email" ? t("pass.gift.emailNote") : t("pass.gift.printNote")}
            </Text>
          </View>
        </GradientCard>
      )}

      <PrimaryButton
        label={t("pass.gift.buy", { price: selected ? Math.round(selected.priceSek) : 0 })}
        disabled={!valid}
        onPress={() => Alert.alert(t("pass.title"), t("pass.gift.soon"), [{ text: t("common.ok") }])}
      />
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  badge: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.gold,
  },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1.4, color: c.onGold, textTransform: "uppercase" },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.muted },
  groupLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, marginBottom: 8, textTransform: "uppercase",
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: { borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 14 },
  choiceActive: { borderColor: c.goldBorder, backgroundColor: c.goldSoft },
  choiceTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text },
  periodCard: { width: "48%", flexGrow: 1, gap: 4 },
  price: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.muted },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  tile: {
    width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: c.goldSoft, borderWidth: 0.5, borderColor: c.goldBorder,
  },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.muted },

  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.muted },
  // fontSize 16 hindrar iOS från att zooma in vid fokus
  input: {
    fontFamily: "Inter_400Regular", fontSize: 16, color: c.text, backgroundColor: c.raised,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: c.borderStrong,
  },
  dateRow: { flexDirection: "row", gap: 10 },
  dateInput: { flex: 1, textAlign: "center" },
  dateInputYear: { flex: 1.6, textAlign: "center" },

  summary: { padding: 18, gap: 8 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryPrice: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: c.goldText },
  note: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, color: c.faint },
});
