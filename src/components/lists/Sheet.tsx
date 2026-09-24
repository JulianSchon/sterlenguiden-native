/**
 * Bottenpanel som alla listdialoger delar (skapa, gå med, lägg till plats,
 * spara i lista), plus den guldiga huvudknappen.
 */
import type { ReactNode } from "react";
import {
  Modal, View, Text, Pressable, TouchableOpacity, KeyboardAvoidingView, ActivityIndicator,
  Platform, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

const FG = "#F5F1E8";
const GOLD = "#C5A059";

export function Sheet({
  visible, onClose, title, tall = false, children,
}: { visible: boolean; onClose: () => void; title: string; tall?: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, tall && { height: "85%" }, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.head}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={22} color="rgba(255,255,255,0.6)" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PrimaryButton({
  label, onPress, disabled = false, loading = false,
}: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <TouchableOpacity
      style={[s.button, (disabled || loading) && { opacity: 0.4 }]}
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color="#121212" /> : <Text style={s.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

/** Gemensam stil för textfälten i panelerna. fontSize 16 hindrar iOS från att zooma vid fokus. */
export const sheetInput = {
  fontFamily: "Inter_400Regular", fontSize: 16, color: FG,
  backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12,
  paddingHorizontal: 14, paddingVertical: 12,
  borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
} as const;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#1A1A1D", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG },
  button: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#121212" },
});
