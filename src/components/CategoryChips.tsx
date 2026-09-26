/**
 * CategoryChips — delad pill-rad för kategorifilter.
 * Används av Förmåner och Favoriter, exakt samma utseende på båda.
 *
 * Aktiv: solid guld. Inaktiv: dämpad yta med dämpad text. Tryck: scale(0.95).
 * Det valda pillret glider till mitten av raden så att pillren bredvid syns.
 * Färgerna följer temat. `inset` är sidomarginalen så raden kan gå kant i kant
 * på en sida som har egen marginal.
 */
import { useEffect, useRef } from "react";
import { Pressable, Text, ScrollView, View, StyleSheet } from "react-native";
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
  const scrollRef = useRef<ScrollView>(null);
  const slots = useRef<Record<string, { x: number; w: number }>>({});
  const viewportW = useRef(0);
  const contentW = useRef(0);

  // Mitten på det valda pillret till mitten av raden, men aldrig förbi ändarna
  useEffect(() => {
    const slot = slots.current[activeId];
    if (!slot || viewportW.current === 0) return;
    const max = Math.max(0, contentW.current - viewportW.current);
    const x = Math.min(max, Math.max(0, slot.x + slot.w / 2 - viewportW.current / 2));
    scrollRef.current?.scrollTo({ x, animated: true });
  }, [activeId]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.scroll}
      contentContainerStyle={[s.content, { paddingHorizontal: inset }]}
      onLayout={(e) => { viewportW.current = e.nativeEvent.layout.width; }}
      onContentSizeChange={(w) => { contentW.current = w; }}
    >
      {chips.map((c) => (
        <Chip
          key={c.id}
          label={c.label}
          active={c.id === activeId}
          onPress={() => onChange(c.id)}
          onSlot={(x, w) => { slots.current[c.id] = { x, w }; }}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label, active, onPress, onSlot,
}: { label: string; active: boolean; onPress: () => void; onSlot: (x: number, w: number) => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <View onLayout={(e) => onSlot(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}>
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
  scroll: { flexGrow: 0, height: 44 },
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
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
