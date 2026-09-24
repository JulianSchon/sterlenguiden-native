/**
 * En grupp av rader i ett kort, med tunna avdelare från kant till kant.
 * Rubriken (valfri) ligger ovanför kortet.
 */
import { Children, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { GradientCard } from "@/components/GradientCard";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function SettingsGroup({ label, children }: { label?: string; children: ReactNode }) {
  const s = useThemedStyles(createStyles);
  const rows = Children.toArray(children);
  return (
    <View>
      {label ? <Text style={s.groupLabel}>{label}</Text> : null}
      <GradientCard>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 && <View style={s.divider} />}
            {row}
          </View>
        ))}
      </GradientCard>
    </View>
  );
}

export function SettingsRow({
  icon: Icon, label, subtitle, value, onPress, destructive = false, compact = false, strong = false, tint, right,
}: {
  icon?: LucideIcon;
  label: string;
  /** Förklarande rad under etiketten */
  subtitle?: string;
  /** Kort värde till höger, t.ex. "På" */
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  /** Lägre rad för mindre viktiga val */
  compact?: boolean;
  /** Större, halvfet etikett */
  strong?: boolean;
  /** Färg på ikonen och underrubriken (etiketten behåller textfärgen) */
  tint?: string;
  /** Eget innehåll till höger (t.ex. ett reglage); ersätter pilen */
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  // Ikonen är lite dämpad (text i 75 % styrka) så etiketten dominerar
  const iconColor = destructive ? colors.danger : tint ?? `${colors.text}BF`;

  return (
    <Pressable
      style={({ pressed }) => [s.row, compact && s.rowCompact, pressed && onPress ? s.rowPressed : null]}
      disabled={!onPress}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
    >
      {Icon && (
        <View style={[s.tile, compact && s.tileCompact]}>
          <Icon size={compact ? 16 : 18} color={iconColor} strokeWidth={1.6} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.label, compact && s.labelCompact, strong && s.labelStrong, destructive && { color: colors.danger }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? <Text style={[s.subtitle, tint ? { color: tint } : null]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={s.value} numberOfLines={1}>{value}</Text> : null}
      {right ?? (onPress && !destructive ? <ChevronRight size={18} color={colors.faint} strokeWidth={2} /> : null)}
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  groupLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, marginBottom: 8, textTransform: "uppercase",
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 12, minHeight: 68 },
  rowCompact: { gap: 12, paddingVertical: 12, minHeight: 64 },
  rowPressed: { backgroundColor: c.fill, transform: [{ scale: 0.985 }] },
  // Ikonrutan ser nedsänkt ut: mörkare yta med tunn kant
  tile: {
    width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center",
    backgroundColor: c.tile, borderWidth: 0.5, borderColor: c.tileBorder,
  },
  tileCompact: { width: 32, height: 32, borderRadius: 10 },
  // Samma typsnittsfamilj som rubriken (Montserrat), men i normal tyngd så raderna inte blir tunga
  label: { fontFamily: "Montserrat_500Medium", fontSize: 14.5, letterSpacing: -0.3, color: c.text },
  labelCompact: { fontSize: 13.5 },
  labelStrong: { fontFamily: "Montserrat_600SemiBold", fontSize: 14.5 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 17, color: c.muted, marginTop: 2 },
  value: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted },
});
