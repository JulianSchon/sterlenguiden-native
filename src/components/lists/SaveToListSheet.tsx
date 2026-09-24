/** Från platssidan: välj vilken av dina listor platsen ska sparas i. */
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useLists, useAddPlaceToList } from "@/hooks/useLists";
import { ListCover } from "./ListCover";
import { Sheet } from "./Sheet";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";

export function SaveToListSheet({
  visible, onClose, placeId,
}: { visible: boolean; onClose: () => void; placeId: number }) {
  const { data: lists = [] } = useLists();
  const add = useAddPlaceToList();

  return (
    <Sheet visible={visible} onClose={onClose} title="Spara i lista">
      {lists.length === 0 ? (
        <Text style={s.empty}>Du har inga listor än. Skapa en under Mitt Österlen i din profil.</Text>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(l) => l.id}
          renderItem={({ item: l }) => {
            const saved = l.placeIds.includes(placeId);
            return (
              <TouchableOpacity
                style={s.row}
                disabled={saved}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  add.mutate({ listId: l.id, placeId });
                }}
              >
                <ListCover images={l.images} size={52} radius={10} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{l.name}</Text>
                  <Text style={s.sub}>{l.placeIds.length} platser</Text>
                </View>
                {saved && <Check size={20} color="#C5A059" strokeWidth={2.5} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, lineHeight: 21, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 1 },
});
