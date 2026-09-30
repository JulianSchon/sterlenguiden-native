import { useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Check, Plus, ArrowLeft } from "lucide-react-native";
import { useCreateList } from "@/hooks/useLists";
import { useFriendships } from "@/hooks/useFriends";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { Avatar } from "@/components/profile/Avatar";
import { Sheet, PrimaryButton, useSheetInput } from "@/components/Sheet";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const CARD = "#1A1A1D";
const AVATAR_SIZE = 48;
const AVATAR_OVERLAP = 16;

export function CreateListSheet({
  visible, onClose, onCreated,
}: { visible: boolean; onClose: () => void; onCreated: (listId: string) => void }) {
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
      title={step === "picker" ? "Bjud in medlemmar" : "Ny lista"}
      centered
      onShow={() => { if (step === "form") nameInputRef.current?.focus(); }}
    >
      {step === "form" ? (
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
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* + är lika stor som avataren (48px), bara delvis bakom den — inte en liten badge */}
              <View style={{ width: AVATAR_SIZE + (AVATAR_SIZE - AVATAR_OVERLAP), height: AVATAR_SIZE }}>
                <TouchableOpacity
                  style={[s.addCircle, { left: AVATAR_SIZE - AVATAR_OVERLAP }]}
                  onPress={() => setStep("picker")}
                  activeOpacity={0.75}
                >
                  <Plus size={18} color="#0B0B0D" strokeWidth={3} />
                </TouchableOpacity>
                <View style={{ position: "absolute", left: 0, top: 0 }}>
                  <Avatar
                    size={AVATAR_SIZE}
                    uri={avatarUrl}
                    name={profile?.display_name ?? "?"}
                    color={profile?.circle_color ?? "#2A2A2A"}
                    ring={profile?.avatar_ring}
                  />
                </View>
              </View>
              {selectedFriends.length > 0 && (
                <View style={{ flexDirection: "row", marginLeft: 8, gap: 8 }}>
                  {selectedFriends.map((f) => (
                    <Avatar key={f.userId} size={40} uri={null} name={f.displayName ?? f.username ?? "?"} color={f.circleColor ?? "#2A2A2A"} ring={f.avatarRing} />
                  ))}
                </View>
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
      ) : (
        <View style={{ gap: 12 }}>
          <TouchableOpacity style={s.backRow} onPress={() => setStep("form")} hitSlop={8}>
            <ArrowLeft size={16} color={MUTED} strokeWidth={2.2} />
            <Text style={s.backText}>Tillbaka</Text>
          </TouchableOpacity>
          {friends.length === 0 ? (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, paddingVertical: 12 }}>
              Inga vänner att bjuda in än.
            </Text>
          ) : (
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
          )}
          <PrimaryButton label="Klar" onPress={() => setStep("form")} />
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED },
  // Samma storlek som avataren (inte en liten badge) — ligger bakom den, bara delvis synlig
  addCircle: {
    position: "absolute", top: 0, width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: CARD,
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED },
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
