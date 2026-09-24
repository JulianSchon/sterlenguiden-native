import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import * as Haptics from "expo-haptics";
import { useJoinList } from "@/hooks/useLists";
import { Sheet, PrimaryButton, sheetInput } from "@/components/Sheet";

export function JoinListSheet({
  visible, onClose, onJoined,
}: { visible: boolean; onClose: () => void; onJoined: (listId: string) => void }) {
  const [code, setCode] = useState("");
  const join = useJoinList();

  async function submit() {
    const id = await join.mutateAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCode("");
    onClose();
    onJoined(id);
  }

  const notFound = join.isError && join.error.message === "list_not_found";

  return (
    <Sheet visible={visible} onClose={onClose} title="Gå med i lista">
      <View style={{ gap: 12 }}>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
          Skriv in koden du fått av den som äger listan.
        </Text>
        <TextInput
          style={[sheetInput, { letterSpacing: 3, textAlign: "center", fontFamily: "Inter_600SemiBold" }]}
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            join.reset();
          }}
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="KOD"
          placeholderTextColor="rgba(255,255,255,0.35)"
        />
        {join.isError && (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#E57373" }}>
            {notFound ? "Hittar ingen lista med den koden." : "Det gick inte att gå med. Försök igen."}
          </Text>
        )}
        <PrimaryButton label="Gå med" onPress={submit} disabled={code.trim().length < 4} loading={join.isPending} />
      </View>
    </Sheet>
  );
}
