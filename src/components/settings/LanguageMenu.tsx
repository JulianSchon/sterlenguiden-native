/** Språkväljare: en lista med runda flaggor som fälls ned från rubriken. */
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { LANGUAGES, currentLanguage, type LanguageCode } from "@/i18n";
import { RoundFlag } from "@/components/RoundFlag";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function LanguageMenu({
  visible, top, onSelect, onClose,
}: { visible: boolean; top: number; onSelect: (code: LanguageCode) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const selected = currentLanguage();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[s.menu, { top }]}>
        {LANGUAGES.map((lang, i) => (
          <TouchableOpacity
            key={lang.code}
            style={[s.row, i > 0 && s.rowBorder, selected === lang.code && s.rowActive]}
            activeOpacity={0.7}
            onPress={() => onSelect(lang.code)}
          >
            <RoundFlag code={lang.code} size={30} />
            <Text style={[s.name, selected === lang.code && { color: colors.goldText }]}>{lang.name}</Text>
            {selected === lang.code && <Check size={18} color={colors.goldText} strokeWidth={2.5} />}
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  menu: {
    position: "absolute", right: 16, minWidth: 210, borderRadius: 18, overflow: "hidden",
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  rowActive: { backgroundColor: c.goldSoft },
  name: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15, color: c.text },
});
