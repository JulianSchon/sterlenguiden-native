/**
 * "+" på listans avatarstack öppnar denna: Medlemmar. Visar först de som redan är med (klick på
 * en rad → deras profil; ägaren får dessutom ett val mellan Visa profil/Ta bort från lista), och
 * sedan en sektion för att bjuda in fler vänner — samma yta, inte två separata vyer.
 */
import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAddListMembers, useRemoveMember, type ListMember } from "@/hooks/useLists";
import { useFriendships } from "@/hooks/useFriends";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import { FriendPickerRow } from "@/components/lists/FriendPickerRow";
import { Sheet, PrimaryButton } from "@/components/Sheet";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";

export function MembersSheet({
  visible, onClose, listId, isOwner, members,
}: { visible: boolean; onClose: () => void; listId: string; isOwner: boolean; members: ListMember[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const avatarUrl = useAvatarUrl();
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const { data: friendships = [] } = useFriendships();
  const addMembers = useAddListMembers();
  const removeMember = useRemoveMember();
  const existing = new Set(members.map((m) => m.userId));
  const invitable = friendships.filter((f) => f.friendStatus === "accepted" && !existing.has(f.userId));

  function toggleFriend(userId: string) {
    setFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function openMember(member: ListMember) {
    const viewProfile = () => {
      onClose();
      router.push({ pathname: "/friend/[id]", params: { id: member.userId } });
    };
    if (isOwner && member.userId !== user?.id) {
      Alert.alert(member.name, undefined, [
        { text: "Visa profil", onPress: viewProfile },
        { text: "Ta bort från lista", style: "destructive", onPress: () => removeMember.mutate({ listId, userId: member.userId }) },
        { text: "Avbryt", style: "cancel" },
      ]);
    } else {
      viewProfile();
    }
  }

  async function submit() {
    await addMembers.mutateAsync({ listId, friendIds: [...friendIds] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setFriendIds(new Set());
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Medlemmar" centered>
      <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 2, marginBottom: 18 }}>
          {members.map((m) => (
            <PressableScale key={m.userId} style={s.memberRow} scale={0.98} onPress={() => openMember(m)}>
              <Avatar size={36} uri={m.userId === user?.id ? avatarUrl : null} name={m.name} color={m.circleColor ?? "#2A2A2A"} ring={m.avatarRing} />
              <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
              <ChevronRight size={18} color={MUTED} strokeWidth={2} />
            </PressableScale>
          ))}
        </View>

        <Text style={s.sectionLabel}>Bjud in</Text>
        {invitable.length === 0 ? (
          <Text style={s.emptyText}>Alla dina vänner är redan med i listan.</Text>
        ) : (
          <View style={{ gap: 4 }}>
            {invitable.map((f) => (
              <FriendPickerRow key={f.userId} friend={f} selected={friendIds.has(f.userId)} onToggle={() => toggleFriend(f.userId)} />
            ))}
          </View>
        )}
      </ScrollView>
      <View style={{ marginTop: 14 }}>
        <PrimaryButton label="Bjud in" onPress={submit} disabled={friendIds.size === 0} loading={addMembers.isPending} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  memberName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: FG },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, paddingVertical: 8 },
});
