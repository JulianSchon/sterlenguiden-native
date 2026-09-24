/** Sök bland platserna och lägg till dem i en lista. */
import { useState } from "react";
import { View, Text, TextInput, FlatList, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Check, Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useSearchPlaces, firstImageUrl } from "@/hooks/usePlaces";
import { useAddPlaceToList } from "@/hooks/useLists";
import { Sheet, sheetInput } from "./Sheet";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";

export function AddPlaceSheet({
  visible, onClose, listId, existingPlaceIds,
}: { visible: boolean; onClose: () => void; listId: string; existingPlaceIds: number[] }) {
  const [query, setQuery] = useState("");
  const { data: places = [] } = useSearchPlaces(query);
  const add = useAddPlaceToList();

  return (
    <Sheet visible={visible} onClose={onClose} title="Lägg till plats" tall>
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
          const added = existingPlaceIds.includes(p.id) || (add.isSuccess && add.variables?.placeId === p.id);
          return (
            <TouchableOpacity
              style={s.row}
              disabled={added}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                add.mutate({ listId, placeId: p.id });
              }}
            >
              {firstImageUrl(p.image_url) ? <Image source={{ uri: firstImageUrl(p.image_url)! }} style={s.thumb} /> : <View style={s.thumb} />}
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{p.name}</Text>
                {p.nearest_town ? <Text style={s.sub} numberOfLines={1}>{p.nearest_town}</Text> : null}
              </View>
              {added ? <Check size={20} color="#C5A059" strokeWidth={2.5} /> : <Plus size={20} color={MUTED} strokeWidth={2} />}
            </TouchableOpacity>
          );
        }}
      />
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 1 },
});
