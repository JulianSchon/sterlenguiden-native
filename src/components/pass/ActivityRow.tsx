/**
 * En rad i köphistoriken och listan över gåvor: rund ikon, rubrik med kortuppgift
 * under, och belopp eller status till höger. Varje rad är ett eget avrundat kort.
 */
import type { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { CreditCard, type LucideIcon } from "lucide-react-native";
import { GradientCard } from "@/components/GradientCard";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function ActivityRow({
  icon: Icon, tone = "neutral", title, subtitle, right,
}: {
  icon: LucideIcon;
  /** Ikonrutans ton: neutral (köp), guld (gåvor du gett) eller grön (pengar in) */
  tone?: "neutral" | "gold" | "success";
  title: string;
  /** Text eller eget innehåll (t.ex. CardLine) under rubriken */
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <GradientCard radius={30}>
      <View style={s.row}>
        <View style={[s.circle, tone === "gold" && s.circleGold, tone === "success" && s.circleSuccess]}>
          <Icon size={20} color={tone === "gold" ? colors.goldText : tone === "success" ? colors.success : colors.muted} strokeWidth={1.7} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {typeof subtitle === "string" ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : subtitle}
        </View>
        {right}
      </View>
    </GradientCard>
  );
}

/** Beloppet och datumet till höger på en rad: "− 69 kr" (köp) eller grönt "+ 69 kr" (inlöst). */
export function AmountColumn({ amount, date, positive = false }: { amount: string; date: string; positive?: boolean }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.amountColumn}>
      <Text style={[s.amount, positive && { color: colors.success }]}>{amount}</Text>
      <Text style={s.subtitle}>{date}</Text>
    </View>
  );
}

/** Kortet köpet gjordes med: liten märkesikon och "•••• 4242". */
export function CardLine({ brand, last4 }: { brand: string | null; last4: string }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const name = (brand ?? "").toLowerCase();
  return (
    <View style={s.cardLine}>
      {name === "mastercard" ? (
        <View style={s.mastercard}>
          <View style={[s.mcCircle, { backgroundColor: "#EB001B" }]} />
          <View style={[s.mcCircle, { backgroundColor: "#F79E1B", marginLeft: -7, opacity: 0.9 }]} />
        </View>
      ) : name === "visa" ? (
        <Text style={s.visa}>VISA</Text>
      ) : (
        <CreditCard size={15} color={colors.muted} strokeWidth={1.7} />
      )}
      <Text style={s.subtitle}>•••• {last4}</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  circle: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: c.fill,
  },
  circleGold: { backgroundColor: c.goldSoft },
  circleSuccess: { backgroundColor: `${c.success}22` },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted },
  amountColumn: { alignItems: "flex-end", gap: 5 },
  amount: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: c.text },
  cardLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  mastercard: { flexDirection: "row", alignItems: "center" },
  mcCircle: { width: 16, height: 16, borderRadius: 8 },
  visa: { fontFamily: "Inter_700Bold", fontSize: 12, fontStyle: "italic", letterSpacing: 0.5, color: c.text },
});
