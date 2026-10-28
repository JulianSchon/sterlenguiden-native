/**
 * "Vad gillar du?": appens kategorier som rutor att välja bland — i onboardingen och under
 * Konto › Intressen. Varje ruta har kategorins egen färg och symbol (inga lånade foton, och rutorna
 * syns direkt), och namnet står under rutan.
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { CATEGORIES, type CategoryId } from "@/theme/categories";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const GAP = 12;

export function InterestGrid({
  selected, onToggle, gutter,
}: {
  selected: CategoryId[];
  onToggle: (id: CategoryId) => void;
  /** Sidans luft mot kanterna, för att räkna ut rutornas bredd */
  gutter: number;
}) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - gutter * 2 - GAP) / 2);
  const chosen = useMemo(() => new Set(selected), [selected]);
  return (
    <View style={styles.grid}>
      {CATEGORIES.map((cat) => (
        <Tile
          key={cat.id}
          id={cat.id}
          width={tile}
          selected={chosen.has(cat.id)}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
}

function Tile({
  id, width, selected, onToggle,
}: {
  id: CategoryId; width: number; selected: boolean;
  onToggle: (id: CategoryId) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const cat = CATEGORIES.find((c) => c.id === id)!;
  const Icon = cat.icon;
  const height = Math.round(width * 0.78);
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onToggle(id);
      }}
      style={({ pressed }) => [{ width }, pressed && { opacity: 0.85 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={cat.label}
    >
      {/* Guldkanten ligger utanför färgytan, så den syns lika tydligt på alla färger */}
      <View style={[s.frame, { height }, selected && { borderColor: colors.gold }]}>
        <View style={[s.face, { backgroundColor: cat.screen }]}>
          {/* Ett tunt svart lager gör färgen lite mörkare, lika mycket i ljust och mörkt läge */}
          <View style={s.dim} />
          <Icon size={Math.round(width * 0.2)} color="#FFFFFF" strokeWidth={1.5} />
        </View>
      </View>
      <View style={s.row}>
        <Text style={s.label} numberOfLines={1}>{cat.label}</Text>
        <View style={[s.check, selected && { backgroundColor: colors.gold, borderColor: colors.gold }]}>
          {selected ? <Check size={13} color={colors.onGold} strokeWidth={3} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: GAP, rowGap: 18 },
});

const createStyles = (c: ThemeColors) => StyleSheet.create({
  frame: { borderRadius: 20, borderWidth: 2.5, borderColor: "transparent", padding: 2.5 },
  face: { flex: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dim: { ...StyleSheet.absoluteFillObject, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.15)" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9, paddingHorizontal: 2 },
  label: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.text },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
});
