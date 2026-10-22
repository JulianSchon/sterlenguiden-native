/**
 * Det på platssidan som handlar om en själv och ens vänner:
 * - FriendsHere: "Anna och Erik har varit här" med deras profilbilder; ett tryck visar alla och
 *   när de var där (samma saker som syns på deras profiler, se useFriendsAtPlace).
 * - TreasureHint: en skatt i närheten av platsen, och om man redan hittat den. Ett tryck visar
 *   skatten på kartan (där den ändå syns), så inget avslöjas som inte redan går att se.
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/profile/Avatar";
import { MemberAvatarStack } from "@/components/lists/MemberAvatarStack";
import { TreasurePin } from "@/components/stickers/TreasurePin";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/categories";
import { formatDate } from "@/i18n/dates";
import { formatDistance } from "@/lib/checkin";
import type { FriendAtPlace } from "@/hooks/useFriendsAtPlace";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "Anna", "Anna och Erik", "Anna, Erik och 3 vänner till" */
function nameList(people: FriendAtPlace[]): string {
  const names = people.map((p) => firstName(p.name));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} och ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} och ${rest} ${rest === 1 ? "vän" : "vänner"} till`;
}

/** "12 juni", eller "12 juni 2025" om det inte var i år */
function visitDate(iso: string): string {
  const d = new Date(iso);
  return formatDate(d, d.getFullYear() === new Date().getFullYear() ? "d MMMM" : "d MMMM yyyy");
}

export function FriendsHere({ friends, onPress }: { friends: FriendAtPlace[]; onPress: () => void }) {
  const { colors } = useTheme();
  if (friends.length === 0) return null;
  const visited = friends.filter((f) => f.lastVisit);
  const people = visited.length > 0 ? visited : friends;
  const title = `${nameList(people)} ${visited.length > 0 ? "har varit här" : "har sparat platsen"}`;
  const latest = visited[0];
  // Sparat men inte varit här: rubriken säger allt
  const detail = latest?.lastVisit ? `${firstName(latest.name)} var här ${visitDate(latest.lastVisit)}` : null;
  return (
    <TouchableOpacity
      style={[s.friends, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <MemberAvatarStack
        members={people.slice(0, 3).map((f) => ({
          userId: f.userId, name: f.name, avatarPath: f.avatarPath, circleColor: f.circleColor, avatarRing: null,
        }))}
        size={34}
        overlap={12}
        ringColor={colors.card}
      />
      <View style={{ flex: 1 }}>
        <Text style={[s.friendsTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
        {!!detail && <Text style={[s.friendsDetail, { color: colors.muted }]} numberOfLines={1}>{detail}</Text>}
      </View>
      <ChevronRight size={20} color={colors.faint} strokeWidth={2} />
    </TouchableOpacity>
  );
}

/** Alla vänner som varit här (eller sparat platsen), senast först. Ett tryck öppnar profilen */
export function FriendsSheet({ visible, friends, onClose, onOpenFriend }: {
  visible: boolean;
  friends: FriendAtPlace[];
  onClose: () => void;
  onOpenFriend: (userId: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Vänner här">
      <View style={{ gap: 4 }}>
        {friends.map((f) => (
          <TouchableOpacity key={f.userId} style={s.friendRow} activeOpacity={0.7} onPress={() => onOpenFriend(f.userId)}>
            <Avatar size={44} path={f.avatarPath} name={f.name} color={f.circleColor ?? "#2A2A2A"} ring={f.avatarRing} />
            <View style={{ flex: 1 }}>
              <Text style={[s.friendName, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
              <Text style={[s.friendsDetail, { color: colors.muted }]} numberOfLines={1}>
                {f.lastVisit
                  ? `Var här ${visitDate(f.lastVisit)}${f.visits > 1 ? `  ·  ${f.visits} besök` : ""}`
                  : "Har sparat platsen"}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.faint} strokeWidth={2} />
          </TouchableOpacity>
        ))}
      </View>
    </Sheet>
  );
}

export function TreasureHint({ meters, found, name, onPress }: {
  /** Fågelvägen från platsen till skatten */
  meters: number;
  found: boolean;
  name: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const far = meters >= 50;
  return (
    <TouchableOpacity
      style={[s.treasure, { backgroundColor: colors.card, borderColor: withAlpha("#A78BFA", 0.4) }]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <TreasurePin height={38} found={found} />
      <View style={{ flex: 1 }}>
        <Text style={[s.friendsTitle, { color: colors.text }]} numberOfLines={2}>
          {found ? t("treasureHint.found", { name }) : far ? t("treasureHint.far", { distance: formatDistance(meters) }) : t("treasureHint.here")}
        </Text>
        <Text style={[s.friendsDetail, { color: colors.muted }]} numberOfLines={1}>
          {found
            ? far ? t("treasureHint.farShowMap", { distance: formatDistance(meters) }) : t("treasureHint.showMap")
            : t("treasureHint.findIt")}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.purple} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  friends: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  friendsTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, lineHeight: 20 },
  friendsDetail: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  friendName: { fontFamily: "Inter_600SemiBold", fontSize: 15.5 },
  treasure: {
    flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18,
    borderWidth: 1,
  },
});
