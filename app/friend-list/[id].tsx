/**
 * En väns lista, öppnad från vännens profilsida — bara titta. Vännen har valt att visa listan för
 * sina vänner (lists.visible_to_friends); man ser platserna i listans ordning och kan öppna dem,
 * men inte ändra något. (Att bjuda in någon så att de kan redigera är en annan sak — då blir de
 * medlemmar och listan öppnas på den vanliga listsidan.)
 *
 * Listan hämtas med samma fråga som profilsidans rad (rpc_friend_lists), så den finns oftast redan.
 * Samma hårdkodat mörka stil som vännens profilsida.
 */
import { useMemo } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, MapPin } from "lucide-react-native";
import { useFriendLists } from "@/hooks/useLists";
import { useFriendProfile } from "@/hooks/useFriends";
import { usePlaces, firstImageUrl } from "@/hooks/usePlaces";
import { ListCover } from "@/components/lists/ListCover";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const CARD = "#1A1A1D";
const GOLD = "#C5A059";

export default function FriendListScreen() {
  const { id, owner } = useLocalSearchParams<{ id: string; owner: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: lists, isLoading } = useFriendLists(owner ?? null);
  const { data: friend } = useFriendProfile(owner ?? null);
  const { data: places = [] } = usePlaces();

  const list = lists?.find((l) => l.id === id) ?? null;
  const listPlaces = useMemo(() => {
    if (!list) return [];
    const byId = new Map(places.map((p) => [p.id, p]));
    return list.placeIds.map((pid) => byId.get(pid)).filter((p): p is NonNullable<typeof p> => !!p);
  }, [list, places]);
  const images = listPlaces.map((p) => firstImageUrl(p.image_url)).filter((u): u is string => !!u).slice(0, 4);
  const who = friend?.displayName || friend?.username || "";

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{list?.name ?? ""}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
        {isLoading && <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />}
        {!isLoading && !list && (
          <Text style={s.empty}>Listan går inte att visa längre.</Text>
        )}
        {list && (
          <>
            <View style={s.hero}>
              <ListCover coverImageUrl={list.coverImageUrl} images={images} width={width - 32} height={(width - 32) * 0.56} />
              <Text style={s.name}>{list.name}</Text>
              {list.description ? <Text style={s.description}>{list.description}</Text> : null}
              <Text style={s.meta}>
                {listPlaces.length} {listPlaces.length === 1 ? "plats" : "platser"}{who ? ` · Lista av ${who}` : ""}
              </Text>
            </View>

            {listPlaces.length > 0 && (
              <View style={s.card}>
                {listPlaces.map((p, i) => {
                  const image = firstImageUrl(p.image_url);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[s.row, i > 0 && s.rowBorder]}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/place/${p.id}` as any)}
                    >
                      {image ? (
                        <Image source={{ uri: image }} style={s.thumb} />
                      ) : (
                        <View style={[s.thumb, s.thumbEmpty]}><MapPin size={18} color={GOLD} strokeWidth={2} /></View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={s.placeName} numberOfLines={1}>{p.name}</Text>
                        {p.nearest_town ? <Text style={s.placeTown} numberOfLines={1}>{p.nearest_town}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  // Samma header och tillbaka-knapp som vännens profilsida
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  headerTitle: {
    flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG,
    textTransform: "uppercase",
  },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 40, paddingHorizontal: 30 },
  hero: { paddingHorizontal: 16, paddingTop: 8 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 22, letterSpacing: -0.2, color: FG, marginTop: 16 },
  description: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: "rgba(245,241,232,0.8)", marginTop: 6 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 6 },
  card: {
    marginTop: 20, marginHorizontal: 16, borderRadius: 16, backgroundColor: CARD,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  thumbEmpty: { backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  placeName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  placeTown: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 2 },
});
