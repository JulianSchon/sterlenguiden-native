/**
 * Omkopplare i iOS-stil, men med tydliga symboler: helt grön med bock när den
 * är på, grå med rött kryss när den är av.
 */
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { Check, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";

const WIDTH = 52;
const HEIGHT = 32;
const THUMB = 28;
const ON = "#34C759";
const CROSS = "#EF4444";

export function IconSwitch({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const { scheme } = useTheme();
  const offTrack = scheme === "dark" ? "#3A3A3C" : "#E5E5EA";
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(position, { toValue: value ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [value, position]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onChange(!value);
      }}
      style={[s.track, { backgroundColor: value ? ON : offTrack }]}
    >
      <Animated.View
        style={[
          s.thumb,
          { transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, WIDTH - THUMB - 4] }) }] },
        ]}
      >
        {value ? <Check size={17} color={ON} strokeWidth={3} /> : <X size={17} color={CROSS} strokeWidth={3} />}
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  track: { width: WIDTH, height: HEIGHT, borderRadius: HEIGHT / 2, padding: 2, justifyContent: "center" },
  thumb: {
    width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3, elevation: 3,
  },
});
