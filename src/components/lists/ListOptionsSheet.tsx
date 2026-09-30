/** ⋮-menyn på listsidan — samma fem alternativ som Lovable-versionen. Byt omslagsbild/Redigera
 * lista är bara för ägaren (det är listans egna uppgifter); Dela/Duplicera funkar för alla
 * medlemmar; sista raden är Radera lista för ägaren, Lämna listan för alla andra. */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image as ImageIcon, Pencil, Share2, Copy, Trash2, LogOut } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { PressableScale } from "@/components/PressableScale";

const FG = "#F5F1E8";

export function ListOptionsSheet({
  visible, onClose, isOwner, onChangeCover, onEdit, onShare, onDuplicate, onDeleteOrLeave,
}: {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  onChangeCover: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onDeleteOrLeave: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Alternativ">
      <View style={{ gap: 8 }}>
        {isOwner && <OptionRow icon={<ImageIcon size={18} color={FG} strokeWidth={2} />} label="Byt omslagsbild" onPress={onChangeCover} />}
        {isOwner && <OptionRow icon={<Pencil size={18} color={FG} strokeWidth={2} />} label="Redigera lista" onPress={onEdit} />}
        <OptionRow icon={<Share2 size={18} color={FG} strokeWidth={2} />} label="Dela lista" onPress={onShare} />
        <OptionRow icon={<Copy size={18} color={FG} strokeWidth={2} />} label="Duplicera lista" onPress={onDuplicate} />
        {isOwner ? (
          <OptionRow icon={<Trash2 size={18} color="#E57373" strokeWidth={2} />} label="Radera lista" danger onPress={onDeleteOrLeave} />
        ) : (
          <OptionRow icon={<LogOut size={18} color="#E57373" strokeWidth={2} />} label="Lämna listan" danger onPress={onDeleteOrLeave} />
        )}
      </View>
    </Sheet>
  );
}

function OptionRow({ icon, label, danger, onPress }: { icon: React.ReactNode; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <PressableScale style={s.row} scale={0.98} onPress={onPress}>
      <View style={s.iconWrap}>{icon}</View>
      <Text style={[s.label, danger && { color: "#E57373" }]}>{label}</Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 15, color: FG },
});
