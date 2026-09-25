/** En knapp som smälter in: dämpad bakgrund i stället för accentfärg. */
import { Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function QuietButton({
  label, onPress, disabled, loading,
}: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={[s.button, (disabled || loading) && { opacity: 0.4 }]}
      activeOpacity={0.7}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color={colors.text} /> : <Text style={s.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  button: {
    height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  text: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text },
});
