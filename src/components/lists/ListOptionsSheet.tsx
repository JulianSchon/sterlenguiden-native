/** ⋮-menyn på listsidan — bara ägaren kan öppna den längre (huvudsidans header visar en direkt
 * "Lämna listan"-knapp i stället för ⋮ åt alla andra medlemmar), så alla raderna gäller
 * numera alltid ägaren. Inget isOwner-villkor kvar att gissa på här.
 *
 * Överst "Synlig för vänner": ett reglage som slås av och på direkt, utan att menyn stängs. */
import { View, Text, StyleSheet } from "react-native";
import { Image as ImageIcon, Pencil, Share2, Copy, Trash2, Users } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { PressableScale } from "@/components/PressableScale";
import { IconSwitch } from "@/components/IconSwitch";
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


export function ListOptionsSheet({
  visible, onClose, onClosed, visibleToFriends, onToggleVisibleToFriends, onChangeCover, onEdit, onShare, onDuplicate, onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  /** Menyn är helt stängd (då får nästa sak öppnas) */
  onClosed: () => void;
  visibleToFriends: boolean;
  onToggleVisibleToFriends: (visible: boolean) => void;
  onChangeCover: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <Sheet visible={visible} onClose={onClose} onClosed={onClosed} title={i18n.t("lists.options")}>
      <View style={{ gap: 8 }}>
        <View style={s.row}>
          <View style={s.iconWrap}><Users size={18} color={colors.text} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{i18n.t("lists.optionsSheet.visible")}</Text>
            <Text style={s.hint}>{i18n.t("lists.optionsSheet.visibleHint")}</Text>
          </View>
          {/* Samma reglage som på Notiser (grön bock / rött kryss) */}
          <IconSwitch value={visibleToFriends} onChange={onToggleVisibleToFriends} />
        </View>
        <OptionRow icon={<ImageIcon size={18} color={colors.text} strokeWidth={2} />} label={i18n.t("lists.optionsSheet.cover")} onPress={onChangeCover} />
        <OptionRow icon={<Pencil size={18} color={colors.text} strokeWidth={2} />} label={i18n.t("lists.optionsSheet.edit")} onPress={onEdit} />
        <OptionRow icon={<Share2 size={18} color={colors.text} strokeWidth={2} />} label={i18n.t("lists.optionsSheet.share")} onPress={onShare} />
        <OptionRow icon={<Copy size={18} color={colors.text} strokeWidth={2} />} label={i18n.t("lists.optionsSheet.duplicate")} onPress={onDuplicate} />
        <OptionRow icon={<Trash2 size={18} color="#E57373" strokeWidth={2} />} label={i18n.t("lists.optionsSheet.delete")} danger onPress={onDelete} />
      </View>
    </Sheet>
  );
}

function OptionRow({ icon, label, danger, onPress }: { icon: React.ReactNode; label: string; danger?: boolean; onPress: () => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <PressableScale style={s.row} scale={0.98} onPress={onPress}>
      <View style={s.iconWrap}>{icon}</View>
      <Text style={[s.label, danger && { color: "#E57373" }]}>{label}</Text>
    </PressableScale>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14,
    backgroundColor: c.fill,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: c.fill,
    alignItems: "center", justifyContent: "center",
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 15, color: c.text },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, marginTop: 2 },
});
