/**
 * Avatarerna (eller "+") på listans sida öppnar denna: Medlemmar. Visar först de som redan är med
 * (klick på en rad → deras profil; ägaren får dessutom ett val mellan Visa profil/Ta bort från
 * lista), och för ägaren sedan en sektion för att bjuda in fler vänner — samma yta, inte två
 * separata vyer. Andra medlemmar kan inte bjuda in, och ser bara medlemmarna.
 *
 * Profilringarna sticker ut en bra bit utanför bilden, så raderna har luft runt bilden och
 * listan har marginal mot rutans kant — annars klipptes ringen.
 */
import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAddListMembers, useRemoveMember, type ListMember } from "@/hooks/useLists";
import { useFriendships } from "@/hooks/useFriends";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import { FriendPickerRow, RING_ROOM } from "@/components/lists/FriendPickerRow";
import { Sheet, PrimaryButton } from "@/components/Sheet";
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


export function MembersSheet({
  visible, onClose, listId, isOwner, members,
}: { visible: boolean; onClose: () => void; listId: string; isOwner: boolean; members: ListMember[] }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const router = useRouter();
  const { user } = useAuth();
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
    const isMe = member.userId === user?.id;
    // Sig själv ska inte gå att trycka på här — ledde tidigare till vänprofilen (fel sida, man
    // är ju inte sin egen vän) eller studsade runt mellan flikar. Egen rad gör nu ingenting.
    if (isMe) return;
    const viewProfile = () => {
      onClose();
      router.push({ pathname: "/friend/[id]", params: { id: member.userId } });
    };
    if (isOwner) {
      Alert.alert(member.name, undefined, [
        { text: i18n.t("lists.membersSheet.viewProfile"), onPress: viewProfile },
        {
          text: i18n.t(member.pending ? "lists.membersSheet.withdraw" : "lists.membersSheet.removeMember"),
          style: "destructive",
          onPress: () => removeMember.mutate({ listId, userId: member.userId }),
        },
        { text: i18n.t("lists.cancel"), style: "cancel" },
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
    <Sheet visible={visible} onClose={onClose} title={i18n.t("lists.membersSheet.title")} centered>
      <ScrollView
        style={{ maxHeight: 400, marginHorizontal: -RING_ROOM, marginTop: -RING_ROOM }}
        contentContainerStyle={{ paddingHorizontal: RING_ROOM, paddingTop: RING_ROOM }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 2, marginBottom: isOwner ? 18 : 0 }}>
          {members.map((m) => (
            <PressableScale key={m.userId} style={s.memberRow} scale={0.98} onPress={() => openMember(m)}>
              <View style={[s.avatarBox, m.pending && { opacity: 0.35 }]}>
                <Avatar size={36} path={m.avatarPath} name={m.name} color={m.circleColor ?? colors.fill} ring={m.avatarRing} />
              </View>
              <Text style={[s.memberName, m.pending && { color: colors.muted }]} numberOfLines={1}>{m.name}</Text>
              {m.pending && <Text style={s.pendingPill}>{i18n.t("lists.membersSheet.pending")}</Text>}
              {m.userId !== user?.id && <ChevronRight size={18} color={colors.muted} strokeWidth={2} />}
            </PressableScale>
          ))}
        </View>

        {isOwner && (<>
          <Text style={s.sectionLabel}>{i18n.t("lists.membersSheet.invite")}</Text>
          {invitable.length === 0 ? (
            <Text style={s.emptyText}>{i18n.t("lists.membersSheet.allIn")}</Text>
          ) : (
            <View style={{ gap: 4 }}>
              {invitable.map((f) => (
                <FriendPickerRow key={f.userId} friend={f} selected={friendIds.has(f.userId)} onToggle={() => toggleFriend(f.userId)} />
              ))}
            </View>
          )}
        </>)}
      </ScrollView>
      {isOwner && (
        <View style={{ marginTop: 14 }}>
          <PrimaryButton label={i18n.t("lists.membersSheet.invite")} onPress={submit} disabled={friendIds.size === 0} loading={addMembers.isPending} />
        </View>
      )}
    </Sheet>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12 },
  // Bilden med luft runt sig, så ringen inte går in i namnet
  avatarBox: { width: 60, height: 36, alignItems: "center", justifyContent: "center" },
  memberName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: c.text },
  pendingPill: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: c.muted, overflow: "hidden",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: c.fill,
  },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, paddingVertical: 8 },
});
