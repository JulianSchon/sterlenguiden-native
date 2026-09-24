import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import * as Haptics from "expo-haptics";
import { useCreateList } from "@/hooks/useLists";
import { Sheet, PrimaryButton, sheetInput } from "@/components/Sheet";

export function CreateListSheet({
  visible, onClose, onCreated,
}: { visible: boolean; onClose: () => void; onCreated: (listId: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateList();

  async function submit() {
    const id = await create.mutateAsync({ name, description });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setName("");
    setDescription("");
    onClose();
    onCreated(id);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Ny lista">
      <View style={{ gap: 12 }}>
        <TextInput
          style={sheetInput}
          value={name}
          onChangeText={setName}
          maxLength={60}
          placeholder="T.ex. Bästa caféerna"
          placeholderTextColor="rgba(255,255,255,0.35)"
        />
        <TextInput
          style={[sheetInput, { minHeight: 80, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          maxLength={180}
          multiline
          placeholder="Beskrivning (valfritt)"
          placeholderTextColor="rgba(255,255,255,0.35)"
        />
        {create.isError && (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#E57373" }}>
            Det gick inte att skapa listan. Försök igen.
          </Text>
        )}
        <PrimaryButton label="Skapa lista" onPress={submit} disabled={!name.trim()} loading={create.isPending} />
      </View>
    </Sheet>
  );
}
