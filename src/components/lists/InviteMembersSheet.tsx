/**
 * "+" på en befintlig listas medlemsrad — bjud in fler vänner. Samma radkomponent som
 * medlemsvalet i Ny lista, men en egen fristående Sheet (ingen nested-modal-problematik här
 * eftersom listsidan inte redan har en modal öppen ovanpå den).
 */
import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { useAddListMembers } from "@/hooks/useLists";
import { useFriendships } from "@/hooks/useFriends";
import { FriendPickerRow } from "@/components/lists/FriendPickerRow";
import { Sheet, PrimaryButton } from "@/components/Sheet";

const MUTED = "rgba(245,241,232,0.55)";

export function InviteMembersSheet({
  visible, onClose, listId, existingMemberIds,
}: { visible: boolean; onClose: () => void; listId: string; existingMemberIds: string[] }) {
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const { data: friendships = [] } = useFriendships();
  const addMembers = useAddListMembers();
  const existing = new Set(existingMemberIds);
  const invitable = friendships.filter((f) => f.friendStatus === "accepted" && !existing.has(f.userId));

  function toggleFriend(userId: string) {
    setFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  async function submit() {
    await addMembers.mutateAsync({ listId, friendIds: [...friendIds] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setFriendIds(new Set());
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Bjud in medlemmar" centered>
      <View style={{ gap: 12 }}>
        {invitable.length === 0 ? (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, paddingVertical: 12 }}>
            Alla dina vänner är redan med i listan.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 4 }}>
              {invitable.map((f) => (
                <FriendPickerRow key={f.userId} friend={f} selected={friendIds.has(f.userId)} onToggle={() => toggleFriend(f.userId)} />
              ))}
            </View>
          </ScrollView>
        )}
        <PrimaryButton label="Bjud in" onPress={submit} disabled={friendIds.size === 0} loading={addMembers.isPending} />
      </View>
    </Sheet>
  );
}
