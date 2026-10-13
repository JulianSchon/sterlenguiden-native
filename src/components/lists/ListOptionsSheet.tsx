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

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.6)";

export function ListOptionsSheet({
  visible, onClose, visibleToFriends, onToggleVisibleToFriends, onChangeCover, onEdit, onShare, onDuplicate, onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  visibleToFriends: boolean;
  onToggleVisibleToFriends: (visible: boolean) => void;
  onChangeCover: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Alternativ">
      <View style={{ gap: 8 }}>
        <View style={s.row}>
          <View style={s.iconWrap}><Users size={18} color={FG} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Synlig för vänner</Text>
            <Text style={s.hint}>Dina vänner ser listan på din profil men kan inte ändra den</Text>
          </View>
          {/* Samma reglage som på Notiser (grön bock / rött kryss) */}
          <IconSwitch value={visibleToFriends} onChange={onToggleVisibleToFriends} />
        </View>
        <OptionRow icon={<ImageIcon size={18} color={FG} strokeWidth={2} />} label="Byt omslagsbild" onPress={onChangeCover} />
        <OptionRow icon={<Pencil size={18} color={FG} strokeWidth={2} />} label="Redigera lista" onPress={onEdit} />
        <OptionRow icon={<Share2 size={18} color={FG} strokeWidth={2} />} label="Dela lista" onPress={onShare} />
        <OptionRow icon={<Copy size={18} color={FG} strokeWidth={2} />} label="Duplicera lista" onPress={onDuplicate} />
        <OptionRow icon={<Trash2 size={18} color="#E57373" strokeWidth={2} />} label="Radera lista" danger onPress={onDelete} />
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
  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 2 },
});
