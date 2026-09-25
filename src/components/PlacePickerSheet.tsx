/** Sök bland platserna och välj en. Används av listor och minnen. */
import { useState } from "react";
import { View, Text, TextInput, FlatList, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Check, Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useSearchPlaces, firstImageUrl, type Place } from "@/hooks/usePlaces";
import { Sheet, useSheetInput } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function PlacePickerSheet({
  visible, onClose, title, selectedIds, onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Platser som redan är valda (visas med bock och går inte att välja igen) */
  selectedIds: number[];
  onPick: (place: Place) => void;
}) {
  const [query, setQuery] = useState("");
  const { data: places = [] } = useSearchPlaces(query);
  const sheetInput = useSheetInput();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);

  return (
    <Sheet visible={visible} onClose={onClose} title={title} tall>
      <TextInput
        style={sheetInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Sök plats"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCorrect={false}
      />
      <FlatList
        style={{ marginTop: 12 }}
        data={places.slice(0, 50)}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: p }) => {
          const selected = selectedIds.includes(p.id);
          const image = firstImageUrl(p.image_url);
          return (
            <TouchableOpacity
              style={s.row}
              disabled={selected}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPick(p);
              }}
            >
              {image ? <Image source={{ uri: image }} style={s.thumb} /> : <View style={s.thumb} />}
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{p.name}</Text>
                {p.nearest_town ? <Text style={s.sub} numberOfLines={1}>{p.nearest_town}</Text> : null}
              </View>
              {selected ? <Check size={20} color={colors.goldText} strokeWidth={2.5} /> : <Plus size={20} color={colors.muted} strokeWidth={2} />}
            </TouchableOpacity>
          );
        }}
      />
    </Sheet>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: c.fill },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, marginTop: 1 },
});
