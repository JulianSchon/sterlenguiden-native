/**
 * Bottenpanel som listdialogerna delar, plus huvudknappen och textfältens
 * stil. Färgerna kommer från temat.
 */
import type { ReactNode } from "react";
import {
  Modal, View, Text, Pressable, TouchableOpacity, KeyboardAvoidingView, ActivityIndicator,
  Platform, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function Sheet({
  visible, onClose, title, tall = false, centered = false, children,
}: { visible: boolean; onClose: () => void; title: string; tall?: boolean; centered?: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <Modal visible={visible} transparent animationType={centered ? "fade" : "slide"} onRequestClose={onClose}>
      {/* Bakgrunden ligger som en egen helskärmslager under allt, så den täcker skärmen i båda
          lägena oavsett var innehållet hamnar (nederkant eller mitten). */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={centered ? s.centerWrap : { flex: 1, justifyContent: "flex-end" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
        >
          <View
            style={[
              centered ? s.centerSheet : s.sheet,
              tall && !centered && { height: "85%" },
              !centered && { paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={s.head}>
              <Text style={s.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <X size={22} color={colors.muted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function PrimaryButton({
  label, onPress, disabled = false, loading = false,
}: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={[s.button, (disabled || loading) && { opacity: 0.4 }]}
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color={colors.onGold} /> : <Text style={s.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

/** Textfältens stil i paneler. fontSize 16 hindrar iOS från att zooma in vid fokus. */
export function useSheetInput() {
  const { colors } = useTheme();
  return {
    fontFamily: "Inter_400Regular", fontSize: 16, color: colors.text,
    backgroundColor: colors.raised, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.borderStrong,
  } as const;
}

/** Mörk variant för sidor som inte fått tema än (minnesformuläret). Byts mot useSheetInput när sidan migreras. */
export const sheetInput = {
  fontFamily: "Inter_400Regular", fontSize: 16, color: "#F5F1E8",
  backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12,
  paddingHorizontal: 14, paddingVertical: 12,
  borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
} as const;

const createStyles = (c: ThemeColors) => StyleSheet.create({
  sheet: {
    backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20,
  },
  // Poppar upp i mitten i stället för att åka upp från botten — Ny lista/Gå med i lista
  centerWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  centerSheet: {
    width: "100%", maxWidth: 420,
    backgroundColor: c.card, borderRadius: 24, padding: 20,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  // Playfair bort — bara för personnamn i appen numera
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: c.text },
  button: { backgroundColor: c.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: c.onGold },
});
