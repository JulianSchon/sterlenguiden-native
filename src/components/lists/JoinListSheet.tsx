import { useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import * as Haptics from "expo-haptics";
import { useJoinList } from "@/hooks/useLists";
import { Sheet, PrimaryButton, useSheetInput } from "@/components/Sheet";
import i18n from "i18next";

export function JoinListSheet({
  visible, onClose, onJoined,
}: { visible: boolean; onClose: () => void; onJoined: (listId: string) => void }) {
  const [code, setCode] = useState("");
  const join = useJoinList();
  const sheetInput = useSheetInput();
  const inputRef = useRef<TextInput>(null);

  async function submit() {
    const id = await join.mutateAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCode("");
    onClose();
    onJoined(id);
  }

  const notFound = join.isError && join.error.message === "list_not_found";
  const tooMany = join.isError && join.error.message === "too_many_attempts";

  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t("lists.joinSheet.title")} centered onShow={() => inputRef.current?.focus()}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
          {i18n.t("lists.joinSheet.intro")}
        </Text>
        <TextInput
          ref={inputRef}
          style={[sheetInput, { letterSpacing: 3, textAlign: "center", fontFamily: "Inter_600SemiBold" }]}
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            join.reset();
          }}
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={i18n.t("lists.joinSheet.placeholder")}
          placeholderTextColor="rgba(255,255,255,0.35)"
        />
        {join.isError && (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#E57373" }}>
            {notFound
              ? i18n.t("lists.joinSheet.notFound")
              : tooMany
                ? i18n.t("lists.joinSheet.tooMany")
                : i18n.t("lists.joinSheet.failed")}
          </Text>
        )}
        <PrimaryButton label={i18n.t("lists.joinSheet.submit")} onPress={submit} disabled={code.trim().length < 4} loading={join.isPending} />
      </View>
    </Sheet>
  );
}
