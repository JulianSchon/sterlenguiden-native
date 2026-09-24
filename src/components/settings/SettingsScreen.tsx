/**
 * Gemensam ram för alla inställningssidor: rubrik med tillbaka-knapp och en
 * scrollande yta. Färger kommer från temat.
 */
import type { ReactNode } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function SettingsScreen({
  title, right, compact = false, children,
}: { title: string; right?: ReactNode; compact?: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 44) }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {right}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.body, compact && s.bodyCompact, { paddingBottom: Math.max(insets.bottom, 16) + (compact ? 8 : 40) }]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    backgroundColor: c.bg,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: c.fill,
    alignItems: "center", justifyContent: "center",
  },
  // Samma rubrikstil som Mitt Österlen: versal Montserrat med luft mellan bokstäverna
  title: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, textTransform: "uppercase", color: c.text },
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 22 },
  // För sidor som ska rymmas utan att scrolla
  bodyCompact: { paddingTop: 10, gap: 14 },
});
