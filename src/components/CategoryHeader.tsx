/**
 * ‹ ── NAMN ── › (linjerna som kortdesignen i Utseende) med prickar under — väljaren för vilken
 * kategori/sida som visas. Används av Förmåner (där man även kan svepa) och Favoriter (bara
 * pilarna). Pilarna försvinner i ändarna.
 *
 * Färgerna följer temat, eller en fast palett (`palette`) för sidor som alltid är mörka.
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function CategoryHeader({
  index, labels, onStep, palette,
}: { index: number; labels: string[]; onStep: (dir: 1 | -1) => void; palette?: ThemeColors }) {
  const { colors: themeColors } = useTheme();
  const colors = palette ?? themeColors;
  const s = useMemo(() => createStyles(colors), [colors]);
  const arrow = (dir: 1 | -1) => {
    const hidden = index + dir < 0 || index + dir >= labels.length;
    const Icon = dir === 1 ? ChevronRight : ChevronLeft;
    return (
      <Pressable onPress={() => onStep(dir)} disabled={hidden} hitSlop={12} style={[s.arrow, hidden && { opacity: 0 }]}>
        <Icon size={22} color={colors.muted} strokeWidth={2} />
      </Pressable>
    );
  };
  return (
    <View style={s.header}>
      <View style={s.row}>
        {arrow(-1)}
        <View style={s.middle}>
          <View style={s.rule} />
          <Text style={s.title} numberOfLines={1}>{labels[index].toUpperCase()}</Text>
          <View style={s.rule} />
        </View>
        {arrow(1)}
      </View>
      <View style={s.dots}>
        {labels.map((label, i) => (
          <View key={label} style={[s.dot, i === index && s.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { alignItems: "center", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  middle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 6 },
  arrow: { width: 32, alignItems: "center" },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.goldBorder },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 13, letterSpacing: 3, color: c.text },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderStrong },
  dotActive: { width: 18, backgroundColor: c.gold },
});
