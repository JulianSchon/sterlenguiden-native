import { useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet } from "react-native";
import Reanimated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useCreateList } from "@/hooks/useLists";
import { useFriendships } from "@/hooks/useFriends";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { MemberAvatarStack } from "@/components/lists/MemberAvatarStack";
import { FriendPickerRow, RING_ROOM } from "@/components/lists/FriendPickerRow";
import { Sheet, PrimaryButton, SecondaryButton, useSheetInput } from "@/components/Sheet";
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


export function CreateListSheet({
  visible, onClose, onCreated,
}: { visible: boolean; onClose: () => void; onCreated: (listId: string) => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  // Medlemsvalet är ett EGET STEG i samma modal, inte en andra fristående Modal ovanpå — två
  // oberoende <Modal> samtidigt gav en opålitlig z-ordning på iOS (tryck på + gjorde ingenting).
  const [step, setStep] = useState<"form" | "picker">("form");
  const create = useCreateList();
  const sheetInput = useSheetInput();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const { data: friendships = [] } = useFriendships();
  const friends = friendships.filter((f) => f.friendStatus === "accepted");
  const selectedFriends = friends.filter((f) => friendIds.has(f.userId));
  const nameInputRef = useRef<TextInput>(null);

  function toggleFriend(userId: string) {
    setFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function reset() {
    setName("");
    setDescription("");
    setFriendIds(new Set());
    setStep("form");
  }

  async function submit() {
    const id = await create.mutateAsync({ name, description, friendIds: [...friendIds] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    reset();
    onClose();
    onCreated(id);
  }

  function handleClose() {
    setStep("form");
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      title={i18n.t(step === "picker" ? "lists.create.members" : "lists.create.title")}
      centered
      onShow={() => { if (step === "form") nameInputRef.current?.focus(); }}
    >
      {step === "form" ? (
        <Reanimated.View entering={SlideInRight.duration(220)} exiting={SlideOutLeft.duration(160)} style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={s.label}>{i18n.t("lists.create.name")}</Text>
            <TextInput
              ref={nameInputRef}
              style={sheetInput}
              value={name}
              onChangeText={setName}
              maxLength={60}
              placeholder={i18n.t("lists.create.namePlaceholder")}
              placeholderTextColor={colors.faint}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={s.label}>{i18n.t("lists.create.description")}</Text>
            <TextInput
              style={[sheetInput, { minHeight: 80, textAlignVertical: "top" }]}
              value={description}
              onChangeText={setDescription}
              maxLength={180}
              multiline
              placeholder={i18n.t("lists.create.optional")}
              placeholderTextColor={colors.faint}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={s.label}>{i18n.t("lists.create.members")}</Text>
            <MemberAvatarStack
              ringColor={colors.card}
              onAddPress={() => setStep("picker")}
              members={[
                { userId: "me", name: profile?.display_name ?? "?", avatarUri: avatarUrl, circleColor: profile?.circle_color ?? null, avatarRing: profile?.avatar_ring ?? null },
                ...selectedFriends.map((f) => ({ userId: f.userId, name: f.displayName ?? f.username ?? "?", circleColor: f.circleColor, avatarRing: f.avatarRing })),
              ]}
            />
          </View>
          {create.isError && (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#E57373" }}>
              {i18n.t("lists.create.failed")}
            </Text>
          )}
          <PrimaryButton label={i18n.t("lists.create.submit")} onPress={submit} disabled={!name.trim()} loading={create.isPending} />
        </Reanimated.View>
      ) : (
        <Reanimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ gap: 12 }}>
          {friends.length === 0 ? (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.muted, paddingVertical: 12 }}>
              {i18n.t("lists.create.noFriends")}
            </Text>
          ) : (
            <ScrollView
              style={{ maxHeight: 280, marginHorizontal: -RING_ROOM, marginTop: -RING_ROOM }}
              contentContainerStyle={{ paddingHorizontal: RING_ROOM, paddingTop: RING_ROOM }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ gap: 4 }}>
                {friends.map((f) => (
                  <FriendPickerRow key={f.userId} friend={f} selected={friendIds.has(f.userId)} onToggle={() => toggleFriend(f.userId)} />
                ))}
              </View>
            </ScrollView>
          )}
          <SecondaryButton label={i18n.t("lists.create.done")} onPress={() => setStep("form")} />
        </Reanimated.View>
      )}
    </Sheet>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted },
});
