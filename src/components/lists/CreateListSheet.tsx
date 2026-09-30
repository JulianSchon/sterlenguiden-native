import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";
import { useCreateList } from "@/hooks/useLists";
import { useFriendships } from "@/hooks/useFriends";
import { Avatar } from "@/components/profile/Avatar";
import { Sheet, PrimaryButton, useSheetInput } from "@/components/Sheet";

export function CreateListSheet({
  visible, onClose, onCreated,
}: { visible: boolean; onClose: () => void; onCreated: (listId: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const create = useCreateList();
  const sheetInput = useSheetInput();
  const { data: friendships = [] } = useFriendships();
  const friends = friendships.filter((f) => f.friendStatus === "accepted");

  function toggleFriend(userId: string) {
    setFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  async function submit() {
    const id = await create.mutateAsync({ name, description, friendIds: [...friendIds] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setName("");
    setDescription("");
    setFriendIds(new Set());
    onClose();
    onCreated(id);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Ny lista" centered>
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
        {friends.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
              Lägg till vänner (valfritt)
            </Text>
            <ScrollView style={{ maxHeight: 176 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 4 }}>
                {friends.map((f) => {
                  const selected = friendIds.has(f.userId);
                  return (
                    <TouchableOpacity
                      key={f.userId}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 10,
                        paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
                        backgroundColor: selected ? "rgba(197,160,89,0.12)" : "transparent",
                      }}
                      onPress={() => toggleFriend(f.userId)}
                      activeOpacity={0.7}
                    >
                      <Avatar size={32} uri={null} name={f.displayName ?? f.username ?? "?"} color={f.circleColor ?? "#2A2A2A"} ring={f.avatarRing} />
                      <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: "#F5F1E8" }} numberOfLines={1}>
                        {f.displayName || f.username}
                      </Text>
                      <View
                        style={{
                          width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
                          backgroundColor: selected ? "#C5A059" : "transparent",
                          borderWidth: selected ? 0 : 1.5, borderColor: "rgba(255,255,255,0.25)",
                        }}
                      >
                        {selected && <Check size={13} color="#0B0B0D" strokeWidth={3} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}
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
