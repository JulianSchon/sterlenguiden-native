/**
 * Sök bland platserna och välj en (minnen). Utan sökord står förslagen först: platserna man
 * besökt (senast först), sedan favoriterna, sedan alla andra i bokstavsordning — hela listan går
 * att scrolla igenom (FlatList ritar bara det som syns).
 */
import { useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Check, Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { usePlaces, useSearchPlaces, firstImageUrl, type Place } from "@/hooks/usePlaces";
import { useVisits } from "@/hooks/useVisits";
import { useFavorites } from "@/hooks/useFavorites";
import { Sheet, useSheetInput } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import i18n from "i18next";
import { Image as ExpoImage } from "expo-image";

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
  const searching = query.trim().length > 0;
  const { data: found = [] } = useSearchPlaces(query, searching);
  const { data: all = [] } = usePlaces();
  const { data: visits = [] } = useVisits();
  const { data: favorites = [] } = useFavorites();
  // Förslagen: besökta (senast först), favoriter, sedan resten i bokstavsordning
  const suggested = useMemo(() => {
    const rank = new Map<number, number>();
    visits.forEach((v, i) => { if (!rank.has(v.place_id)) rank.set(v.place_id, i); });
    const offset = visits.length;
    favorites.forEach((f, i) => { if (f.place_id != null && !rank.has(f.place_id)) rank.set(f.place_id, offset + i); });
    return [...all].sort((a, b) => {
      const ra = rank.get(a.id) ?? Infinity;
      const rb = rank.get(b.id) ?? Infinity;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name, "sv");
    });
  }, [all, visits, favorites]);
  const places = searching ? found : suggested;
  const sheetInput = useSheetInput();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);

  return (
    <Sheet visible={visible} onClose={onClose} title={title} tall>
      <TextInput
        style={sheetInput}
        value={query}
        onChangeText={setQuery}
        placeholder={i18n.t("problems.searchPlace")}
        placeholderTextColor={colors.faint}
        autoCorrect={false}
      />
      <FlatList
        style={{ marginTop: 12 }}
        data={places}
        initialNumToRender={14}
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
              {image ? <ExpoImage source={{ uri: image }} style={s.thumb} contentFit="cover" /> : <View style={s.thumb} />}
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
