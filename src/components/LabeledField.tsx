/** Textfält med ikon och etikett; ramen blir guld när fältet är valt. */
import { useState } from "react";
import { View, Text, TextInput, StyleSheet, type TextInputProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function LabeledField({ icon: Icon, label, multiline, ...input }: { icon: LucideIcon; label: string } & TextInputProps) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={s.labelRow}>
        <Icon size={13} color={colors.muted} strokeWidth={1.8} />
        <Text style={s.label}>{label}</Text>
      </View>
      <TextInput
        {...input}
        multiline={multiline}
        style={[s.input, multiline && s.multiline, focused && { borderColor: colors.gold }, input.style]}
        placeholderTextColor={colors.faint}
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.muted },
  // fontSize 16 hindrar iOS från att zooma in vid fokus
  input: {
    fontFamily: "Inter_400Regular", fontSize: 16, color: c.text, backgroundColor: c.raised,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: c.borderStrong,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
});
