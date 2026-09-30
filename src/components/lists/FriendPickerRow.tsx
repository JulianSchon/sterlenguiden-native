/**
 * En vän att kryssa i/ur i en inbjudningslista — egen komponent så varje rad kan ha sin egen
 * animerade färgövergång (bakgrund + kryssring) i stället för ett hårt style-byte, som kändes
 * som en märkbar fördröjning snarare än en riktig animation.
 */
import { useEffect } from "react";
import { Text, StyleSheet } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming, interpolateColor } from "react-native-reanimated";
import { Check } from "lucide-react-native";
import type { FriendResult } from "@/hooks/useFriends";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";

const FG = "#F5F1E8";
const GOLD = "#C5A059";

export function FriendPickerRow({ friend, selected, onToggle }: { friend: FriendResult; selected: boolean; onToggle: () => void }) {
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
