/**
 * En vän att kryssa i/ur i en inbjudningslista — egen komponent så varje rad kan ha sin egen
 * animerade färgövergång (bakgrund + kryssring) i stället för ett hårt style-byte, som kändes
 * som en märkbar fördröjning snarare än en riktig animation.
 */
import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming, interpolateColor } from "react-native-reanimated";
import { Check } from "lucide-react-native";
import type { FriendResult } from "@/hooks/useFriends";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


export function FriendPickerRow({ friend, selected, onToggle }: { friend: FriendResult; selected: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: 180 });
  }, [selected]);

  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["transparent", colors.goldSoft]),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["transparent", colors.goldText]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.borderStrong, colors.goldText]),
  }));
  const checkIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <PressableScale style={[s.friendRow, rowStyle]} scale={0.98} onPress={onToggle}>
      <View style={s.avatarBox}>
        <Avatar size={36} path={friend.avatarPath} name={friend.displayName ?? friend.username ?? "?"} color={friend.circleColor ?? colors.fill} ring={friend.avatarRing} />
      </View>
      <Text style={s.friendName} numberOfLines={1}>{friend.displayName || friend.username}</Text>
      <Reanimated.View style={[s.checkCircle, checkStyle]}>
        <Reanimated.View style={checkIconStyle}>
          <Check size={13} color={colors.bg} strokeWidth={3} />
        </Reanimated.View>
      </Reanimated.View>
    </PressableScale>
  );
}

/** Plats för profilringen utanför bilden — listan med rader behöver så mycket marginal mot rutans
 * kant (negativ marginal + lika mycket padding på sin ScrollView), annars klipps ringen */
export const RING_ROOM = 14;

const createStyles = (c: ThemeColors) => StyleSheet.create({
  friendRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12,
  },
  // Bilden med luft runt sig, så ringen inte går in i namnet
  avatarBox: { width: 60, height: 36, alignItems: "center", justifyContent: "center" },
  friendName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: c.text },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
  },
});
