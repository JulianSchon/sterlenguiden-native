/**
 * CategoryChips — delad pill-rad för kategorifilter.
 * Används av Förmåner och Favoriter, exakt samma utseende på båda.
 *
 * Aktiv: solid guld. Inaktiv: dämpad yta med dämpad text. Tryck: scale(0.95).
 * Färgerna följer temat. `inset` är sidomarginalen så raden kan gå kant i kant
 * på en sida som har egen marginal.
 */
import { Pressable, Text, ScrollView, StyleSheet } from "react-native";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export interface ChipDef {
  id: string;
  label: string;
}

export function CategoryChips({
  chips,
  activeId,
  onChange,
  inset = 20,
}: {
  chips: ChipDef[];
  activeId: string;
  onChange: (id: string) => void;
  inset?: number;
}) {
  const s = useThemedStyles(createStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.scroll}
      contentContainerStyle={[s.content, { paddingHorizontal: inset }]}
    >
      {chips.map((c) => {
        const active = c.id === activeId;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            style={({ pressed }) => [
              s.chip,
              active ? s.chipActive : s.chipIdle,
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
          >
            <Text style={[s.text, active ? s.textActive : s.textIdle]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  scroll: { flexGrow: 0, height: 44 },
  content: { gap: 8, flexDirection: "row" },
  chip: {
    flexShrink: 0,
    justifyContent: "center",
    paddingHorizontal: 16,
    // Asymmetrisk padding — Inter har mer "luft" under baslinjen än över,
    // så symmetrisk paddingVertical gör att texten ser urcentrerad ut.
    paddingTop: 8,
    paddingBottom: 7,
    borderRadius: 9999,
  },
  chipActive: {
    backgroundColor: c.gold,
    shadowColor: c.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  chipIdle: {
    backgroundColor: c.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.borderStrong,
  },
  text: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 18 },
  textActive: { color: c.onGold },
  textIdle: { color: c.muted },
});
