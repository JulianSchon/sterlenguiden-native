/** "Dina listor" på Mitt Österlen: horisontell rad med listor, skapa och gå med. */
import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useLists } from "@/hooks/useLists";
import { ListCover } from "./ListCover";
import { CreateListSheet } from "./CreateListSheet";
import { JoinListSheet } from "./JoinListSheet";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

export function ListsSection() {
  const router = useRouter();
  const { data: lists = [] } = useLists();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const openList = (id: string) => router.push(`/lists/${id}` as any);

  return (
    <View style={s.section}>
      <View style={s.head}>
        <Text style={s.title}>Dina listor</Text>
        <View style={s.actions}>
          <TouchableOpacity onPress={() => setJoinOpen(true)} hitSlop={8}>
            <Text style={s.action}>Gå med</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCreateOpen(true)} hitSlop={8}>
            <Text style={s.action}>+ Ny lista</Text>
          </TouchableOpacity>
        </View>
      </View>

      {lists.length === 0 ? (
        <Text style={s.empty}>Samla caféer, havsutsikter eller en bucket list, ensam eller tillsammans med andra.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {lists.map((l) => (
            <TouchableOpacity
              key={l.id}
              style={s.card}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                openList(l.id);
              }}
            >
              <ListCover images={l.images} size={140} />
              <Text style={s.name} numberOfLines={1}>{l.name}</Text>
              <Text style={s.sub}>
                {l.placeIds.length} platser{l.memberCount > 1 ? ` · ${l.memberCount} medlemmar` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <CreateListSheet visible={createOpen} onClose={() => setCreateOpen(false)} onCreated={openList} />
      <JoinListSheet visible={joinOpen} onClose={() => setJoinOpen(false)} onJoined={openList} />
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 32 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16 },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG },
  actions: { flexDirection: "row", gap: 16 },
  action: { fontFamily: "Inter_500Medium", fontSize: 13, color: GOLD },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, lineHeight: 21, paddingHorizontal: 16, marginTop: 10 },
  row: { paddingHorizontal: 16, gap: 12, marginTop: 14 },
  card: { width: 140 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG, marginTop: 8 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, marginTop: 1 },
});
