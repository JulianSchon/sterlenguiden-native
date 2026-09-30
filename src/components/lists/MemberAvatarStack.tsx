/**
 * Rad med överlappande avatarer — en lista eller ett listformulärs medlemmar. Varje cirkel ritas
 * EFTER den förra och ligger därför delvis FRAMFÖR den (ingen manuell z-ordning behövs); en
 * valfri + (bara linjer i guld, ingen fylld cirkel) läggs sist och hänger därför alltid med
 * längst till höger/fram oavsett hur många som läggs till.
 *
 * Bakgrundsfärgad ring runt varje cirkel (samma färg som ytan den ligger på) så överlappen läses
 * som separata cirklar i stället för att smälta ihop.
 */
import { View, TouchableOpacity } from "react-native";
import { Plus } from "lucide-react-native";
import { Avatar } from "@/components/profile/Avatar";

const GOLD = "#C5A059";

export interface StackMember {
  userId: string;
  name: string;
  /** Bara satt för mig själv — andras avatarer visar alltid initialer, integritetsbeslut sedan Vänner-grunden */
  avatarUri?: string | null;
  circleColor: string | null;
  avatarRing: string | null;
}

export function MemberAvatarStack({
  members, size = 40, overlap = 16, ringColor, onAddPress,
}: { members: StackMember[]; size?: number; overlap?: number; ringColor: string; onAddPress?: () => void }) {
  const ringSize = size + 4;

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {members.map((m, i) => (
        <View
          key={m.userId}
          style={{
            width: ringSize, height: ringSize, borderRadius: ringSize / 2,
            backgroundColor: ringColor, alignItems: "center", justifyContent: "center",
            marginLeft: i > 0 ? -overlap : 0,
          }}
        >
          <Avatar size={size} uri={m.avatarUri ?? null} name={m.name} color={m.circleColor ?? "#2A2A2A"} ring={m.avatarRing} />
        </View>
      ))}
      {onAddPress && (
        <TouchableOpacity
          style={{
            width: ringSize, height: ringSize, borderRadius: ringSize / 2,
            backgroundColor: "rgba(197,160,89,0.12)", alignItems: "center", justifyContent: "center",
            borderWidth: 1.5, borderColor: GOLD,
            marginLeft: members.length > 0 ? -overlap : 0,
          }}
          onPress={onAddPress}
          activeOpacity={0.75}
        >
          <Plus size={Math.round(size * 0.38)} color={GOLD} strokeWidth={2.4} />
        </TouchableOpacity>
      )}
    </View>
  );
}
