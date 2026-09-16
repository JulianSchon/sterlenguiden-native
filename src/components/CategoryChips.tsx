/**
 * CategoryChips — delad pill-rad för kategorifilter.
 * Används av Förmåner och Favoriter, exakt samma utseende på båda.
 *
 * Aktiv: solid guld (ingen gradient — provades, blev inte snyggt).
 * Inaktiv: mörkgrå med ljusgrå text. Tryck: scale(0.95), ingen annan animation.
 */
import { Pressable, Text, ScrollView, StyleSheet } from "react-native";

const GOLD         = "#C5A059";
const CHIP_DARK    = "#0B0B0D";
const IDLE_BG      = "#242424";
const IDLE_BORDER  = "rgba(255,255,255,0.08)";
const IDLE_FG      = "rgba(255,255,255,0.55)";

export interface ChipDef {
  id: string;
  label: string;
}

export function CategoryChips({
  chips,
  activeId,
  onChange,
}: {
  chips: ChipDef[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.scroll}
      contentContainerStyle={s.content}
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

const s = StyleSheet.create({
  scroll: { flexGrow: 0, height: 46 },
  content: { paddingHorizontal: 20, gap: 8, flexDirection: "row" },
  chip: {
    flexShrink: 0,
    justifyContent: "center",
    paddingHorizontal: 16,
    // Asymmetrisk padding — Inter har mer "luft" under baslinjen än över,
    // så symmetrisk paddingVertical gör att texten ser urcentrerad ut.
    paddingTop: 11,
    paddingBottom: 9,
    borderRadius: 9999,
  },
  chipActive: {
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  chipIdle: {
    backgroundColor: IDLE_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IDLE_BORDER,
  },
  text: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 16 },
  textActive: { color: CHIP_DARK },
  textIdle: { color: IDLE_FG },
});
