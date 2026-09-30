/** "Redigera lista" i alternativ-menyn — samma fältstil som Ny lista, fast bara Namn/Beskrivning
 * (Medlemmar hanteras separat, via + på listsidans egen medlemsrad). */
import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import * as Haptics from "expo-haptics";
import { useUpdateList, type ListDetail } from "@/hooks/useLists";
import { Sheet, PrimaryButton, useSheetInput } from "@/components/Sheet";

const MUTED = "rgba(245,241,232,0.55)";

export function EditListSheet({
  visible, onClose, list,
}: { visible: boolean; onClose: () => void; list: ListDetail }) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const update = useUpdateList();
  const sheetInput = useSheetInput();
  const nameInputRef = useRef<TextInput>(null);

  // Fälten ska matcha listans nuvarande värden varje gång panelen öppnas igen (inte det som stod
  // kvar sist, om man stängde utan att spara).
  useEffect(() => {
    if (visible) {
      setName(list.name);
      setDescription(list.description ?? "");
    }
  }, [visible, list.name, list.description]);

  async function submit() {
    await update.mutateAsync({ listId: list.id, name, description });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Redigera lista" centered onShow={() => nameInputRef.current?.focus()}>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED }}>Namn</Text>
          <TextInput ref={nameInputRef} style={sheetInput} value={name} onChangeText={setName} maxLength={60} placeholderTextColor="rgba(255,255,255,0.35)" />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED }}>Beskrivning</Text>
          <TextInput
            style={[sheetInput, { minHeight: 80, textAlignVertical: "top" }]}
            value={description}
            onChangeText={setDescription}
            maxLength={180}
            multiline
            placeholder="Valfritt"
            placeholderTextColor="rgba(255,255,255,0.35)"
          />
        </View>
        {update.isError && (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#E57373" }}>
            Det gick inte att spara. Försök igen.
          </Text>
        )}
        <PrimaryButton label="Spara" onPress={submit} disabled={!name.trim()} loading={update.isPending} />
      </View>
    </Sheet>
  );
}
