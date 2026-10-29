/** "Dina listor" på Mitt Österlen: horisontell rad med listor, skapa och gå med. */
import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useLists } from "@/hooks/useLists";
import { ListCover } from "./ListCover";
import { Skeleton } from "@/components/Skeleton";
import { CreateListSheet } from "./CreateListSheet";
import { JoinListSheet } from "./JoinListSheet";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { pushOnce } from "@/lib/navigateOnce";


export function ListsSection() {
  const s = useThemedStyles(createStyles);
  const router = useRouter();
  const { data: lists = [], isLoading } = useLists();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  useTranslation(); // ritas om när språket byts

  const openList = (id: string) => pushOnce(router, `/lists/${id}`);

  return (
    <View style={s.section}>
      <View style={s.head}>
        <Text style={s.title}>{i18n.t("lists.yours")}</Text>
        <View style={s.actions}>
          <TouchableOpacity onPress={() => setJoinOpen(true)} hitSlop={8}>
            <Text style={s.action}>{i18n.t("lists.join")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCreateOpen(true)} hitSlop={8}>
            <Text style={s.action}>{i18n.t("lists.new")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        // Listorna i grått medan de laddas (annars blinkar "inga listor"-texten förbi)
        <View style={[s.row, { flexDirection: "row" }]} pointerEvents="none">
          {[0, 1, 2].map((i) => (
            <View key={i} style={s.card}>
              <Skeleton width={140} height={140} radius={14} />
              <Skeleton width={100} height={13} radius={5} style={{ marginTop: 10 }} />
              <Skeleton width={70} height={10} radius={4} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      ) : lists.length === 0 ? (
        <Text style={s.empty}>{i18n.t("lists.yoursEmpty")}</Text>
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
              <ListCover coverImageUrl={l.coverImageUrl} images={l.images} size={140} />
              <Text style={s.name} numberOfLines={1}>{l.name}</Text>
              <Text style={s.sub}>
                {l.placeIds.length === 1 ? i18n.t("lists.placesOne") : i18n.t("lists.placesOther", { count: l.placeIds.length })}
                {l.memberCount > 1 ? ` · ${i18n.t("lists.membersCount", { count: l.memberCount })}` : ""}
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

const createStyles = (c: ThemeColors) => StyleSheet.create({
  section: { marginTop: 32 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16 },
  // Playfair bort — bara för personnamn i appen numera, sektionsrubriker delar Montserrat
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: c.text },
  actions: { flexDirection: "row", gap: 16 },
  action: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.goldText },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, lineHeight: 21, paddingHorizontal: 16, marginTop: 10 },
  row: { paddingHorizontal: 16, gap: 12, marginTop: 14 },
  card: { width: 140 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text, marginTop: 8 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12, color: c.muted, marginTop: 1 },
});
