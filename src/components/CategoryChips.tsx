/**
 * CategoryChips — delad pill-rad för kategorifilter.
 * Används av Förmåner och Favoriter, exakt samma utseende på båda.
 *
 * Aktiv: solid guld med ett mjukt sken (Skia). Inaktiv: dämpad yta med dämpad text.
 * Tryck: scale(0.95).
 * Färgerna följer temat. `inset` är sidomarginalen så raden kan gå kant i kant
 * på en sida som har egen marginal.
 */
import { useState } from "react";
import { Pressable, Text, ScrollView, View, StyleSheet } from "react-native";
import { Canvas, RoundedRect, Blur } from "@shopify/react-native-skia";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export interface ChipDef {
  id: string;
  label: string;
}

// Skenet ritas utanför pillens kant, så raden behöver luft över och under
const GLOW = 12;

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
      {chips.map((c) => (
        <Chip key={c.id} label={c.label} active={c.id === activeId} onPress={() => onChange(c.id)} />
      ))}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [size, setSize] = useState({ w: 0, h: 0 });

  return (
    <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {active && size.w > 0 && (
        <Canvas
          pointerEvents="none"
          style={{ position: "absolute", left: -GLOW, top: -GLOW, width: size.w + GLOW * 2, height: size.h + GLOW * 2 }}
        >
          <RoundedRect x={GLOW} y={GLOW + 2} width={size.w} height={size.h} r={size.h / 2} color={colors.gold} opacity={0.4}>
            <Blur blur={GLOW / 2} />
          </RoundedRect>
        </Canvas>
      )}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          s.chip,
          active ? s.chipActive : s.chipIdle,
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        <Text style={[s.text, active ? s.textActive : s.textIdle]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  // Höjden ger plats åt skenet; den negativa marginalen ger samma avstånd som förut
  scroll: { flexGrow: 0, height: 44 + GLOW, marginVertical: -GLOW / 2 },
  content: { gap: 8, flexDirection: "row", alignItems: "center" },
  chip: {
    flexShrink: 0,
    justifyContent: "center",
    paddingHorizontal: 18,
    // Asymmetrisk padding — Inter har mer "luft" under baslinjen än över,
    // så symmetrisk paddingVertical gör att texten ser urcentrerad ut.
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 9999,
  },
  chipActive: {
    backgroundColor: c.gold,
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
