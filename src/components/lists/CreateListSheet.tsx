import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Check, Plus } from "lucide-react-native";
import { useCreateList } from "@/hooks/useLists";
import { useFriendships } from "@/hooks/useFriends";
import { useProfile } from "@/hooks/useProfile";
import { Avatar } from "@/components/profile/Avatar";
import { Sheet, PrimaryButton, useSheetInput } from "@/components/Sheet";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

export function CreateListSheet({
  visible, onClose, onCreated,
}: { visible: boolean; onClose: () => void; onCreated: (listId: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const create = useCreateList();
  const sheetInput = useSheetInput();
  const { data: profile } = useProfile();
  const { data: friendships = [] } = useFriendships();
  const friends = friendships.filter((f) => f.friendStatus === "accepted");
  const selectedFriends = friends.filter((f) => friendIds.has(f.userId));
  const nameInputRef = useRef<TextInput>(null);

  // Tangentbordet ska redan vara uppe när popupen dyker upp.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => nameInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [visible]);

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
    <>
      <Sheet visible={visible} onClose={onClose} title="Ny lista" centered>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Namn</Text>
            <TextInput
              ref={nameInputRef}
              style={sheetInput}
              value={name}
              onChangeText={setName}
              maxLength={60}
              placeholder="T.ex. Bästa caféerna"
              placeholderTextColor="rgba(255,255,255,0.35)"
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Beskrivning</Text>
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
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Medlemmar</Text>
            <View style={s.memberRow}>
              <Avatar
                size={40}
                uri={null}
                name={profile?.display_name ?? "?"}
                color={profile?.circle_color ?? "#2A2A2A"}
                ring={profile?.avatar_ring}
              />
              {selectedFriends.map((f) => (
                <Avatar key={f.userId} size={40} uri={null} name={f.displayName ?? f.username ?? "?"} color={f.circleColor ?? "#2A2A2A"} ring={f.avatarRing} />
              ))}
              {friends.length > 0 && (
                <TouchableOpacity style={s.addCircle} onPress={() => setPickerOpen(true)} activeOpacity={0.75}>
                  <Plus size={18} color={GOLD} strokeWidth={2.4} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {create.isError && (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#E57373" }}>
              Det gick inte att skapa listan. Försök igen.
            </Text>
          )}
          <PrimaryButton label="Skapa lista" onPress={submit} disabled={!name.trim()} loading={create.isPending} />
        </View>
      </Sheet>

      {/* Egen popup ovanpå Ny lista-popupen — trycker man "+" väljer man vilka vänner som ska
          bjudas in, sen tillbaka till formuläret där de nu syns som avatarer i raden. */}
      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Bjud in medlemmar" centered>
        <View style={{ gap: 12 }}>
          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 4 }}>
              {friends.map((f) => {
                const selected = friendIds.has(f.userId);
                return (
                  <TouchableOpacity
                    key={f.userId}
                    style={[s.friendRow, selected && { backgroundColor: "rgba(197,160,89,0.12)" }]}
                    onPress={() => toggleFriend(f.userId)}
                    activeOpacity={0.7}
                  >
                    <Avatar size={36} uri={null} name={f.displayName ?? f.username ?? "?"} color={f.circleColor ?? "#2A2A2A"} ring={f.avatarRing} />
                    <Text style={s.friendName} numberOfLines={1}>{f.displayName || f.username}</Text>
                    <View style={[s.checkCircle, selected && { backgroundColor: GOLD, borderWidth: 0 }]}>
                      {selected && <Check size={13} color="#0B0B0D" strokeWidth={3} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <PrimaryButton label="Klar" onPress={() => setPickerOpen(false)} />
        </View>
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addCircle: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1.5, borderColor: GOLD, borderStyle: "dashed",
  },
  friendRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
  },
  friendName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: FG },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)",
  },
});
