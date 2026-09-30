import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import Reanimated, {
  FadeIn, FadeOut, SlideInRight, SlideOutLeft, useAnimatedStyle, useSharedValue, withTiming, interpolateColor,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Check, Plus } from "lucide-react-native";
import { useCreateList } from "@/hooks/useLists";
import { useFriendships, type FriendResult } from "@/hooks/useFriends";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import { Sheet, PrimaryButton, SecondaryButton, useSheetInput } from "@/components/Sheet";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const CARD = "#1A1A1D";
const AVATAR_SIZE = 40;
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
        <Reanimated.View entering={SlideInRight.duration(220)} exiting={SlideOutLeft.duration(160)} style={{ gap: 14 }}>
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
            {/* En enda rad överlappande cirklar: min bild, sen tillagda vänner i tur och ordning,
                sist +. Varje ny cirkel ritas EFTER den förra och ligger därför delvis FRAMFÖR den
                — + ligger alltså alltid längst fram, och hänger med längst till höger i raden
                oavsett hur många som läggs till. */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={s.stackRing}>
                <Avatar size={AVATAR_SIZE} uri={avatarUrl} name={profile?.display_name ?? "?"} color={profile?.circle_color ?? "#2A2A2A"} ring={profile?.avatar_ring} />
              </View>
              {selectedFriends.map((f) => (
                <View key={f.userId} style={[s.stackRing, { marginLeft: -AVATAR_OVERLAP }]}>
                  <Avatar size={AVATAR_SIZE} uri={null} name={f.displayName ?? f.username ?? "?"} color={f.circleColor ?? "#2A2A2A"} ring={f.avatarRing} />
                </View>
              ))}
              <TouchableOpacity
                style={[s.addCircle, { marginLeft: -AVATAR_OVERLAP }]}
                onPress={() => setStep("picker")}
                activeOpacity={0.75}
              >
                <Plus size={18} color={GOLD} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          </View>
          {create.isError && (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#E57373" }}>
              Det gick inte att skapa listan. Försök igen.
            </Text>
          )}
          <PrimaryButton label="Skapa lista" onPress={submit} disabled={!name.trim()} loading={create.isPending} />
        </Reanimated.View>
      ) : (
        <Reanimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ gap: 12 }}>
          {friends.length === 0 ? (
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, paddingVertical: 12 }}>
              Inga vänner att bjuda in än.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 4 }}>
                {friends.map((f) => (
                  <FriendPickerRow key={f.userId} friend={f} selected={friendIds.has(f.userId)} onToggle={() => toggleFriend(f.userId)} />
                ))}
              </View>
            </ScrollView>
          )}
          <SecondaryButton label="Klar" onPress={() => setStep("form")} />
        </Reanimated.View>
      )}
    </Sheet>
  );
}

/** Egen komponent så varje rad kan ha sin egen animerade övergång (inte bara ett hårt style-byte,
 * som kändes som en synlig fördröjning snarare än en riktig animation). */
function FriendPickerRow({ friend, selected, onToggle }: { friend: FriendResult; selected: boolean; onToggle: () => void }) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: 180 });
  }, [selected]);

  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["rgba(255,255,255,0)", "rgba(197,160,89,0.12)"]),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["rgba(255,255,255,0)", GOLD]),
    borderColor: interpolateColor(progress.value, [0, 1], ["rgba(255,255,255,0.25)", GOLD]),
  }));
  const checkIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <PressableScale style={[s.friendRow, rowStyle]} scale={0.98} onPress={onToggle}>
      <Avatar size={36} uri={null} name={friend.displayName ?? friend.username ?? "?"} color={friend.circleColor ?? "#2A2A2A"} ring={friend.avatarRing} />
      <Text style={s.friendName} numberOfLines={1}>{friend.displayName || friend.username}</Text>
      <Reanimated.View style={[s.checkCircle, checkStyle]}>
        <Reanimated.View style={checkIconStyle}>
          <Check size={13} color="#0B0B0D" strokeWidth={3} />
        </Reanimated.View>
      </Reanimated.View>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: MUTED },
  // Bakgrundsfärgad ring runt varje cirkel i stacken (samma färg som popupens botten) så
  // överlappen läses som separata cirklar i stället för att bara smälta ihop.
  stackRing: {
    width: AVATAR_SIZE + 4, height: AVATAR_SIZE + 4, borderRadius: (AVATAR_SIZE + 4) / 2,
    backgroundColor: CARD, alignItems: "center", justifyContent: "center",
  },
  // Outline i stället för helt guldfylld — bara linjer i guld, som referensbilden
  addCircle: {
    width: AVATAR_SIZE + 4, height: AVATAR_SIZE + 4, borderRadius: (AVATAR_SIZE + 4) / 2,
    backgroundColor: "rgba(197,160,89,0.12)", alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: GOLD,
  },
  friendRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
  },
  friendName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: FG },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
  },
});
